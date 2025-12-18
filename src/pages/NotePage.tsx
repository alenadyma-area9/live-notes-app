import { useCallback, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  HStack,
  Button,
  Text,
} from "@chakra-ui/react";
import { LuArrowLeft, LuCopy, LuCheck } from "react-icons/lu";
import { CollaborativeEditor } from "../components/Editor";
import { Header } from "../components/Header";
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
    <Box minH="100vh" bg="gray.50">
      <Header />

      <Container maxW="900px" py={4}>
        {/* Sub Header */}
        <HStack justify="space-between" mb={4}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
          >
            <LuArrowLeft />
            Back to notes
          </Button>
          <HStack gap={3}>
            <HStack gap={1}>
              <Text fontSize="xs" color="gray.500">ID:</Text>
              <Text fontSize="xs" color="gray.400" fontFamily="mono">
                {noteId}
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
