import type * as Party from "partykit/server";
import { onConnect, unstable_getYDoc } from "y-partykit";
import * as Y from "yjs";

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy: string;
  editorColor: string;
  windowStart?: number;  // Start of editing window
  windowEnd?: number;    // End of editing window
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

    // POST /delete - mark note as deleted
    if (req.method === "POST" && url.pathname.endsWith("/delete")) {
      try {
        const ydoc = await unstable_getYDoc(this.room);
        if (ydoc) {
          const meta = ydoc.getMap("meta");
          meta.set("deleted", true);

          // Clear content but keep title for reference
          const content = ydoc.getXmlFragment("default");
          if (content.length > 0) {
            content.delete(0, content.length);
          }
        }

        // Clear versions
        await this.room.storage.put("versions", []);

        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        console.error("Delete error:", err);
        return Response.json({ error: "Failed to delete" }, { status: 500, headers: corsHeaders });
      }
    }

    // GET /status - check if note is deleted
    if (req.method === "GET" && url.pathname.endsWith("/status")) {
      const ydoc = await unstable_getYDoc(this.room);
      let deleted = false;
      if (ydoc) {
        const meta = ydoc.getMap("meta");
        deleted = meta.get("deleted") === true;
      }
      return Response.json({ deleted }, { headers: corsHeaders });
    }

    // POST /save-version - force save version (on user leave)
    if (req.method === "POST" && url.pathname.endsWith("/save-version")) {
      const ydoc = await unstable_getYDoc(this.room);
      if (ydoc) {
        await this.forceSaveVersion(ydoc);
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }

  async maybeSaveVersion(ydoc: Y.Doc) {
    const now = Date.now();
    const IDLE_THRESHOLD = 60000;      // 60 seconds idle before saving
    const MIN_CHAR_CHANGE = 20;        // Minimum 20 chars changed
    const TIME_WINDOW = 5 * 60 * 1000; // 5 minute windows

    // Get current document state and content length
    const state = Y.encodeStateAsUpdate(ydoc);
    const stateBase64 = uint8ArrayToBase64(state);
    const currentHash = this.simpleHash(stateBase64);

    // Get text content for character counting
    const xmlFragment = ydoc.getXmlFragment("default");
    const currentLength = xmlFragment.toString().length;

    // Check if content actually changed (by hash)
    const lastStateHash = await this.room.storage.get<string>("lastStateHash");
    if (lastStateHash === currentHash) {
      return;
    }

    // Track editing activity
    const lastActivity = await this.room.storage.get<number>("lastActivity") || now;
    const windowStart = await this.room.storage.get<number>("windowStart") || now;
    const lastSavedLength = await this.room.storage.get<number>("lastSavedLength") || 0;

    // Update last activity time
    await this.room.storage.put("lastActivity", now);

    // If this is first activity or new window (after 5 min gap), start new window
    if (now - lastActivity > TIME_WINDOW) {
      await this.room.storage.put("windowStart", now);
      await this.room.storage.put("pendingStateBase64", stateBase64);
      await this.room.storage.put("pendingStateHash", currentHash);
      return;
    }

    // Store pending state (most recent state in current window)
    await this.room.storage.put("pendingStateBase64", stateBase64);
    await this.room.storage.put("pendingStateHash", currentHash);
    await this.room.storage.put("pendingLength", currentLength);

    // Check if enough time has passed since last save (idle threshold)
    const lastVersionSave = await this.room.storage.get<number>("lastVersionSave") || 0;
    if (now - lastVersionSave < IDLE_THRESHOLD) {
      return;
    }

    // Check if enough content changed
    const charDiff = Math.abs(currentLength - lastSavedLength);
    if (charDiff < MIN_CHAR_CHANGE) {
      return;
    }

    // All conditions met - save version
    const versions = await this.room.storage.get<Version[]>("versions") || [];
    const meta = ydoc.getMap("meta");
    const title = meta.get("title") as string || "Untitled";

    const lastActiveUser = await this.room.storage.get<UserInfo>("lastActiveUser");
    const editedBy = lastActiveUser?.name || "Unknown";
    const editorColor = lastActiveUser?.color || "#888888";

    const actualWindowStart = await this.room.storage.get<number>("windowStart") || now;
    const versionId = `v_${now}`;

    // Store the version content
    await this.room.storage.put(`version:${versionId}`, stateBase64);

    // Update versions list (keep last 50)
    const newVersion: Version = {
      id: versionId,
      timestamp: now,
      title,
      editedBy,
      editorColor,
      windowStart: actualWindowStart,
      windowEnd: now,
    };

    const updatedVersions = [newVersion, ...versions].slice(0, 50);
    await this.room.storage.put("versions", updatedVersions);
    await this.room.storage.put("lastVersionSave", now);
    await this.room.storage.put("lastStateHash", currentHash);
    await this.room.storage.put("lastSavedLength", currentLength);

    // Start new window for next batch
    await this.room.storage.put("windowStart", now);
  }

  async forceSaveVersion(ydoc: Y.Doc) {
    const now = Date.now();

    // Get current document state
    const state = Y.encodeStateAsUpdate(ydoc);
    const stateBase64 = uint8ArrayToBase64(state);
    const currentHash = this.simpleHash(stateBase64);

    // Check if content actually changed (by hash) - skip if identical
    const lastStateHash = await this.room.storage.get<string>("lastStateHash");
    if (lastStateHash === currentHash) {
      return;
    }

    // Get text content length for tracking
    const xmlFragment = ydoc.getXmlFragment("default");
    const currentLength = xmlFragment.toString().length;

    // Always save on exit (no char threshold check)
    // Save version
    const versions = await this.room.storage.get<Version[]>("versions") || [];
    const meta = ydoc.getMap("meta");
    const title = meta.get("title") as string || "Untitled";

    const lastActiveUser = await this.room.storage.get<UserInfo>("lastActiveUser");
    const editedBy = lastActiveUser?.name || "Unknown";
    const editorColor = lastActiveUser?.color || "#888888";

    const windowStart = await this.room.storage.get<number>("windowStart") || now;
    const versionId = `v_${now}`;

    await this.room.storage.put(`version:${versionId}`, stateBase64);

    const newVersion: Version = {
      id: versionId,
      timestamp: now,
      title,
      editedBy,
      editorColor,
      windowStart,
      windowEnd: now,
    };

    const updatedVersions = [newVersion, ...versions].slice(0, 50);
    await this.room.storage.put("versions", updatedVersions);
    await this.room.storage.put("lastVersionSave", now);
    await this.room.storage.put("lastStateHash", currentHash);
    await this.room.storage.put("lastSavedLength", currentLength);
    await this.room.storage.put("windowStart", now);
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
