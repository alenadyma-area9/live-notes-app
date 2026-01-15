import type * as Party from "partykit/server";
import { onConnect, unstable_getYDoc } from "y-partykit";
import * as Y from "yjs";

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy: string;
  editorColor: string;
  isCreation?: boolean;  // True for the initial "note created" entry
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
          const meta = ydoc.getMap("meta");

          // Only initialize lock from storage if Y.Doc has no lock value yet
          // This handles fresh connections but won't override user's lock changes
          if (meta.get("locked") === undefined) {
            const storedLocked = await this.room.storage.get<boolean>("locked");
            if (storedLocked !== undefined) {
              meta.set("locked", storedLocked);
            }
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

        // Check if this is a brand new note (no creation entry yet)
        await this.maybeCreateInitialVersion(body.user);

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

    // POST /restore/:id - restore version on server and return state
    if (req.method === "POST" && url.pathname.includes("/restore/")) {
      try {
        const versionId = url.pathname.split("/restore/")[1];
        const stateBase64 = await this.room.storage.get<string>(`version:${versionId}`);

        if (!stateBase64) {
          return Response.json({ error: "Version not found" }, { status: 404, headers: corsHeaders });
        }

        const ydoc = await unstable_getYDoc(this.room);
        if (ydoc) {
          // 1. Save current state before restore
          await this.forceSaveVersion(ydoc, "restore");

          // 2. Apply the old version state to the Y.Doc
          const stateBytes = base64ToUint8Array(stateBase64);

          // Create temp doc to get the old content
          const tempDoc = new Y.Doc();
          Y.applyUpdate(tempDoc, stateBytes);

          // Get fragments
          const currentFragment = ydoc.getXmlFragment("default");
          const tempFragment = tempDoc.getXmlFragment("default");

          // Clear current and copy from old version
          ydoc.transact(() => {
            // Delete current content
            if (currentFragment.length > 0) {
              currentFragment.delete(0, currentFragment.length);
            }

            // Copy old content - use toArray and insert
            const children = tempFragment.toArray();
            for (const child of children) {
              currentFragment.push([child.clone()]);
            }
          });

          // Restore title from old version
          const tempMeta = tempDoc.getMap("meta");
          const oldTitle = tempMeta.get("title") as string;
          if (oldTitle) {
            const meta = ydoc.getMap("meta");
            meta.set("title", oldTitle);
          }

          tempDoc.destroy();

          // 3. Save the restored version
          await this.forceSaveVersion(ydoc, "restore");
        }

        // Clear the hash so changes are tracked fresh
        await this.room.storage.delete("lastStateHash");

        // Return success and the state for client to sync title
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

    // GET /exists - check if note exists (has been created)
    if (req.method === "GET" && url.pathname.endsWith("/exists")) {
      try {
        // Check if note has any stored data
        const hasCreation = await this.room.storage.get<boolean>("hasCreationEntry");
        const hasSnapshot = await this.room.storage.get<string>("ydoc:default");
        const versions = await this.room.storage.get<Version[]>("versions");

        const exists = !!(hasCreation || hasSnapshot || (versions && versions.length > 0));
        return Response.json({ exists }, { headers: corsHeaders });
      } catch (err) {
        console.error("Exists check error:", err);
        return Response.json({ exists: false }, { headers: corsHeaders });
      }
    }

    // POST /save-version - force save version
    // Query param ?mode=manual|idle|pageClose (default: pageClose)
    if (req.method === "POST" && url.pathname.endsWith("/save-version")) {
      const mode = (url.searchParams.get("mode") || "pageClose") as "manual" | "idle" | "pageClose";

      try {
        const ydoc = await unstable_getYDoc(this.room);
        if (ydoc) {
          await this.forceSaveVersion(ydoc, mode);
        }
      } catch (err) {
        // Silently ignore - doc may be unavailable after disconnect
      }
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // GET /state - get current document state (for duplication)
    if (req.method === "GET" && url.pathname.endsWith("/state")) {
      try {
        // Get the Y.Doc (creates/loads from persistence if needed)
        const ydoc = await unstable_getYDoc(this.room, { persist: { mode: "snapshot" } });

        if (!ydoc) {
          return Response.json({ error: "Document not found" }, { status: 404, headers: corsHeaders });
        }

        const state = Y.encodeStateAsUpdate(ydoc);
        const stateBase64 = uint8ArrayToBase64(state);
        const meta = ydoc.getMap("meta");
        const title = (meta.get("title") as string) || "";

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
        const body = await req.json() as { state?: string | null; title?: string };

        // Apply state directly to Y.Doc using unstable_getYDoc
        // This is more reliable than the load() callback
        if (body.state) {
          const ydoc = await unstable_getYDoc(this.room, { persist: { mode: "snapshot" } });
          const stateBytes = base64ToUint8Array(body.state);
          Y.applyUpdate(ydoc, stateBytes);

          // Set metadata - delete old values first to ensure our values win in Y.js conflict resolution
          const meta = ydoc.getMap("meta");
          if (body.title) {
            meta.delete("title");
            meta.delete("titleEdited");
            meta.set("title", body.title);
            meta.set("titleEdited", "true");
          }
          meta.set("locked", false);
          meta.delete("deleted");
          meta.delete("ownerId");
          meta.delete("ownerName");

          console.log("[/init] Applied state directly to Y.Doc, size:", stateBytes.length);
        } else if (body.title) {
          // No state but have title - just set the title
          const ydoc = await unstable_getYDoc(this.room, { persist: { mode: "snapshot" } });
          const meta = ydoc.getMap("meta");
          meta.set("title", body.title);
          meta.set("titleEdited", "true");
          meta.set("locked", false);
        }

        // Ensure duplicate starts unlocked
        await this.room.storage.put("locked", false);

        // Create "Duplicated" entry in version history
        const now = Date.now();
        const versionId = `v_${now}_duplicated`;
        const duplicatedVersion: Version = {
          id: versionId,
          timestamp: now,
          title: body.title || "",
          editedBy: "System",
          editorColor: "#888888",
          isCreation: true,
        };

        // Store the initial state for this version
        if (body.state) {
          await this.room.storage.put(`version:${versionId}`, body.state);
        }

        await this.room.storage.put("versions", [duplicatedVersion]);
        await this.room.storage.put("hasCreationEntry", true);

        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("Init error:", errorMessage, err);
        return Response.json({ error: `Failed to initialize: ${errorMessage}` }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }

  // Helper: count words in text
  countWords(text: string): number {
    const cleaned = text.replace(/<[^>]*>/g, ' ').trim();
    if (!cleaned) return 0;
    return cleaned.split(/\s+/).filter(w => w.length > 0).length;
  }

  // Helper: get content hash based on title + text only (not Yjs internals)
  getContentHash(ydoc: Y.Doc): { hash: string; title: string; text: string; wordCount: number } {
    const meta = ydoc.getMap("meta");
    const title = (meta.get("title") as string) || "";
    const xmlFragment = ydoc.getXmlFragment("default");
    const text = xmlFragment.toString();
    const wordCount = this.countWords(text);
    const hash = this.simpleHash(title + text);
    return { hash, title, text, wordCount };
  }

  // Check if change is significant (>10% or >200 words)
  isSignificantChange(currentWords: number, lastWords: number): boolean {
    const wordDiff = Math.abs(currentWords - lastWords);
    if (wordDiff >= 200) return true;
    if (lastWords === 0) return currentWords >= 20; // New content
    const percentChange = (wordDiff / lastWords) * 100;
    return percentChange >= 10;
  }

  async forceSaveVersion(ydoc: Y.Doc, mode: "manual" | "idle" | "pageClose" | "restore" = "manual") {
    const now = Date.now();
    const MIN_CONTENT_LENGTH = 10;

    // Get content info
    const { hash: currentHash, text, wordCount } = this.getContentHash(ydoc);
    const contentLength = text.length;

    // Skip if content is too short
    if (contentLength < MIN_CONTENT_LENGTH) {
      return;
    }

    // Check if identical to most recent saved version (avoid duplicates)
    const lastVersionHash = await this.room.storage.get<string>("lastVersionContentHash");
    if (lastVersionHash === currentHash) {
      return;
    }

    // For idle auto-save, check if change is significant
    if (mode === "idle") {
      const lastWordCount = await this.room.storage.get<number>("lastVersionWordCount") || 0;
      if (!this.isSignificantChange(wordCount, lastWordCount)) {
        return;
      }
    }

    // Get full state for storage
    const state = Y.encodeStateAsUpdate(ydoc);
    const stateBase64 = uint8ArrayToBase64(state);

    // Save version
    await this.saveVersionInternal(ydoc, stateBase64, currentHash, wordCount, now);
  }

  // Legacy method - now redirects to forceSaveVersion
  async maybeSaveVersion(ydoc: Y.Doc) {
    // This is called on connect - only save if significant change
    const { text } = this.getContentHash(ydoc);
    if (text.length < 10) return;

    const lastWordCount = await this.room.storage.get<number>("lastVersionWordCount") || 0;
    const currentWordCount = this.countWords(text);

    if (this.isSignificantChange(currentWordCount, lastWordCount)) {
      await this.forceSaveVersion(ydoc, "idle");
    }
  }



  private async saveVersionInternal(
    ydoc: Y.Doc,
    stateBase64: string,
    contentHash: string,
    wordCount: number,
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
    await this.room.storage.put("lastVersionContentHash", contentHash);
    await this.room.storage.put("lastVersionWordCount", wordCount);
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

  async maybeCreateInitialVersion(user: UserInfo) {
    // Check if we already have a creation entry
    const hasCreation = await this.room.storage.get<boolean>("hasCreationEntry");
    if (hasCreation) {
      return;
    }

    // Mark that we're creating the initial entry
    await this.room.storage.put("hasCreationEntry", true);

    const now = Date.now();
    const versionId = `v_${now}_created`;

    // Get current versions (should be empty for new note)
    const versions = await this.room.storage.get<Version[]>("versions") || [];

    // Create the initial "note created" entry
    const creationVersion: Version = {
      id: versionId,
      timestamp: now,
      title: "",  // Empty title for new note
      editedBy: user.name,
      editorColor: user.color,
      isCreation: true,
    };

    // Store empty state for this version (so it can be "restored" to empty)
    const emptyDoc = new Y.Doc();
    const emptyState = Y.encodeStateAsUpdate(emptyDoc);
    const stateBase64 = uint8ArrayToBase64(emptyState);
    await this.room.storage.put(`version:${versionId}`, stateBase64);
    emptyDoc.destroy();

    // Add to versions list (at the end since it's the oldest)
    const updatedVersions = [...versions, creationVersion];
    await this.room.storage.put("versions", updatedVersions);
  }

  onClose(conn: Party.Connection) {
    this.activeUsers.delete(conn.id);
  }
}
