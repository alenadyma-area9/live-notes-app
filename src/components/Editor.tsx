import { useEffect, useState, useRef, useCallback } from "react";
import { Box, HStack, Input, IconButton, Button, Text, Badge } from "@chakra-ui/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import { LuHistory, LuX } from "react-icons/lu";
import { Toolbar } from "./Toolbar";
import { CollaboratorsList } from "./CollaboratorsList";
import { HistoryPanel } from "./HistoryPanel";
import { InlineDiffView } from "./InlineDiffView";
import { useAppStore } from "../store";

interface EditorProps {
  noteId: string;
  partykitHost: string;
  onTitleChange?: (title: string) => void;
}

interface DiffState {
  oldDoc: Y.Doc;
  newDoc: Y.Doc;
  oldVersion: { editedBy: string; editorColor: string; timestamp: number };
  newVersion: { editedBy: string; editorColor: string; timestamp: number };
  versionId: string;
}

export function CollaborativeEditor({ noteId, partykitHost, onTitleChange }: EditorProps) {
  const { userName, userColor } = useAppStore();
  const [isConnected, setIsConnected] = useState(false);
  const [isUserRegistered, setIsUserRegistered] = useState(false);
  const [title, setTitle] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [diffState, setDiffState] = useState<DiffState | null>(null);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<YPartyKitProvider | null>(null);
  const titleMapRef = useRef<Y.Map<string> | null>(null);
  const connectionIdRef = useRef<string>(Math.random().toString(36).substring(2));

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
    const updateTitle = () => {
      const newTitle = titleMap.get("title") || "";
      setTitle(newTitle);
      onTitleChange?.(newTitle);
    };

    titleMap.observe(updateTitle);
    updateTitle();

    return () => {
      titleMap.unobserve(updateTitle);
    };
  }, [titleMap, onTitleChange]);

  useEffect(() => {
    return () => {
      setTimeout(() => {
        if (providerRef.current) {
          providerRef.current.destroy();
          providerRef.current = null;
        }
        if (ydocRef.current) {
          ydocRef.current.destroy();
          ydocRef.current = null;
        }
      }, 0);
    };
  }, []);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleMap.set("title", newTitle);
    registerUser();
  }, [titleMap, registerUser]);

  const handleHistoryRestore = useCallback(() => {
    setDiffState(null);
    if (providerRef.current) {
      providerRef.current.disconnect();
      providerRef.current.connect();
    }
  }, []);

  const handleShowDiff = useCallback((diff: DiffState) => {
    setDiffState(diff);
    setHistoryOpen(false);
  }, []);

  const handleCloseDiff = useCallback(() => {
    // Clean up the old doc
    if (diffState?.oldDoc) {
      diffState.oldDoc.destroy();
    }
    setDiffState(null);
  }, [diffState]);

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

  if (!isConnected || !isUserRegistered) {
    return (
      <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" p={8} textAlign="center">
        Connecting...
      </Box>
    );
  }

  // Show diff view instead of editor
  if (diffState) {
    return (
      <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" overflow="hidden">
        {/* Diff header */}
        <HStack px={4} py={3} bg="blue.50" justify="space-between" borderBottom="1px solid" borderColor="gray.200">
          <HStack>
            <Badge colorPalette="blue" size="lg">Comparing Changes</Badge>
            <Text fontSize="sm" color="gray.600">
              {title || "Untitled"}
            </Text>
          </HStack>
          <HStack>
            <Button
              size="sm"
              colorPalette="blue"
              onClick={async () => {
                const protocol = partykitHost.includes("localhost") ? "http" : "https";
                await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/restore/${diffState.versionId}`, {
                  method: "POST",
                });
                handleCloseDiff();
                handleHistoryRestore();
              }}
            >
              Restore This Version
            </Button>
            <IconButton
              aria-label="Close diff"
              variant="ghost"
              size="sm"
              onClick={handleCloseDiff}
            >
              <LuX />
            </IconButton>
          </HStack>
        </HStack>

        {/* Diff content */}
        <InlineDiffView
          oldDoc={diffState.oldDoc}
          newDoc={diffState.newDoc}
          oldText=""
          newText=""
          oldVersion={diffState.oldVersion}
          newVersion={diffState.newVersion}
        />
      </Box>
    );
  }

  return (
    <>
      <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" overflow="hidden">
        {/* Title input */}
        <HStack px={4} pt={4} justify="space-between">
          <Input
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled note..."
            variant="flushed"
            fontSize="xl"
            fontWeight="bold"
            border="none"
            _focus={{ boxShadow: "none" }}
            flex={1}
          />
          <IconButton
            aria-label="Version history"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
          >
            <LuHistory />
          </IconButton>
        </HStack>

        {/* Header with toolbar and collaborators */}
        <HStack
          justify="space-between"
          borderBottom="1px solid"
          borderColor="gray.200"
          pr={3}
          flexWrap="wrap"
        >
          <Toolbar editor={editor} />
          <CollaboratorsList
            provider={provider}
            currentUser={{ name: userName, color: userColor }}
          />
        </HStack>

        {/* Editor content */}
        <Box p={4} minH="400px" css={{
          "& .ProseMirror": {
            minHeight: "400px",
            outline: "none",
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
        }}>
          <EditorContent editor={editor} />
        </Box>
      </Box>

      {/* History Panel */}
      <HistoryPanel
        noteId={noteId}
        partykitHost={partykitHost}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleHistoryRestore}
        currentDoc={ydoc}
        onShowDiff={handleShowDiff}
      />
    </>
  );
}
