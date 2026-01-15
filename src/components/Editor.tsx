import { useEffect, useState, useRef, useCallback } from "react";
import { Box, HStack, VStack, Input, IconButton, Button, Text, Tooltip, Menu, Portal, useBreakpointValue } from "@chakra-ui/react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import { LuHistory, LuShare2, LuCheck, LuTrash2, LuExternalLink, LuCopy, LuLock, LuLockOpen, LuPenLine, LuUnlink, LuSave, LuCloud, LuArrowLeft, LuEllipsisVertical, LuCircleX } from "react-icons/lu";
import { Toolbar } from "./Toolbar";
import { CollaboratorsList } from "./CollaboratorsList";
import { HistoryPanel } from "./HistoryPanel";
import type { ViewMode } from "./HistoryPanel";
import { InlineDiffView } from "./InlineDiffView";
import { ConfirmDialog } from "./ConfirmDialog";

import { useAppStore } from "../store";


interface EditorProps {
  noteId: string;
  partykitHost: string;
  onTitleChange?: (title: string) => void;
  onBack?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onDuplicate?: (newNoteId: string, newTitle: string) => void;
  autoDuplicate?: boolean;
  autoLockAction?: 'lock' | 'unlock' | null;
  onLockActionComplete?: () => void;
  shareButtonState?: "default" | "copied";
}

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy?: string;
  editorColor?: string;
}

interface PreviewState {
  doc: Y.Doc;
  version: Version;
}

interface CompareState {
  oldDoc: Y.Doc;
  newDoc: Y.Doc;
  oldVersion: Version;
  versionId: string;
}

export function CollaborativeEditor({
  noteId,
  partykitHost,
  onTitleChange,
  onBack,
  onShare,
  onDelete,
  onDuplicate,
  autoDuplicate,
  autoLockAction,
  onLockActionComplete,
  shareButtonState = "default"
}: EditorProps) {
  const { userName, userColor, userId, recentNotes, updateNoteOwner, removeRecentNote, updateNotePreview, updateNoteLocked, isNoteOwner } = useAppStore();
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [isUserRegistered, setIsUserRegistered] = useState(false);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false);
  const isOwner = isNoteOwner(noteId);

  // Check for pending duplicate title in sessionStorage
  const getInitialTitle = () => {
    const duplicateData = sessionStorage.getItem(`duplicate:${noteId}`);
    if (duplicateData) {
      try {
        const { title } = JSON.parse(duplicateData);
        return title || "";
      } catch {
        return "";
      }
    }
    return "";
  };
  const [title, setTitle] = useState(getInitialTitle);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("editing");
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [compareState, setCompareState] = useState<CompareState | null>(null);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "info" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2000);
  }, []);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<YPartyKitProvider | null>(null);
  const titleMapRef = useRef<Y.Map<unknown> | null>(null);
  const connectionIdRef = useRef<string>("");
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  // Generate new connection ID on each mount
  if (!connectionIdRef.current) {
    connectionIdRef.current = Math.random().toString(36).substring(2) + Date.now();
  }

  // Initialize once
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }
  if (!providerRef.current) {
    providerRef.current = new YPartyKitProvider(
      partykitHost,
      noteId,
      ydocRef.current,
      { party: "notes" }
    );
  }

  const ydoc = ydocRef.current;
  const provider = providerRef.current;

  // Initialize title map
  if (!titleMapRef.current) {
    titleMapRef.current = ydoc.getMap<unknown>("meta");
  }
  const titleMap = titleMapRef.current;

  // Handle preview state changes
  const handlePreview = useCallback((state: PreviewState | null) => {
    // Clean up old preview doc
    if (previewState?.doc && previewState.doc !== state?.doc) {
      previewState.doc.destroy();
    }
    setPreviewState(state);
    setViewMode(state ? "preview" : "editing");
  }, [previewState]);

  // Handle compare state changes
  const handleCompare = useCallback((state: CompareState | null) => {
    // Clean up old compare docs
    if (compareState?.oldDoc && compareState.oldDoc !== state?.oldDoc) {
      compareState.oldDoc.destroy();
    }
    if (compareState?.newDoc && compareState.newDoc !== state?.newDoc) {
      compareState.newDoc.destroy();
    }
    setCompareState(state);
    setViewMode(state ? "compare" : "editing");
  }, [compareState]);

  // Register user with server
  const registerUser = useCallback(async () => {
    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connectionIdRef.current,
          user: { name: userName, color: userColor },
        }),
      });
      if (res.ok) {
        setIsUserRegistered(true);
      }
    } catch (err) {
      console.error("Failed to register user:", err);
      setIsUserRegistered(true);
    }
  }, [partykitHost, noteId, userName, userColor]);

  useEffect(() => {
    const onStatus = ({ status }: { status: string }) => {
      const connected = status === "connected";
      setIsConnected(connected);
      if (connected) {
        setHasConnectedOnce(true);
        registerUser();
      }
    };

    const onSync = (synced: boolean) => {
      if (synced) {
        setIsSynced(true);
        // Read title from meta after sync (important for duplicated notes)
        const meta = ydocRef.current?.getMap("meta");
        if (meta) {
          const syncedTitle = (meta.get("title") as string) || "";
          if (syncedTitle) {
            setTitle(syncedTitle);
            onTitleChange?.(syncedTitle);
          }
        }
        // Save preview after sync (content is now loaded)
        if (editorRef.current) {
          const text = editorRef.current.getText();
          const preview = text.slice(0, 200).trim();
          updateNotePreview(noteId, preview);
        }
      }
    };

    provider.on("status", onStatus);
    provider.on("synced", onSync);

    if (provider.wsconnected) {
      setIsConnected(true);
      setHasConnectedOnce(true);
      registerUser();
    }

    if (provider.synced) {
      setIsSynced(true);
    }

    return () => {
      provider.off("status", onStatus);
      provider.off("synced", onSync);
    };
  }, [provider, registerUser, noteId, updateNotePreview, onTitleChange]);

  useEffect(() => {
    if (isConnected) {
      registerUser();
    }
  }, [userName, userColor, isConnected, registerUser]);

  // Handle duplicate notes - set owner info after sync
  // Note: The actual state is now applied by the server in /init endpoint
  useEffect(() => {
    if (!isConnected || !ydocRef.current || !providerRef.current) return;

    const duplicateKey = `duplicate:${noteId}`;

    // Check if this is a duplicate note (marker stored by duplicate handler)
    const isDuplicate = sessionStorage.getItem(duplicateKey);
    if (!isDuplicate) return; // Not a duplicate

    // Clean up sessionStorage marker
    sessionStorage.removeItem(duplicateKey);

    // Wait for sync to complete, then set owner info
    const provider = providerRef.current;
    const setOwnerInfo = () => {
      if (!ydocRef.current) return;

      const meta = ydocRef.current.getMap("meta");
      meta.set("ownerId", userId);
      meta.set("ownerName", userName);
      updateNoteOwner(noteId, userId, userName);
      console.log("[Duplicate] Set owner info after sync");
    };

    if (provider.synced) {
      setOwnerInfo();
    } else {
      const onSync = () => {
        setOwnerInfo();
        provider.off('synced', onSync);
      };
      provider.on('synced', onSync);

      return () => {
        provider.off('synced', onSync);
      };
    }
  }, [isConnected, noteId, userId, userName, updateNoteOwner]);

  useEffect(() => {
    const updateMeta = () => {
      const newTitle = (titleMap.get("title") as string) || "";
      setTitle(newTitle);
      onTitleChange?.(newTitle);

      // Check if note is deleted
      const deleted = (titleMap.get("deleted") as unknown) === true;
      setIsDeleted(deleted);

      // Check if note is locked
      const locked = (titleMap.get("locked") as unknown) === true;
      setIsLocked(locked);

      // Save lock state to store for home page display
      updateNoteLocked(noteId, locked);
    };

    titleMap.observe(updateMeta);
    updateMeta();

    return () => {
      titleMap.unobserve(updateMeta);
    };
  }, [titleMap, onTitleChange]);

  // Sync owner info between Yjs meta and local storage
  useEffect(() => {
    if (!isConnected) return;

    const localNote = recentNotes.find(n => n.id === noteId);
    const metaOwnerId = titleMap.get("ownerId") as string | undefined;
    const metaOwnerName = titleMap.get("ownerName") as string | undefined;

    if (localNote?.ownerId === userId && !metaOwnerId) {
      titleMap.set("ownerId", userId);
      titleMap.set("ownerName", userName);
    }

    if (metaOwnerId && metaOwnerName && localNote && !localNote.ownerName) {
      updateNoteOwner(noteId, metaOwnerId, metaOwnerName);
    }
  }, [isConnected, noteId, userId, userName, recentNotes, titleMap, updateNoteOwner]);

  // Auto-remove deleted note from list immediately when detected
  useEffect(() => {
    if (isDeleted) {
      removeRecentNote(noteId);
    }
  }, [isDeleted, noteId, removeRecentNote]);

  // Periodic lock status check for non-owners viewing locked screen
  // This ensures they see updates when owner unlocks the note
  useEffect(() => {
    if (!isConnected || isOwner) return;

    const checkLockStatus = async () => {
      try {
        const protocol = partykitHost.includes("localhost") ? "http" : "https";
        const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/lock-status`);
        if (res.ok) {
          const data = await res.json();
          const serverLocked = data.locked === true;

          // Update local state if server disagrees
          if (serverLocked !== isLocked) {
            console.log("[LockCheck] Server lock status differs, updating:", serverLocked);
            setIsLocked(serverLocked);
            updateNoteLocked(noteId, serverLocked);
          }
        }
      } catch (err) {
        // Silently ignore - just a refresh check
      }
    };

    // Check immediately and then every 5 seconds when viewing locked screen
    if (isLocked && !isOwner) {
      checkLockStatus();
      const interval = setInterval(checkLockStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected, isOwner, isLocked, noteId, partykitHost, updateNoteLocked]);

  // Auto-save after 5 minutes of idle (no typing)
  const lastTypingRef = useRef<number>(Date.now());
  const idleSaveTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    const protocol = partykitHost.includes("localhost") ? "http" : "https";
    const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    const checkIdle = () => {
      const idleTime = Date.now() - lastTypingRef.current;
      if (idleTime >= IDLE_THRESHOLD && !idleSaveTriggeredRef.current) {
        idleSaveTriggeredRef.current = true;
        fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/save-version?mode=idle`, {
          method: "POST",
        }).catch(() => {});
      }
    };

    // Check every 30 seconds if user is idle
    const interval = setInterval(checkIdle, 30000);

    return () => clearInterval(interval);
  }, [partykitHost, noteId]);

  // Track typing activity (using editorRef to avoid dependency issues)
  useEffect(() => {
    const checkEditor = setInterval(() => {
      const ed = editorRef.current;
      if (ed && !(ed as unknown as { _idleTrackerAttached?: boolean })._idleTrackerAttached) {
        (ed as unknown as { _idleTrackerAttached?: boolean })._idleTrackerAttached = true;

        const handleUpdate = () => {
          lastTypingRef.current = Date.now();
          idleSaveTriggeredRef.current = false;
        };

        ed.on('update', handleUpdate);
      }
    }, 100);

    return () => clearInterval(checkEditor);
  }, []);

  // Save version on page leave/close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      navigator.sendBeacon(
        `${protocol}://${partykitHost}/parties/notes/${noteId}/save-version?mode=pageClose`,
        ""
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);

      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/save-version?mode=pageClose`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {
        navigator.sendBeacon(
          `${protocol}://${partykitHost}/parties/notes/${noteId}/save-version?mode=pageClose`,
          ""
        );
      });

      if (providerRef.current?.awareness) {
        providerRef.current.awareness.setLocalState(null);
      }

      if (providerRef.current) {
        providerRef.current.disconnect();
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (ydocRef.current) {
        ydocRef.current.destroy();
        ydocRef.current = null;
      }

      connectionIdRef.current = "";
    };
  }, [partykitHost, noteId]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleMap.set("title", newTitle);
    titleMap.set("titleEdited", "true");
    registerUser();
  }, [titleMap, registerUser]);

  const handleHistoryRestore = useCallback(async (data: { state: Uint8Array; title: string }) => {
    // Server already applied the restore - just update local title state
    try {
      if (data.title) {
        setTitle(data.title);
        onTitleChange?.(data.title);
      }

      showToast("Version restored successfully", "success");
      console.log("[Restore] Server restored version, title updated");
    } catch (err) {
      console.error("[Restore] Failed:", err);
      showToast("Failed to restore version", "error");
    }

    setPreviewState(null);
    setCompareState(null);
    setViewMode("editing");
    setHistoryOpen(false);
  }, [onTitleChange, showToast]);

  const handleLockClick = useCallback(() => {
    setLockDialogOpen(true);
  }, []);

  const handleManualSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      // ?manual=true bypasses time check - always save if content differs
      await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/save-version?mode=manual`, {
        method: "POST",
      });
      showToast("Version saved!", "success");
    } catch (err) {
      console.error("Failed to save version:", err);
    }
    setIsSaving(false);
  }, [isSaving, partykitHost, noteId, showToast]);



  const handleLockConfirm = useCallback(async () => {
    const newLockedState = !isLocked;

    // Update Yjs (propagates to connected clients immediately)
    titleMap.set("locked", newLockedState);

    // Also persist to server storage (source of truth for reconnects)
    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: newLockedState }),
      });
    } catch (err) {
      console.error("Failed to persist lock state:", err);
    }

    setLockDialogOpen(false);
  }, [titleMap, isLocked, partykitHost, noteId]);

  const handleDuplicateConfirm = useCallback(async () => {
    console.log("[Duplicate] Starting from note page...");

    if (!ydocRef.current) {
      console.error("[Duplicate] No Y.Doc available");
      showToast("Cannot duplicate - document not ready", "error");
      return;
    }

    if (!onDuplicate) {
      console.error("[Duplicate] No onDuplicate callback");
      showToast("Cannot duplicate - navigation not available", "error");
      return;
    }

    try {
      const state = Y.encodeStateAsUpdate(ydocRef.current);
      console.log("[Duplicate] Encoded state size:", state.byteLength);

      let binary = "";
      for (let i = 0; i < state.byteLength; i++) {
        binary += String.fromCharCode(state[i]);
      }
      const stateBase64 = btoa(binary);

      const newNoteId = Math.random().toString(36).substring(2, 10);
      const formatDateTime = () => new Date().toLocaleDateString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
      });
      const newTitle = title ? `(copy) ${title}` : `(copy) Untitled ${formatDateTime()}`;

      console.log("[Duplicate] New note ID:", newNoteId);
      console.log("[Duplicate] New title:", newTitle);

      // Persist to server - server applies state directly to Y.Doc
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${newNoteId}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateBase64, title: newTitle }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      console.log("[Duplicate] Server applied state");

      // Store marker for client to set owner info
      sessionStorage.setItem(`duplicate:${newNoteId}`, "1");

      setDuplicateDialogOpen(false);
      onDuplicate(newNoteId, newTitle);
    } catch (err) {
      console.error("[Duplicate] Failed:", err);
      showToast("Failed to duplicate note", "error");
    }
  }, [title, onDuplicate, partykitHost, showToast]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false,
        }),
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCursor.configure({
          provider,
          user: {
            name: userName,
            color: userColor,
            visibleUserId: userId,
          },
        }),
        TextStyle,
        Color,
        Highlight.configure({
          multicolor: true,
        }),
        Image.configure({
          inline: false,
          allowBase64: true,
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: {
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        Placeholder.configure({
          placeholder: 'Start typing your thoughts...',
        }),
      ],
      editorProps: {
        attributes: {
          class: "prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none",
        },
      },
      onTransaction: ({ transaction }) => {
        // Only register user for local changes, not for sync from other users
        // y-sync$ meta is set when the change comes from Y.js sync
        const isRemoteChange = transaction.getMeta('y-sync$');
        if (!isRemoteChange && transaction.docChanged) {
          registerUser();
        }
      },
    },
    [provider, userName, userColor, registerUser]
  );

  // Keep editorRef updated for callbacks that need editor access
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Keyboard shortcut for clear formatting
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        editor.chain().focus().unsetAllMarks().clearNodes().run();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  // Save content preview (debounced)
  useEffect(() => {
    if (!editor) return;

    const savePreview = () => {
      const text = editor.getText();
      const preview = text.slice(0, 200).trim();
      updateNotePreview(noteId, preview);
    };

    let timeout: ReturnType<typeof setTimeout>;
    const handleUpdate = () => {
      clearTimeout(timeout);
      timeout = setTimeout(savePreview, 1000);
    };

    editor.on('update', handleUpdate);
    savePreview();

    return () => {
      clearTimeout(timeout);
      editor.off('update', handleUpdate);
    };
  }, [editor, noteId, updateNotePreview]);

  // Auto-duplicate when requested from home page
  useEffect(() => {
    if (!autoDuplicate || !isConnected || !isUserRegistered || !ydocRef.current || !onDuplicate) return;

    // Small delay to ensure doc is synced
    const timeout = setTimeout(() => {
      const state = Y.encodeStateAsUpdate(ydocRef.current!);

      let binary = "";
      for (let i = 0; i < state.byteLength; i++) {
        binary += String.fromCharCode(state[i]);
      }
      const stateBase64 = btoa(binary);

      const newNoteId = Math.random().toString(36).substring(2, 10);
      const currentTitle = titleMap.get("title") as string || "";
      const newTitle = currentTitle ? `(copy) ${currentTitle}` : "(copy) Untitled";

      // Store in sessionStorage for the new note to pick up
      sessionStorage.setItem(`duplicate:${newNoteId}`, JSON.stringify({
        state: stateBase64,
        title: newTitle
      }));

      onDuplicate(newNoteId, newTitle);
    }, 500);

    return () => clearTimeout(timeout);
  }, [autoDuplicate, isConnected, isUserRegistered, onDuplicate, titleMap]);

  // Auto-lock/unlock when requested from home page menu
  useEffect(() => {
    if (!autoLockAction || !isConnected || !isUserRegistered || !isOwner) return;

    // Small delay to ensure doc is synced
    const timeout = setTimeout(() => {
      const shouldLock = autoLockAction === 'lock';
      titleMap.set("locked", shouldLock);
      onLockActionComplete?.();
    }, 300);

    return () => clearTimeout(timeout);
  }, [autoLockAction, isConnected, isUserRegistered, isOwner, titleMap, onLockActionComplete]);

  // Auto-fill title from first line
  const handleTitleFocus = useCallback(() => {
    if (!editor) return;

    const titleEdited = titleMap.get("titleEdited");
    if (titleEdited) return;

    const currentTitle = titleMap.get("title") || "";
    if (currentTitle) return;

    const textContent = editor.getText();
    if (!textContent.trim()) return;

    const firstLine = textContent.split('\n')[0].trim().slice(0, 50);
    if (firstLine) {
      setTitle(firstLine);
      titleMap.set("title", firstLine);
      titleMap.set("titleEdited", "true");
    }
  }, [editor, titleMap]);



  // Only show full loading screen on initial connection, not on reconnections
  // Show loading while connecting or syncing
  if (!hasConnectedOnce || !isSynced) {
    return (
      <VStack h="100%" justify="center" align="center" gap={4}>
        <Box
          position="relative"
          w={16}
          h={16}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {/* Pulsing ring */}
          <Box
            position="absolute"
            w="100%"
            h="100%"
            borderRadius="full"
            bg="#6366F1"
            opacity={0.2}
            animation="pulse 1.5s ease-in-out infinite"
            css={{
              "@keyframes pulse": {
                "0%, 100%": { transform: "scale(1)", opacity: 0.2 },
                "50%": { transform: "scale(1.2)", opacity: 0.1 },
              },
            }}
          />
          {/* Logo */}
          <Box
            bg="#6366F1"
            color="white"
            p={3}
            borderRadius="xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={1}
          >
            <LuPenLine size={24} />
          </Box>
        </Box>
        <Text color="gray.500" fontSize="sm" fontWeight="medium">
          {!hasConnectedOnce ? "Connecting..." : "Loading note..."}
        </Text>
      </VStack>
    );
  }

  if (isDeleted) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        minH="calc(100vh - 120px)"
        p={4}
      >
        <VStack
          bg="white"
          borderRadius="2xl"
          boxShadow="0 8px 32px rgba(0, 0, 0, 0.08)"
          p={10}
          maxW="400px"
          w="full"
          gap={4}
          textAlign="center"
        >
          <Box
            w={16}
            h={16}
            bg="red.50"
            borderRadius="2xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="red.400"
          >
            <LuTrash2 size={32} />
          </Box>
          <VStack gap={1}>
            <Text fontSize="xl" fontWeight="semibold" color="gray.800">
              This note has been deleted
            </Text>
            <Text fontSize="sm" color="gray.500" lineHeight="1.6">
              The owner has removed this note.
              <br />
              It has been removed from your list.
            </Text>
          </VStack>
          <Button
            bg="#6366F1"
            color="white"
            size="md"
            borderRadius="xl"
            px={6}
            mt={2}
            _hover={{ bg: "#4F46E5", transform: "translateY(-1px)" }}
            transition="all 0.2s"
            onClick={() => window.location.href = "/"}
          >
            Go back to notes
          </Button>
        </VStack>
      </Box>
    );
  }

  // Show locked message for non-owners
  if (isLocked && !isOwner) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        minH="calc(100vh - 120px)"
        p={4}
      >
        <VStack
          bg="white"
          borderRadius="2xl"
          boxShadow="0 8px 32px rgba(0, 0, 0, 0.08)"
          p={10}
          maxW="400px"
          w="full"
          gap={4}
          textAlign="center"
        >
          <Box
            w={16}
            h={16}
            bg="orange.50"
            borderRadius="2xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="orange.400"
          >
            <LuLock size={32} />
          </Box>
          <VStack gap={1}>
            <Text fontSize="xl" fontWeight="semibold" color="gray.800">
              This note is locked
            </Text>
            <Text fontSize="sm" color="gray.500" lineHeight="1.6">
              The owner has restricted access to this note.
              <br />
              Contact the owner to request access.
            </Text>
          </VStack>
          <Button
            bg="#6366F1"
            color="white"
            size="md"
            borderRadius="xl"
            px={6}
            mt={2}
            _hover={{ bg: "#4F46E5", transform: "translateY(-1px)" }}
            transition="all 0.2s"
            onClick={() => window.location.href = "/"}
          >
            Go back to notes
          </Button>
        </VStack>
      </Box>
    );
  }

  const selectedVersionId = previewState?.version.id || compareState?.versionId;

  // Get preview title if in preview mode
  const displayTitle = previewState
    ? (previewState.doc.getMap("meta").get("title") as string || "Untitled")
    : title;

  const editorStyles = {
    "& .ProseMirror": {
      minHeight: "100%",
      outline: "none",
      color: "#1a1a1a",
      lineHeight: "1.7",
      "& p.is-editor-empty:first-of-type::before": {
        content: "attr(data-placeholder)",
        color: "#9CA3AF",
        float: "left",
        height: 0,
        pointerEvents: "none",
      },
      "& p": { margin: "0.5em 0", lineHeight: "1.7" },
      "& p:first-of-type": { marginTop: 0 },
      "& h1": { fontSize: "1.5rem", fontWeight: "600", margin: "0.75em 0 0.4em", lineHeight: "1.3" },
      "& h1:first-of-type": { marginTop: 0 },
      "& h2": { fontSize: "1.2rem", fontWeight: "600", margin: "0.75em 0 0.4em", lineHeight: "1.4" },
      "& h2:first-of-type": { marginTop: 0 },
      "& strong, & b": { fontWeight: "600" },
      "& em, & i": { fontStyle: "italic" },
      "& s, & strike": { textDecoration: "line-through" },
      "& ul": { paddingLeft: "1.5em", margin: "0.5em 0", listStyleType: "disc", lineHeight: "1.7" },
      "& ul:first-of-type": { marginTop: 0 },
      "& ol": { paddingLeft: "1.5em", margin: "0.5em 0", listStyleType: "decimal", lineHeight: "1.7" },
      "& ol:first-of-type": { marginTop: 0 },
      "& li": { margin: "0.25em 0", display: "list-item" },
      "& li p": { margin: "0" },
      "& img": {
        maxWidth: "min(100%, 400px)",
        height: "auto",
        borderRadius: "8px",
        margin: "0.5em 0",
        cursor: "pointer",
        transition: "box-shadow 0.15s ease, outline 0.15s ease",
        "&:hover": {
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        },
      },
      "& img.ProseMirror-selectednode": {
        outline: "3px solid #6366F1",
        outlineOffset: "2px",
        boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
      },
      "& a": {
        color: "#6366F1",
        textDecoration: "underline",
        cursor: "pointer",
        "&:hover": {
          color: "#4F46E5",
        },
      },
      "& ul[data-type='taskList']": {
        listStyle: "none",
        padding: 0,
        margin: "0.5em 0",
        "&:first-of-type": { marginTop: 0 },
        "& li": {
          display: "flex",
          alignItems: "flex-start",
          gap: "0.5em",
          margin: "0.35em 0",
          "& > label": {
            flexShrink: 0,
            marginTop: "0.15em",
            "& input[type='checkbox']": {
              width: "18px",
              height: "18px",
              cursor: "pointer",
              accentColor: "#6366F1",
              borderRadius: "4px",
            },
          },
          "& > div": {
            flex: 1,
            "& p": {
              margin: 0,
            },
          },
        },
        "& li[data-checked='true']": {
          "& > div": {
            textDecoration: "line-through",
            color: "#4B5563",
          },
        },
      },
    },
    "& .collaboration-cursor__caret": {
      position: "relative",
      marginLeft: "-1px",
      marginRight: "-1px",
      borderLeft: "1px solid",
      borderRight: "1px solid",
      wordBreak: "normal",
      pointerEvents: "none",
    },
    "& .collaboration-cursor__label": {
      position: "absolute",
      top: "-1.4em",
      left: "-1px",
      fontSize: "12px",
      fontWeight: "600",
      lineHeight: "normal",
      whiteSpace: "nowrap",
      color: "white",
      padding: "0.1rem 0.3rem",
      borderRadius: "3px 3px 3px 0",
      userSelect: "none",
    },
  };

  return (
    <VStack align="stretch" gap={0} h="100%" flex={1} overflow="hidden">
      {/* Mobile Layout */}
      {isMobile ? (
        <>
          {/* Mobile Top Bar */}
          <Box
            h="52px"
            bg="white"
            borderBottom="1px solid"
            borderColor="gray.100"
            flexShrink={0}
            display="flex"
            alignItems="center"
            px={2}
            gap={1}
          >
            {/* Back Arrow */}
            <IconButton
              aria-label="Back to notes"
              variant="ghost"
              size="sm"
              color="#6366F1"
              onClick={onBack}
              _hover={{ bg: "#EEF2FF" }}
            >
              <LuArrowLeft size={22} />
            </IconButton>

            {/* Spacer */}
            <Box flex={1} />

            {/* More Menu (Share, Save, History, Duplicate, Lock, Delete) */}
            <Menu.Root positioning={{ placement: "bottom-end" }}>
              <Menu.Trigger asChild>
                <IconButton
                  aria-label="More options"
                  variant="ghost"
                  size="sm"
                  color="gray.600"
                >
                  <LuEllipsisVertical size={20} />
                </IconButton>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content minW="180px">
                    {onShare && (
                      <Menu.Item
                        value="share"
                        onClick={isLocked ? undefined : () => {
                          onShare();
                          showToast("Link copied!", "success");
                        }}
                        disabled={isLocked}
                      >
                        <LuShare2 />
                        <Text>Copy link</Text>
                      </Menu.Item>
                    )}
                    <Menu.Item value="save" onClick={handleManualSave}>
                      <LuSave />
                      <Text>Save version</Text>
                    </Menu.Item>
                    <Menu.Item value="history" onClick={() => setHistoryOpen(!historyOpen)}>
                      <LuHistory />
                      <Text>Version history</Text>
                    </Menu.Item>
                    <Menu.Separator />
                    {onDuplicate && (
                      <Menu.Item value="duplicate" onClick={() => setDuplicateDialogOpen(true)}>
                        <LuCopy />
                        <Text>Duplicate note</Text>
                      </Menu.Item>
                    )}
                    {isOwner && (
                      <Menu.Item value="lock" onClick={handleLockClick}>
                        {isLocked ? <LuLockOpen /> : <LuLock />}
                        <Text>{isLocked ? "Unlock note" : "Lock note"}</Text>
                      </Menu.Item>
                    )}
                    {onDelete && (
                      <Menu.Item value="delete" onClick={onDelete} color="red.500">
                        <LuTrash2 />
                        <Text>Delete note</Text>
                      </Menu.Item>
                    )}
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>

            {/* Collaborators + You */}
            <CollaboratorsList
              provider={provider}
              currentUser={{ name: userName, color: userColor }}
              maxDisplay={3}
              showCurrentUser={true}
            />
          </Box>

          {/* Mobile Title Row */}
          <Box px={4} py={3} bg="white" borderBottom="1px solid" borderColor="gray.100">
            {viewMode === "editing" ? (
              <Input
                value={title}
                onChange={handleTitleChange}
                onFocus={handleTitleFocus}
                placeholder="Untitled note..."
                fontSize="lg"
                fontWeight="semibold"
                maxLength={100}
                color={title ? "gray.800" : "gray.400"}
                _placeholder={{ color: "gray.400" }}
                border="none"
                outline="none"
                boxShadow="none"
                _focus={{ boxShadow: "none", borderColor: "transparent" }}
                px={0}
                h="auto"
              />
            ) : (
              <Text fontSize="lg" fontWeight="semibold" color="gray.700">
                {displayTitle || "Untitled"}
              </Text>
            )}
          </Box>

          {/* Locked indicator bar */}
          {isLocked && (
            <HStack bg="orange.100" px={4} py={1.5} gap={2}>
              <LuLock size={14} color="#c2410c" />
              <Text fontSize="xs" color="orange.700">This note is locked</Text>
            </HStack>
          )}
        </>
      ) : (
        /* Desktop Top Bar */
        <Box
          h="56px"
          bg="white"
          borderBottom="1px solid"
          borderColor="gray.100"
          flexShrink={0}
          display="flex"
          alignItems="center"
          px={4}
          gap={4}
        >
          {/* Logo */}
          <Tooltip.Root openDelay={100} closeDelay={50}>
            <Tooltip.Trigger asChild>
              <Box
                as="button"
                onClick={onBack}
                bg="#6366F1"
                color="white"
                p={2}
                borderRadius="lg"
                display="flex"
                alignItems="center"
                justifyContent="center"
                cursor="pointer"
                _hover={{ bg: "#4F46E5" }}
                transition="background 0.15s ease"
                flexShrink={0}
              >
                <LuPenLine size={18} />
              </Box>
            </Tooltip.Trigger>
            <Tooltip.Positioner>
              <Tooltip.Content>Back to notes</Tooltip.Content>
            </Tooltip.Positioner>
          </Tooltip.Root>

          {/* Title (left-aligned) */}
          <Box flex={1} minW={0}>
            {viewMode === "editing" ? (
              <Input
                value={title}
                onChange={handleTitleChange}
                onFocus={handleTitleFocus}
                placeholder="Untitled note..."
                fontSize="md"
                fontWeight="medium"
                maxLength={100}
                color={title ? "gray.800" : "gray.400"}
                _placeholder={{ color: "gray.400" }}
                border="none"
                outline="none"
                boxShadow="none"
                _focus={{ boxShadow: "none", borderColor: "transparent" }}
                px={0}
                css={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              />
            ) : (
              <Text
                fontSize="md"
                fontWeight="medium"
                color="gray.700"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
                {displayTitle || "Untitled"}
              </Text>
            )}
          </Box>

          {/* Right actions */}
          <HStack gap={1} flexShrink={0}>
            {/* Sync status */}
            <Tooltip.Root openDelay={100} closeDelay={50}>
              <Tooltip.Trigger asChild>
                <HStack gap={1} color={isConnected ? "gray.400" : "orange.500"} fontSize="xs" mr={1} cursor="help">
                  <LuCloud size={14} />
                  <Text whiteSpace="nowrap">
                    {isConnected ? "Synced" : "Offline"}
                  </Text>
                </HStack>
              </Tooltip.Trigger>
              <Tooltip.Positioner>
                <Tooltip.Content>
                  {isConnected
                    ? "Changes sync instantly with all collaborators"
                    : "Reconnecting... Changes will sync when online"}
                </Tooltip.Content>
              </Tooltip.Positioner>
            </Tooltip.Root>

            {/* Save Version */}
            <Tooltip.Root openDelay={100} closeDelay={50}>
              <Tooltip.Trigger asChild>
                <IconButton
                  aria-label="Save version"
                  variant="ghost"
                  size="sm"
                  color="gray.600"
                  _hover={{ bg: "gray.100", color: "#6366F1" }}
                  onClick={handleManualSave}
                  disabled={isSaving}
                >
                  <LuSave size={18} />
                </IconButton>
              </Tooltip.Trigger>
              <Tooltip.Positioner>
                <Tooltip.Content>Save version snapshot</Tooltip.Content>
              </Tooltip.Positioner>
            </Tooltip.Root>

            {/* History */}
            <Tooltip.Root openDelay={100} closeDelay={50}>
              <Tooltip.Trigger asChild>
                <IconButton
                  aria-label="Version history"
                  variant="ghost"
                  size="sm"
                  bg={historyOpen ? "#EEF2FF" : undefined}
                  color={historyOpen ? "#4F46E5" : "gray.600"}
                  _hover={{ bg: historyOpen ? "#E0E7FF" : "gray.100", color: historyOpen ? "#4338CA" : "gray.800" }}
                  onClick={() => setHistoryOpen(!historyOpen)}
                >
                  <LuHistory size={18} />
                </IconButton>
              </Tooltip.Trigger>
              <Tooltip.Positioner>
                <Tooltip.Content>Version history</Tooltip.Content>
              </Tooltip.Positioner>
            </Tooltip.Root>

            {/* Separator */}
            <Box w="1px" h={6} bg="gray.200" mx={1} />

            {/* Share */}
            {onShare && (
              <Tooltip.Root openDelay={100} closeDelay={50}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    aria-label={shareButtonState === "copied" ? "Copied!" : "Share"}
                    variant="ghost"
                    size="sm"
                    onClick={isLocked ? undefined : () => {
                      onShare();
                      showToast("Link copied to clipboard!", "success");
                    }}
                    color={shareButtonState === "copied" ? "green.600" : "gray.600"}
                    _hover={{ bg: "gray.100", color: "gray.800" }}
                    disabled={isLocked}
                    opacity={isLocked ? 0.4 : 1}
                  >
                    {shareButtonState === "copied" ? <LuCheck /> : <LuShare2 />}
                  </IconButton>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                  <Tooltip.Content>
                    {isLocked ? "Unlock to share" : shareButtonState === "copied" ? "Copied!" : "Share link"}
                  </Tooltip.Content>
                </Tooltip.Positioner>
              </Tooltip.Root>
            )}

            {/* Lock/Unlock (owner only) */}
            {isOwner && (
              <Tooltip.Root openDelay={100} closeDelay={50}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    aria-label={isLocked ? "Unlock note" : "Lock note"}
                    variant="ghost"
                    size="sm"
                    onClick={handleLockClick}
                    color={isLocked ? "orange.600" : "gray.600"}
                    bg={isLocked ? "orange.50" : undefined}
                    _hover={{ bg: isLocked ? "orange.100" : "gray.100", color: isLocked ? "orange.700" : "gray.800" }}
                  >
                    {isLocked ? <LuLock /> : <LuLockOpen />}
                  </IconButton>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                  <Tooltip.Content>
                    {isLocked ? "Unlock note" : "Lock note"}
                  </Tooltip.Content>
                </Tooltip.Positioner>
              </Tooltip.Root>
            )}

            {/* Duplicate */}
            {onDuplicate && (
              <Tooltip.Root openDelay={100} closeDelay={50}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    aria-label="Duplicate"
                    variant="ghost"
                    size="sm"
                    color="gray.600"
                    _hover={{ bg: "gray.100", color: "gray.800" }}
                    onClick={() => setDuplicateDialogOpen(true)}
                  >
                    <LuCopy />
                  </IconButton>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                  <Tooltip.Content>Duplicate note</Tooltip.Content>
                </Tooltip.Positioner>
              </Tooltip.Root>
            )}

            {/* Delete */}
            {onDelete && (
              <Tooltip.Root openDelay={100} closeDelay={50}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    aria-label="Delete"
                    variant="ghost"
                    size="sm"
                    color="gray.600"
                    _hover={{ color: "red.600", bg: "red.50" }}
                    onClick={onDelete}
                  >
                    <LuTrash2 />
                  </IconButton>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                  <Tooltip.Content>Delete note</Tooltip.Content>
                </Tooltip.Positioner>
              </Tooltip.Root>
            )}

            {/* Separator */}
            <Box w="1px" h={6} bg="gray.200" mx={1} />

            {/* Collaborators + You */}
            <HStack gap={0} ml={1}>
              {/* Other collaborators (stacked) */}
              <CollaboratorsList
                provider={provider}
                currentUser={{ name: userName, color: userColor }}
                maxDisplay={4}
                showCurrentUser={false}
              />

              {/* You (larger, with ring) */}
              <Tooltip.Root openDelay={100} closeDelay={50}>
                <Tooltip.Trigger asChild>
                  <Box
                    w={9}
                    h={9}
                    borderRadius="full"
                    bg={userColor}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    border="2px solid white"
                    boxShadow="0 0 0 2px #6366F1"
                    ml={-1}
                    zIndex={10}
                  >
                    <Text fontSize="sm" fontWeight="bold" color="white">
                      {userName.charAt(0).toUpperCase()}
                    </Text>
                  </Box>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                  <Tooltip.Content>{userName} (you)</Tooltip.Content>
                </Tooltip.Positioner>
              </Tooltip.Root>
            </HStack>
          </HStack>
        </Box>
      )}

      {/* Editor + History */}
      <Box flex={1} overflow="hidden" px={{ base: 0, md: 4 }} py={{ base: 0, md: 4 }} display="flex" justifyContent="center">
        <HStack
          align="stretch"
          gap={4}
          maxW={historyOpen ? "1136px" : "800px"}
          w="100%"
          h="100%"
        >
          {/* Main content area */}
          <Box
            flex={1}
            minW={0}
            border="none"
            borderRadius={{ base: "none", md: "xl" }}
            boxShadow={{ base: "none", md: "0 4px 24px rgba(0, 0, 0, 0.08)" }}
            bg="white"
            overflow="hidden"
            display="flex"
            flexDirection="column"
          >
        {/* Toolbar - same for mobile and desktop */}
        {viewMode === "editing" && (
          <Box
            bg="gray.50"
            borderBottom="1px solid"
            borderColor="gray.100"
            overflowX="auto"
            overflowY="hidden"
          >
            <Toolbar editor={editor} />
          </Box>
        )}

        {/* Desktop: Preview/Compare status bar */}
        {!isMobile && viewMode !== "editing" && (
          <HStack
            px={4}
            py={2}
            bg={viewMode === "preview" ? "purple.50" : "#EEF2FF"}
            borderBottom="1px solid"
            borderColor="gray.200"
            justify="space-between"
          >
            <Text fontSize="sm" color={viewMode === "preview" ? "purple.700" : "#4338CA"} fontWeight="medium">
              {viewMode === "preview" ? "Preview mode" : "Compare mode"}
            </Text>
            <Button
              size="xs"
              variant="outline"
              colorPalette={viewMode === "preview" ? "purple" : "indigo"}
              onClick={() => {
                handlePreview(null);
                handleCompare(null);
              }}
            >
              Back to editing
            </Button>
          </HStack>
        )}

        {/* Content area - scrollable */}
        <Box flex={1} overflow="auto">
          {/* Mobile: Preview/Compare status bar */}
          {isMobile && viewMode !== "editing" && (
            <HStack
              px={4}
              py={2}
              bg={viewMode === "preview" ? "purple.50" : "#EEF2FF"}
              borderBottom="1px solid"
              borderColor="gray.200"
              justify="space-between"
              position="sticky"
              top={0}
              zIndex={10}
            >
              <Text fontSize="sm" color={viewMode === "preview" ? "purple.700" : "#4338CA"} fontWeight="medium">
                {viewMode === "preview" ? "Preview mode" : "Compare mode"}
              </Text>
              <Button
                size="xs"
                variant="outline"
                colorPalette={viewMode === "preview" ? "purple" : "indigo"}
                onClick={() => {
                  handlePreview(null);
                  handleCompare(null);
                }}
              >
                Back to editing
              </Button>
            </HStack>
          )}
          {viewMode === "editing" && (
            <Box
              p={{ base: 4, md: 4 }}
              pt={{ base: 3, md: 3 }}
              pb={4}
              flex={1}
              display="flex"
              flexDirection="column"
              css={editorStyles}
              onClick={(e) => {
                // Focus editor when clicking empty space (not on existing content)
                if (editor && e.target === e.currentTarget) {
                  editor.commands.focus('end');
                }
              }}
              cursor="text"
            >
              {/* Link BubbleMenu - shows when cursor is on a link */}
              {editor && (
                <BubbleMenu
                  editor={editor}
                  shouldShow={({ editor }) => editor.isActive('link')}
                  tippyOptions={{ placement: 'bottom-start' }}
                >
                  <HStack
                    bg="white"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="md"
                    shadow="md"
                    p={1}
                    gap={1}
                    maxW="400px"
                  >
                    <Text fontSize="xs" color="gray.600" px={2} wordBreak="break-all">
                      {editor.getAttributes('link').href}
                    </Text>
                    <IconButton
                      aria-label="Open link"
                      size="xs"
                      variant="ghost"
                      color="#6366F1"
                      _hover={{ bg: "#EEF2FF" }}
                      onClick={() => {
                        const href = editor.getAttributes('link').href;
                        if (href) window.open(href, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <LuExternalLink />
                    </IconButton>
                    <IconButton
                      aria-label="Remove link"
                      size="xs"
                      variant="ghost"
                      color="gray.500"
                      _hover={{ bg: "red.50", color: "red.500" }}
                      onClick={() => {
                        editor.chain().focus().unsetLink().run();
                      }}
                    >
                      <LuUnlink />
                    </IconButton>
                  </HStack>
                </BubbleMenu>
              )}
              <Box
                flex={1}
                minH="200px"
                onClick={(e) => {
                  // Focus editor when clicking empty space below content
                  if (editor && e.target === e.currentTarget) {
                    editor.commands.focus('end');
                  }
                }}
                cursor="text"
              >
                <EditorContent editor={editor} />
              </Box>
            </Box>
          )}

          {viewMode === "preview" && previewState && (
            <PreviewContent doc={previewState.doc} styles={editorStyles} />
          )}

          {viewMode === "compare" && compareState && (
            <InlineDiffView
              oldDoc={compareState.oldDoc}
              newDoc={compareState.newDoc}
              oldText=""
              newText=""
              oldVersion={{
                editedBy: compareState.oldVersion.editedBy || "Unknown",
                editorColor: compareState.oldVersion.editorColor || "#888",
                timestamp: compareState.oldVersion.timestamp,
              }}
              newVersion={{
                editedBy: "Current",
                editorColor: userColor,
                timestamp: Date.now(),
              }}
            />
          )}
        </Box>

        </Box>

        {/* History Panel - sidebar */}
        {historyOpen && (
          <HistoryPanel
            noteId={noteId}
            partykitHost={partykitHost}
            isOpen={historyOpen}
            onRestore={handleHistoryRestore}
            onClose={() => setHistoryOpen(false)}
            currentDoc={ydoc}
            viewMode={viewMode}
            onPreview={handlePreview}
            onCompare={handleCompare}
            selectedVersionId={selectedVersionId}
          />
        )}
        </HStack>
      </Box>

      {/* Duplicate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={duplicateDialogOpen}
        onClose={() => setDuplicateDialogOpen(false)}
        onConfirm={handleDuplicateConfirm}
        title="Duplicate Note"
        variant="duplicate"
        confirmText="Duplicate"
        cancelText="Cancel"
        description={
          <VStack gap={3} align="stretch">
            <Text fontSize="sm" color="gray.600" textAlign="center">
              Create a copy of "{title || "Untitled"}"?
            </Text>
            <Box bg="gray.100" p={3} borderRadius="md">
              <VStack gap={2} align="start">
                <HStack gap={2}>
                  <Text fontSize="xs" color="green.600" fontWeight="medium">✓ Will copy:</Text>
                  <Text fontSize="xs" color="gray.600">Title, All content</Text>
                </HStack>
                <HStack gap={2}>
                  <Text fontSize="xs" color="orange.600" fontWeight="medium">✗ Won't copy:</Text>
                  <Text fontSize="xs" color="gray.600">Version history, Ownership</Text>
                </HStack>
              </VStack>
            </Box>
          </VStack>
        }
      />

      {/* Lock/Unlock Confirmation Dialog */}
      <ConfirmDialog
        isOpen={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        onConfirm={handleLockConfirm}
        title={isLocked ? "Unlock Note" : "Lock Note"}
        variant="warning"
        confirmText={isLocked ? "Unlock" : "Lock"}
        cancelText="Cancel"
        description={
          isLocked ? (
            <VStack gap={2}>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Make this note accessible to anyone with the link?
              </Text>
              <Text fontSize="xs" color="gray.500" textAlign="center">
                People will be able to view and edit this note again.
              </Text>
            </VStack>
          ) : (
            <VStack gap={2}>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Restrict access to this note?
              </Text>
              <Box bg="orange.50" p={3} borderRadius="md" w="full">
                <VStack gap={1} align="start">
                  <Text fontSize="xs" color="orange.700">
                    • Only you will be able to view and edit
                  </Text>
                  <Text fontSize="xs" color="orange.700">
                    • Others will see "This note is locked"
                  </Text>
                  <Text fontSize="xs" color="orange.700">
                    • Share link will be disabled
                  </Text>
                </VStack>
              </Box>
            </VStack>
          )
        }
      />

      {/* Toast notification */}
      {toast && (
        <Box
          position="fixed"
          bottom={4}
          left="50%"
          transform="translateX(-50%)"
          bg={toast.type === "error" ? "red.500" : toast.type === "success" ? "green.500" : "#6366F1"}
          color="white"
          px={4}
          py={2}
          borderRadius="md"
          boxShadow="lg"
          zIndex={1000}
          display="flex"
          alignItems="center"
          gap={2}
        >
          {toast.type === "error" ? <LuCircleX size={16} /> : <LuCheck size={16} />}
          <Text fontSize="sm" fontWeight="medium">{toast.message}</Text>
        </Box>
      )}
    </VStack>
  );
}

// Component to render preview of a Y.Doc using TipTap
function PreviewContent({ doc, styles }: { doc: Y.Doc; styles: Record<string, unknown> }) {
  const previewEditor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: doc }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: true,
        autolink: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editable: false,
  }, [doc]);

  return (
    <Box p={4} css={styles} bg="gray.50">
      <EditorContent editor={previewEditor} />
    </Box>
  );
}
