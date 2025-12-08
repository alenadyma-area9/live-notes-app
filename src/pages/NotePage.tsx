import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  HStack,
  IconButton,
  Button,
  Text,
} from "@chakra-ui/react";
import { LuArrowLeft, LuCopy, LuCheck } from "react-icons/lu";
import { useState } from "react";
import { CollaborativeEditor } from "../components/Editor";
import { useAppStore } from "../store";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

export function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const { addRecentNote } = useAppStore();
  const [copied, setCopied] = useState(false);

  const handleTitleChange = useCallback((title: string) => {
    if (noteId) {
      addRecentNote(noteId, title || `Note ${noteId}`);
    }
  }, [noteId, addRecentNote]);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!noteId) {
    return <Text>Invalid note ID</Text>;
  }

  return (
    <Box minH="100vh" bg="gray.50" py={4}>
      <Container maxW="container.lg">
        {/* Header */}
        <HStack justify="space-between" mb={4}>
          <HStack>
            <IconButton
              aria-label="Back to home"
              variant="ghost"
              onClick={() => navigate("/")}
            >
              <LuArrowLeft />
            </IconButton>
            <Text fontWeight="medium" color="gray.600">
              Note: {noteId}
            </Text>
          </HStack>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            colorPalette={copied ? "green" : "gray"}
          >
            {copied ? <LuCheck /> : <LuCopy />}
            {copied ? "Copied!" : "Share Link"}
          </Button>
        </HStack>

        {/* Editor */}
        <CollaborativeEditor
          noteId={noteId}
          partykitHost={PARTYKIT_HOST}
          onTitleChange={handleTitleChange}
        />
      </Container>
    </Box>
  );
}
