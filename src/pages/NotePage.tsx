import { useCallback, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  HStack,
  Button,
  Text,
  IconButton,
  useBreakpointValue,
  Tooltip,
} from "@chakra-ui/react";
import { LuArrowLeft, LuCopy, LuCheck, LuTrash2 } from "react-icons/lu";
import { CollaborativeEditor } from "../components/Editor";
import { Header } from "../components/Header";
import { useAppStore } from "../store";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

export function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const { addRecentNote, removeRecentNote, isNoteOwner } = useAppStore();
  const [copied, setCopied] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false });

  const isOwner = noteId ? isNoteOwner(noteId) : false;

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

  const handleDelete = async () => {
    if (noteId && confirm("Are you sure you want to delete this note? This cannot be undone.")) {
      try {
        const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";
        await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${noteId}/delete`, {
          method: "POST",
        });
        removeRecentNote(noteId);
        navigate("/");
      } catch (err) {
        console.error("Failed to delete note:", err);
      }
    }
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
            <Text display={{ base: "inline", sm: "none" }}>Back</Text>
            <Text display={{ base: "none", sm: "inline" }}>Back to notes</Text>
          </Button>
          <HStack gap={2}>
            {/* Share button */}
            {isMobile ? (
              <Tooltip.Root openDelay={100} closeDelay={50}>
                <Tooltip.Trigger asChild>
                  <IconButton
                    aria-label={copied ? "Copied!" : "Share Link"}
                    variant="outline"
                    size="sm"
                    onClick={handleCopyLink}
                    colorPalette={copied ? "green" : "gray"}
                  >
                    {copied ? <LuCheck /> : <LuCopy />}
                  </IconButton>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                  <Tooltip.Content>
                    {copied ? "Copied!" : "Share Link"}
                  </Tooltip.Content>
                </Tooltip.Positioner>
              </Tooltip.Root>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                colorPalette={copied ? "green" : "gray"}
              >
                {copied ? <LuCheck /> : <LuCopy />}
                {copied ? "Copied!" : "Share Link"}
              </Button>
            )}

            {/* Delete button - owner only */}
            {isOwner && (
              isMobile ? (
                <Tooltip.Root openDelay={100} closeDelay={50}>
                  <Tooltip.Trigger asChild>
                    <IconButton
                      aria-label="Delete"
                      variant="outline"
                      size="sm"
                      colorPalette="red"
                      onClick={handleDelete}
                    >
                      <LuTrash2 />
                    </IconButton>
                  </Tooltip.Trigger>
                  <Tooltip.Positioner>
                    <Tooltip.Content>Delete</Tooltip.Content>
                  </Tooltip.Positioner>
                </Tooltip.Root>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  colorPalette="red"
                  onClick={handleDelete}
                >
                  <LuTrash2 />
                  Delete
                </Button>
              )
            )}
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
