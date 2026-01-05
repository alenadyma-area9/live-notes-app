import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { Box, HStack, Input, IconButton, Button, Text, Tooltip } from "@chakra-ui/react";
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
import { LuHistory, LuArrowLeft, LuShare2, LuCheck, LuTrash2, LuExternalLink } from "react-icons/lu";
import { Toolbar } from "./Toolbar";
import { CollaboratorsList } from "./CollaboratorsList";
import { HistoryPanel } from "./HistoryPanel";
import type { ViewMode } from "./HistoryPanel";
import { InlineDiffView } from "./InlineDiffView";
import { RecentChangesExtension, recentChangesStore } from "./RecentChangesExtension";
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
  shareButtonState = "default"
}: EditorProps) {
  const { userName, userColor, userId, recentNotes, updateNoteOwner, removeRecentNote, updateNotePreview } = useAppStore();
  const [isConnected, setIsConnected] = useState(false);
  const [isUserRegistered, setIsUserRegistered] = useState(false);
  const [title, setTitle] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("editing");
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [compareState, setCompareState] = useState<CompareState | null>(null);
  const [isDeleted, setIsDeleted] = useState(false);

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

  useEffect(() => {
    const updateMeta = () => {
      const newTitle = titleMap.get("title") || "";
      setTitle(newTitle);
      onTitleChange?.(newTitle);

      // Check if note is deleted
      const deleted = (titleMap.get("deleted") as unknown) === true;
      setIsDeleted(deleted);
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
        RecentChangesExtension,
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

  // Track remote changes via Yjs and highlight them
  useEffect(() => {
    const xmlFragment = ydoc.getXmlFragment("default");
    let lastLocalChange = 0;

    const observer = (events: Y.YEvent<Y.XmlFragment>[], transaction: Y.Transaction) => {
      if (transaction.local) {
        lastLocalChange = Date.now();
        return;
      }

      if (Date.now() - lastLocalChange < 100) {
        return;
      }

      const awareness = provider.awareness;
      let remoteUser: { name: string; color: string } | null = null;

      for (const [clientId, state] of awareness.getStates().entries()) {
        if (clientId !== awareness.clientID) {
          const s = state as { user?: { name: string; color: string } };
          if (s.user) {
            remoteUser = s.user;
            break;
          }
        }
      }

      if (!remoteUser || !editor) return;

      for (const event of events) {
        if (event.changes.delta) {
          let pos = 1;

          for (const delta of event.changes.delta) {
            if (delta.retain) {
              pos += delta.retain;
            } else if (delta.insert) {
              let insertLength = 0;
              if (typeof delta.insert === "string") {
                insertLength = delta.insert.length;
              } else if (Array.isArray(delta.insert)) {
                insertLength = delta.insert.length;
              } else {
                insertLength = 1;
              }

              if (insertLength > 0) {
                recentChangesStore.addChange(
                  pos,
                  pos + insertLength,
                  remoteUser.color,
                  remoteUser.name
                );
              }
              pos += insertLength;
            }
          }
        }
      }

      if (editor && editor.view) {
        setTimeout(() => {
          editor.view.dispatch(editor.state.tr);
        }, 10);
      }
    };

    xmlFragment.observeDeep(observer);

    return () => {
      xmlFragment.unobserveDeep(observer);
      recentChangesStore.clear();
    };
  }, [ydoc, provider, editor]);

  // Refresh decorations periodically for fading effect
  useEffect(() => {
    if (!editor) return;

    const interval = setInterval(() => {
      if (recentChangesStore.changes.length > 0) {
        editor.view.dispatch(editor.state.tr);
      }
    }, 200);

    return () => clearInterval(interval);
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
                    onClick={onShare}
                    colorPalette={shareButtonState === "copied" ? "green" : "gray"}
                  >
                    {shareButtonState === "copied" ? <LuCheck /> : <LuShare2 />}
                  </IconButton>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                  <Tooltip.Content>
                    {shareButtonState === "copied" ? "Copied!" : "Share link"}
                  </Tooltip.Content>
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
