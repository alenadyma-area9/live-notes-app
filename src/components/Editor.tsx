import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { Box, HStack, VStack, Input, IconButton, Button, Text, Tooltip } from "@chakra-ui/react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import { LuHistory, LuArrowLeft, LuShare2, LuCheck, LuTrash2, LuExternalLink, LuCopy, LuLock, LuLockOpen } from "react-icons/lu";
import { Toolbar } from "./Toolbar";
import { CollaboratorsList } from "./CollaboratorsList";
import { HistoryPanel } from "./HistoryPanel";
import type { ViewMode } from "./HistoryPanel";
import { InlineDiffView } from "./InlineDiffView";
import { ConfirmDialog } from "./ConfirmDialog";

import { useAppStore } from "../store";
import { Portal } from "@chakra-ui/react";

// Component that shows tooltip only when text is truncated
function TruncatedTitle({ children, ...textProps }: { children: string } & React.ComponentProps<typeof Text>): ReactNode {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [children]);

  const textElement = (
    <Text ref={textRef} truncate {...textProps}>
      {children}
    </Text>
  );

  if (!isTruncated) {
    return textElement;
  }

  return (
    <Tooltip.Root openDelay={300} closeDelay={50}>
      <Tooltip.Trigger asChild>
        {textElement}
      </Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content maxW="500px" zIndex={9999}>{children}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

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
  const [isConnected, setIsConnected] = useState(false);
  const [isUserRegistered, setIsUserRegistered] = useState(false);
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

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<YPartyKitProvider | null>(null);
  const titleMapRef = useRef<Y.Map<string> | null>(null);
  const connectionIdRef = useRef<string>("");

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
    titleMapRef.current = ydoc.getMap<string>("meta");
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
      setIsConnected(status === "connected");
      if (status === "connected") {
        registerUser();
      }
    };

    provider.on("status", onStatus);

    if (provider.wsconnected) {
      setIsConnected(true);
      registerUser();
    }

    return () => {
      provider.off("status", onStatus);
    };
  }, [provider, registerUser]);

  useEffect(() => {
    if (isConnected) {
      registerUser();
    }
  }, [userName, userColor, isConnected, registerUser]);

  // Check for duplicate state in sessionStorage and apply it
  useEffect(() => {
    if (!isConnected || !ydocRef.current) return;

    const duplicateKey = `duplicate:${noteId}`;
    const duplicateData = sessionStorage.getItem(duplicateKey);

    if (duplicateData) {
      console.log("[Duplicate] Found pending duplicate data for", noteId);
      sessionStorage.removeItem(duplicateKey);

      try {
        const { state: stateBase64, title: newTitle } = JSON.parse(duplicateData);

        // Decode base64 to Uint8Array
        const binary = atob(stateBase64);
        const state = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          state[i] = binary.charCodeAt(i);
        }

        console.log("[Duplicate] Applying state:", state.byteLength, "bytes");

        // Apply the state to the Y.Doc (this includes old title)
        Y.applyUpdate(ydocRef.current, state);

        // Set the NEW title in Y.Doc meta (overwrites old title)
        const meta = ydocRef.current.getMap("meta");
        meta.set("title", newTitle);
        meta.set("titleEdited", "true");

        // Set React state directly AND after a tick to beat any observer race
        setTitle(newTitle);
        setTimeout(() => setTitle(newTitle), 0);

        console.log("[Duplicate] State and title applied successfully:", newTitle);
      } catch (err) {
        console.error("[Duplicate] Failed to apply duplicate state:", err);
      }
    }
  }, [isConnected, noteId]);

  useEffect(() => {
    const updateMeta = () => {
      const newTitle = titleMap.get("title") || "";
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

  // Save version on page leave/close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      navigator.sendBeacon(
        `${protocol}://${partykitHost}/parties/notes/${noteId}/save-version`,
        ""
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);

      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/save-version`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {
        navigator.sendBeacon(
          `${protocol}://${partykitHost}/parties/notes/${noteId}/save-version`,
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

  const handleHistoryRestore = useCallback(() => {
    setPreviewState(null);
    setCompareState(null);
    setViewMode("editing");
    if (providerRef.current) {
      providerRef.current.disconnect();
      providerRef.current.connect();
    }
  }, []);

  const handleLockClick = useCallback(() => {
    setLockDialogOpen(true);
  }, []);

  const handleLockConfirm = useCallback(() => {
    titleMap.set("locked", !isLocked);
    setLockDialogOpen(false);
  }, [titleMap, isLocked]);

  const handleDuplicateConfirm = useCallback(() => {
    if (!ydocRef.current || !onDuplicate) return;

    const state = Y.encodeStateAsUpdate(ydocRef.current);
    let binary = "";
    for (let i = 0; i < state.byteLength; i++) {
      binary += String.fromCharCode(state[i]);
    }
    const stateBase64 = btoa(binary);

    const newNoteId = Math.random().toString(36).substring(2, 10);
    const newTitle = title ? `(copy) ${title}` : "(copy) Untitled";

    sessionStorage.setItem(`duplicate:${newNoteId}`, JSON.stringify({
      state: stateBase64,
      title: newTitle
    }));

    onDuplicate(newNoteId, newTitle);
  }, [title, onDuplicate]);

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
      ],
      editorProps: {
        attributes: {
          class: "prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none",
        },
      },
      onUpdate: () => {
        registerUser();
      },
    },
    [provider, userName, userColor, registerUser]
  );



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

    console.log("[AutoDuplicate] Starting auto-duplicate...");

    // Small delay to ensure doc is synced
    const timeout = setTimeout(() => {
      console.log("[AutoDuplicate] Step 1: Encoding state...");
      const state = Y.encodeStateAsUpdate(ydocRef.current!);
      console.log("[AutoDuplicate] Step 1: State size:", state.byteLength, "bytes");

      let binary = "";
      for (let i = 0; i < state.byteLength; i++) {
        binary += String.fromCharCode(state[i]);
      }
      const stateBase64 = btoa(binary);

      const newNoteId = Math.random().toString(36).substring(2, 10);
      const currentTitle = titleMap.get("title") as string || "";
      const newTitle = currentTitle ? `(copy) ${currentTitle}` : "(copy) Untitled";

      console.log("[AutoDuplicate] Step 2: New note ID:", newNoteId);
      console.log("[AutoDuplicate] Step 2: New title:", newTitle);

      // Store in sessionStorage for the new note to pick up
      sessionStorage.setItem(`duplicate:${newNoteId}`, JSON.stringify({
        state: stateBase64,
        title: newTitle
      }));
      console.log("[AutoDuplicate] Step 3: Stored in sessionStorage");

      console.log("[AutoDuplicate] Step 4: Navigating to new note");
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

  if (!isConnected || !isUserRegistered) {
    return (
      <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" p={8} textAlign="center">
        Connecting...
      </Box>
    );
  }

  if (isDeleted) {
    return (
      <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" p={8} textAlign="center">
        <Text fontSize="xl" color="gray.500" mb={2}>📭</Text>
        <Text fontSize="lg" fontWeight="medium" color="gray.600">This note has been deleted</Text>
        <Text fontSize="sm" color="gray.400" mt={1}>The owner has removed this note.</Text>
        <Text fontSize="sm" color="gray.400" mb={4}>It has been removed from your list.</Text>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.href = "/"}
        >
          Go back to notes
        </Button>
      </Box>
    );
  }

  // Show locked message for non-owners
  if (isLocked && !isOwner) {
    return (
      <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" p={8} textAlign="center">
        <Text fontSize="xl" color="gray.500" mb={2}>🔒</Text>
        <Text fontSize="lg" fontWeight="medium" color="gray.600">This note is locked</Text>
        <Text fontSize="sm" color="gray.400" mt={1}>The owner has restricted access to this note.</Text>
        <Text fontSize="sm" color="gray.400" mb={4}>Contact the owner to request access.</Text>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.href = "/"}
        >
          Go back to notes
        </Button>
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
      minHeight: "400px",
      outline: "none",
      color: "#1a1a1a",
      "& p": { margin: "0.5em 0" },
      "& h1": { fontSize: "1.875rem", fontWeight: "bold", margin: "0.5em 0" },
      "& h2": { fontSize: "1.5rem", fontWeight: "bold", margin: "0.5em 0" },
      "& strong, & b": { fontWeight: "bold" },
      "& em, & i": { fontStyle: "italic" },
      "& s, & strike": { textDecoration: "line-through" },
      "& ul": { paddingLeft: "1.5em", margin: "0.5em 0", listStyleType: "disc" },
      "& ol": { paddingLeft: "1.5em", margin: "0.5em 0", listStyleType: "decimal" },
      "& li": { margin: "0.25em 0", display: "list-item" },
      "& li p": { margin: "0" },
      "& img": {
        maxWidth: "100%",
        height: "auto",
        borderRadius: "4px",
        margin: "0.5em 0",
      },
      "& a": {
        color: "#3182ce",
        textDecoration: "underline",
        cursor: "pointer",
        "&:hover": {
          color: "#2c5282",
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
    <HStack align="stretch" gap={0} h="100%">
      {/* Main content area */}
      <Box
        flex={1}
        minW={0}
        maxW={historyOpen ? "none" : "800px"}
        mx={historyOpen ? 0 : "auto"}
        border="1px solid"
        borderColor="gray.200"
        borderRadius={historyOpen ? "md 0 0 md" : "md"}
        bg="white"
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        {/* Top bar: Back | Avatars | Share | Delete | History */}
        <HStack
          px={4}
          h="49px"
          bg="gray.50"
          borderBottom="1px solid"
          borderColor="gray.200"
          justify="space-between"
        >
          {/* Left: Back button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
          >
            <LuArrowLeft />
            <Text display={{ base: "none", sm: "inline" }}>Back</Text>
          </Button>

          {/* Right: Avatars + Actions */}
          <HStack gap={3}>
            {/* Avatars */}
            <CollaboratorsList
              provider={provider}
              currentUser={{ name: userName, color: userColor }}
              maxDisplay={4}
            />

            {/* Share */}
            {onShare && (
              <Tooltip.Root openDelay={100} closeDelay={50}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    aria-label={shareButtonState === "copied" ? "Copied!" : "Share"}
                    variant="ghost"
                    size="sm"
                    onClick={isLocked ? undefined : onShare}
                    colorPalette={shareButtonState === "copied" ? "green" : "gray"}
                    disabled={isLocked}
                    opacity={isLocked ? 0.5 : 1}
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
                    variant={isLocked ? "solid" : "ghost"}
                    size="sm"
                    onClick={handleLockClick}
                    colorPalette={isLocked ? "orange" : "gray"}
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
                    colorPalette="red"
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

            {/* History */}
            <Tooltip.Root openDelay={100} closeDelay={50}>
              <Tooltip.Trigger asChild>
                <IconButton
                  aria-label="Version history"
                  variant={historyOpen ? "solid" : "ghost"}
                  colorPalette={historyOpen ? "blue" : "gray"}
                  size="sm"
                  onClick={() => setHistoryOpen(!historyOpen)}
                >
                  <LuHistory />
                </IconButton>
              </Tooltip.Trigger>
              <Tooltip.Positioner>
                <Tooltip.Content>Version history</Tooltip.Content>
              </Tooltip.Positioner>
            </Tooltip.Root>
          </HStack>
        </HStack>

        {/* Title row */}
        <Box px={4} py={3} borderBottom="1px solid" borderColor="gray.100">
          {viewMode === "editing" ? (
            <Input
              value={title}
              onChange={handleTitleChange}
              onFocus={handleTitleFocus}
              placeholder="Untitled note..."
              variant="flushed"
              fontSize="xl"
              fontWeight="bold"
              border="none"
              maxLength={100}
              _focus={{ boxShadow: "none" }}
            />
          ) : (
            <TruncatedTitle fontSize="xl" fontWeight="bold" color="gray.700">
              {displayTitle || "Untitled"}
            </TruncatedTitle>
          )}
        </Box>

        {/* Toolbar / Status bar */}
        {viewMode === "editing" ? (
          <Box bg="gray.50" borderBottom="1px solid" borderColor="gray.200">
            <Toolbar editor={editor} />
          </Box>
        ) : (
          <HStack
            px={4}
            py={2}
            bg={viewMode === "preview" ? "purple.50" : "blue.50"}
            borderBottom="1px solid"
            borderColor="gray.200"
            justify="space-between"
          >
            <Text fontSize="sm" color={viewMode === "preview" ? "purple.700" : "blue.700"} fontWeight="medium">
              {viewMode === "preview"
                ? `Viewing version from ${new Date(previewState!.version.timestamp).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                  })}`
                : `Comparing with version from ${new Date(compareState!.oldVersion.timestamp).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                  })}`
              }
            </Text>
            <Button
              size="xs"
              variant="outline"
              colorPalette={viewMode === "preview" ? "purple" : "blue"}
              onClick={() => {
                handlePreview(null);
                handleCompare(null);
              }}
            >
              Back to editing
            </Button>
          </HStack>
        )}

        {/* Content area */}
        <Box flex={1} overflow="auto">
          {viewMode === "editing" && (
            <Box p={4} css={editorStyles}>
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
                      colorPalette="blue"
                      onClick={() => {
                        const href = editor.getAttributes('link').href;
                        if (href) window.open(href, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <LuExternalLink />
                    </IconButton>
                  </HStack>
                </BubbleMenu>
              )}
              <EditorContent editor={editor} />
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
    </HStack>
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
    ],
    editable: false,
  }, [doc]);

  return (
    <Box p={4} css={styles} bg="gray.50">
      <EditorContent editor={previewEditor} />
    </Box>
  );
}
