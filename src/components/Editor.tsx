import { useEffect, useState, useRef } from "react";
import { Box, HStack } from "@chakra-ui/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import { Toolbar } from "./Toolbar";
import { CollaboratorsList } from "./CollaboratorsList";
import { useAppStore } from "../store";

interface EditorProps {
  noteId: string;
  partykitHost: string;
}

export function CollaborativeEditor({ noteId, partykitHost }: EditorProps) {
  const { userName, userColor } = useAppStore();
  const [isConnected, setIsConnected] = useState(false);

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<YPartyKitProvider | null>(null);

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

  useEffect(() => {
    const onStatus = ({ status }: { status: string }) => {
      setIsConnected(status === "connected");
    };

    provider.on("status", onStatus);

    if (provider.wsconnected) {
      setIsConnected(true);
    }

    return () => {
      provider.off("status", onStatus);
    };
  }, [provider]);

  // Cleanup on unmount
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
    },
    [provider, userName, userColor]
  );

  if (!isConnected) {
    return (
      <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" p={8} textAlign="center">
        Connecting...
      </Box>
    );
  }

  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="md" bg="white" overflow="hidden">
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
          "& ul, & ol": { paddingLeft: "1.5em", margin: "0.5em 0" },
          "& li": { margin: "0.25em 0" },
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
  );
}
