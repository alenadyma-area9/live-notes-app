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
    // Check for initial title from duplication
    const initialTitle = await this.room.storage.get<string>("initialTitle");
    // Check lock state from storage (source of truth)
    const isLocked = await this.room.storage.get<boolean>("locked");

    return onConnect(conn, this.room, {
      persist: { mode: "snapshot" },
      callback: {
        handler: async (ydoc) => {
          const meta = ydoc.getMap("meta");

          // Sync lock state from storage to Y.Doc (storage is source of truth)
          if (isLocked !== undefined) {
            const docLocked = meta.get("locked");
            if (docLocked !== isLocked) {
              meta.set("locked", isLocked);
            }
          }

          // Apply initial title if this is a duplicated note
          if (initialTitle) {
            if (!meta.get("title")) {
              meta.set("title", initialTitle);
              meta.set("titleEdited", "true");
            }
            // Clear the initial title so it's not applied again
            await this.room.storage.delete("initialTitle");
          }

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

    // POST /restore/:id - returns the version state for client to apply
    if (req.method === "POST" && url.pathname.includes("/restore/")) {
      try {
        const versionId = url.pathname.split("/restore/")[1];
        const stateBase64 = await this.room.storage.get<string>(`version:${versionId}`);

        if (!stateBase64) {
          return Response.json({ error: "Version not found" }, { status: 404, headers: corsHeaders });
        }

        // Save current state before restore
        const ydoc = await unstable_getYDoc(this.room);
        if (ydoc) {
          await this.forceSaveVersion(ydoc);
        }

        // Clear the hash so changes are tracked fresh
        await this.room.storage.delete("lastStateHash");

        // Return the version state for client to apply
        return Response.json({ success: true, state: stateBase64 }, { headers: corsHeaders });
      } catch (err) {
        console.error("Restore error:", err);
        return Response.json({ error: "Failed to restore" }, { status: 500, headers: corsHeaders });
      }
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

    // POST /lock - toggle lock status
    if (req.method === "POST" && url.pathname.endsWith("/lock")) {
      try {
        const body = await req.json() as { locked: boolean };

        // Store in room storage (works without active connections)
        await this.room.storage.put("locked", body.locked);

        // Also try to update Y.Doc if available (for active clients)
        try {
          const ydoc = await unstable_getYDoc(this.room);
          if (ydoc) {
            const meta = ydoc.getMap("meta");
            meta.set("locked", body.locked);
          }
        } catch {
          // Y.Doc not available, that's OK - storage is updated
        }

        return Response.json({ success: true, locked: body.locked }, { headers: corsHeaders });
      } catch (err) {
        console.error("Lock error:", err);
        return Response.json({ error: "Failed to toggle lock" }, { status: 500, headers: corsHeaders });
      }
    }

    // GET /lock-status - check lock status
    if (req.method === "GET" && url.pathname.endsWith("/lock-status")) {
      try {
        const locked = await this.room.storage.get<boolean>("locked") || false;
        return Response.json({ locked }, { headers: corsHeaders });
      } catch (err) {
        console.error("Lock status error:", err);
        return Response.json({ locked: false }, { headers: corsHeaders });
      }
    }

    // GET /status - check if note is deleted
    if (req.method === "GET" && url.pathname.endsWith("/status")) {
      try {
        const ydoc = await unstable_getYDoc(this.room);
        let deleted = false;
        if (ydoc) {
          const meta = ydoc.getMap("meta");
          deleted = meta.get("deleted") === true;
        }
        return Response.json({ deleted }, { headers: corsHeaders });
      } catch (err) {
        console.error("Status error:", err);
        return Response.json({ deleted: false }, { headers: corsHeaders });
      }
    }

    // POST /save-version - force save version (on user leave)
    if (req.method === "POST" && url.pathname.endsWith("/save-version")) {
      // This is best-effort - don't fail if doc is unavailable
      try {
        const ydoc = await unstable_getYDoc(this.room);
        if (ydoc) {
          await this.forceSaveVersion(ydoc);
        }
      } catch (err) {
        // Silently ignore - doc may be unavailable after disconnect
        console.log("Save version skipped (doc unavailable):", err instanceof Error ? err.message : err);
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // GET /state - get current document state (for duplication)
    if (req.method === "GET" && url.pathname.endsWith("/state")) {
      try {
        let stateBase64: string | undefined;
        let title = "";

        // Try to get live Y.Doc first (if there are active connections)
        try {
          const ydoc = await unstable_getYDoc(this.room);
          if (ydoc) {
            const state = Y.encodeStateAsUpdate(ydoc);
            stateBase64 = uint8ArrayToBase64(state);
            const meta = ydoc.getMap("meta");
            title = (meta.get("title") as string) || "";
          }
        } catch {
          // Y.Doc not available (no active connections) - fall back to snapshot
        }

        // Fall back to persisted snapshot if Y.Doc unavailable
        if (!stateBase64) {
          stateBase64 = await this.room.storage.get<string>("ydoc:default");
          if (stateBase64) {
            // Extract title from the snapshot
            const tempDoc = new Y.Doc();
            Y.applyUpdate(tempDoc, base64ToUint8Array(stateBase64));
            const meta = tempDoc.getMap("meta");
            title = (meta.get("title") as string) || "";
            tempDoc.destroy();
          }
        }

        if (!stateBase64) {
          return Response.json({ error: "Document not found" }, { status: 404, headers: corsHeaders });
        }

        return Response.json({ state: stateBase64, title }, { headers: corsHeaders });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("State error:", errorMessage, err);
        return Response.json({ error: `Failed to get state: ${errorMessage}` }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /init - initialize note with content (for duplication)
    if (req.method === "POST" && url.pathname.endsWith("/init")) {
      try {
        const body = await req.json() as { state: string; title?: string };

        if (!body.state) {
          return Response.json({ error: "Missing state" }, { status: 400, headers: corsHeaders });
        }

        // Store the initial state - it will be applied when client connects
        // y-partykit uses "ydoc:default" key for the snapshot
        await this.room.storage.put("ydoc:default", body.state);

        // Also store title for when client connects
        if (body.title) {
          await this.room.storage.put("initialTitle", body.title);
        }

        // No versions for duplicated note
        await this.room.storage.put("versions", []);

        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("Init error:", errorMessage, err);
        return Response.json({ error: `Failed to initialize: ${errorMessage}` }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }

  async maybeSaveVersion(ydoc: Y.Doc) {
    const now = Date.now();
    const IDLE_THRESHOLD = 60000;      // 60 seconds idle before saving
    const MIN_CHAR_CHANGE = 20;        // Minimum 20 chars changed
    const MIN_CONTENT_LENGTH = 10;     // Don't save if content < 10 chars
    const MIN_TIME_BETWEEN = 30000;    // Minimum 30 seconds between versions

    // Get text content for character counting
    const xmlFragment = ydoc.getXmlFragment("default");
    const contentText = xmlFragment.toString();
    const currentLength = contentText.length;

    // Skip if content is too short (empty or nearly empty note)
    if (currentLength < MIN_CONTENT_LENGTH) {
      return;
    }

    // Get current document state
    const state = Y.encodeStateAsUpdate(ydoc);
    const stateBase64 = uint8ArrayToBase64(state);
    const currentHash = this.simpleHash(stateBase64);

    // Check if identical to last saved state
    const lastStateHash = await this.room.storage.get<string>("lastStateHash");
    if (lastStateHash === currentHash) {
      return;
    }

    // Check if identical to most recent version (avoid duplicates)
    const versions = await this.room.storage.get<Version[]>("versions") || [];
    if (versions.length > 0) {
      const lastVersionState = await this.room.storage.get<string>(`version:${versions[0].id}`);
      if (lastVersionState) {
        const lastVersionHash = this.simpleHash(lastVersionState);
        if (lastVersionHash === currentHash) {
          // Content is same as last version, just update tracking
          await this.room.storage.put("lastStateHash", currentHash);
          return;
        }
      }
    }

    // Track editing activity
    const lastActivity = await this.room.storage.get<number>("lastActivity") || now;
    const lastSavedLength = await this.room.storage.get<number>("lastSavedLength") || 0;

    // Update last activity time
    await this.room.storage.put("lastActivity", now);

    // Check if enough time has passed since last version
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
    await this.saveVersionInternal(ydoc, stateBase64, currentHash, currentLength, now);
  }

  async forceSaveVersion(ydoc: Y.Doc) {
    const now = Date.now();
    const MIN_CONTENT_LENGTH = 10;     // Don't save if content < 10 chars
    const MIN_TIME_BETWEEN = 30000;    // Minimum 30 seconds between versions

    // Get text content
    const xmlFragment = ydoc.getXmlFragment("default");
    const contentText = xmlFragment.toString();
    const currentLength = contentText.length;

    // Skip if content is too short
    if (currentLength < MIN_CONTENT_LENGTH) {
      return;
    }

    // Get current document state
    const state = Y.encodeStateAsUpdate(ydoc);
    const stateBase64 = uint8ArrayToBase64(state);
    const currentHash = this.simpleHash(stateBase64);

    // Check if identical to last saved state
    const lastStateHash = await this.room.storage.get<string>("lastStateHash");
    if (lastStateHash === currentHash) {
      return;
    }

    // Check minimum time between versions
    const lastVersionSave = await this.room.storage.get<number>("lastVersionSave") || 0;
    if (now - lastVersionSave < MIN_TIME_BETWEEN) {
      // Just update tracking, don't create new version
      await this.room.storage.put("lastStateHash", currentHash);
      return;
    }

    // Check if identical to most recent version
    const versions = await this.room.storage.get<Version[]>("versions") || [];
    if (versions.length > 0) {
      const lastVersionState = await this.room.storage.get<string>(`version:${versions[0].id}`);
      if (lastVersionState) {
        const lastVersionHash = this.simpleHash(lastVersionState);
        if (lastVersionHash === currentHash) {
          await this.room.storage.put("lastStateHash", currentHash);
          return;
        }
      }
    }

    // Save version
    await this.saveVersionInternal(ydoc, stateBase64, currentHash, currentLength, now);
  }

  private async saveVersionInternal(
    ydoc: Y.Doc,
    stateBase64: string,
    currentHash: string,
    currentLength: number,
    now: number
  ) {
    const versions = await this.room.storage.get<Version[]>("versions") || [];
    const meta = ydoc.getMap("meta");
    const title = meta.get("title") as string || "Untitled";

    const lastActiveUser = await this.room.storage.get<UserInfo>("lastActiveUser");
    const editedBy = lastActiveUser?.name || "Unknown";
    const editorColor = lastActiveUser?.color || "#888888";

    const versionId = `v_${now}`;

    // Store the version content
    await this.room.storage.put(`version:${versionId}`, stateBase64);

    // Create version entry
    const newVersion: Version = {
      id: versionId,
      timestamp: now,
      title,
      editedBy,
      editorColor,
    };

    // Update versions list (keep last 50)
    const updatedVersions = [newVersion, ...versions].slice(0, 50);
    await this.room.storage.put("versions", updatedVersions);
    await this.room.storage.put("lastVersionSave", now);
    await this.room.storage.put("lastStateHash", currentHash);
    await this.room.storage.put("lastSavedLength", currentLength);
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
