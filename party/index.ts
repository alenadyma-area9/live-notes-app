import type * as Party from "partykit/server";
import { onConnect, unstable_getYDoc } from "y-partykit";
import * as Y from "yjs";

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy: string;
  editorColor: string;
}

interface UserInfo {
  name: string;
  color: string;
}

// Helper functions for base64 encoding/decoding
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export default class YjsServer implements Party.Server {
  // Track active users by connection id
  activeUsers: Map<string, UserInfo> = new Map();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection) {
    return onConnect(conn, this.room, {
      persist: { mode: "snapshot" },
      callback: {
        handler: async (ydoc) => {
          await this.maybeSaveVersion(ydoc);
        },
      },
    });
  }

  async onRequest(req: Party.Request): Promise<Response> {
    const url = new URL(req.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /user - register user info
    if (req.method === "POST" && url.pathname.endsWith("/user")) {
      try {
        const body = await req.json() as { connectionId: string; user: UserInfo };
        this.activeUsers.set(body.connectionId, body.user);

        // Also store in persistent storage for version attribution
        await this.room.storage.put(`user:${body.connectionId}`, body.user);
        await this.room.storage.put("lastActiveUser", body.user);

        return Response.json({ success: true }, { headers: corsHeaders });
      } catch {
        return Response.json({ error: "Invalid body" }, { status: 400, headers: corsHeaders });
      }
    }

    // GET /versions
    if (req.method === "GET" && url.pathname.endsWith("/versions")) {
      const versions = await this.room.storage.get<Version[]>("versions") || [];
      return Response.json(versions, { headers: corsHeaders });
    }

    // GET /version/:id
    if (req.method === "GET" && url.pathname.includes("/version/")) {
      const versionId = url.pathname.split("/version/")[1];
      const stateBase64 = await this.room.storage.get<string>(`version:${versionId}`);

      if (!stateBase64) {
        return Response.json({ error: "Version not found" }, { status: 404, headers: corsHeaders });
      }

      return Response.json({ id: versionId, state: stateBase64 }, { headers: corsHeaders });
    }

    // POST /restore/:id
    if (req.method === "POST" && url.pathname.includes("/restore/")) {
      const versionId = url.pathname.split("/restore/")[1];
      const stateBase64 = await this.room.storage.get<string>(`version:${versionId}`);

      if (!stateBase64) {
        return Response.json({ error: "Version not found" }, { status: 404, headers: corsHeaders });
      }

      const ydoc = await unstable_getYDoc(this.room);
      if (ydoc) {
        const state = base64ToUint8Array(stateBase64);
        Y.applyUpdate(ydoc, state);

        await this.room.storage.delete("lastStateHash");
        await this.maybeSaveVersion(ydoc);
      }

      return Response.json({ success: true }, { headers: corsHeaders });
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }

  async maybeSaveVersion(ydoc: Y.Doc) {
    const now = Date.now();
    const lastSave = await this.room.storage.get<number>("lastVersionSave");

    // Save at most every 5 seconds
    if (lastSave && now - lastSave < 5000) {
      return;
    }

    // Get current document state
    const state = Y.encodeStateAsUpdate(ydoc);
    const stateBase64 = uint8ArrayToBase64(state);

    // Check if content actually changed
    const lastStateHash = await this.room.storage.get<string>("lastStateHash");
    const currentHash = this.simpleHash(stateBase64);

    if (lastStateHash === currentHash) {
      return;
    }

    const versions = await this.room.storage.get<Version[]>("versions") || [];
    const meta = ydoc.getMap("meta");
    const title = meta.get("title") as string || "Untitled";

    // Get last active user from storage (persisted by /user endpoint)
    const lastActiveUser = await this.room.storage.get<UserInfo>("lastActiveUser");
    const editedBy = lastActiveUser?.name || "Unknown";
    const editorColor = lastActiveUser?.color || "#888888";

    const versionId = `v_${now}`;

    // Store the version content
    await this.room.storage.put(`version:${versionId}`, stateBase64);

    // Update versions list (keep last 100)
    const newVersion: Version = {
      id: versionId,
      timestamp: now,
      title,
      editedBy,
      editorColor,
    };

    const updatedVersions = [newVersion, ...versions].slice(0, 100);
    await this.room.storage.put("versions", updatedVersions);
    await this.room.storage.put("lastVersionSave", now);
    await this.room.storage.put("lastStateHash", currentHash);
  }

  simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  onClose(conn: Party.Connection) {
    this.activeUsers.delete(conn.id);
  }
}
