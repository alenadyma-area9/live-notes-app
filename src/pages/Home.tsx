import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Text,
  VStack,
  HStack,
  Card,
  IconButton,
  Menu,
  Portal,
} from "@chakra-ui/react";
import { LuPlus, LuFileText, LuEllipsisVertical, LuX, LuTrash2, LuShare2, LuCheck } from "react-icons/lu";
import { useAppStore } from "../store";
import { generateNoteId } from "../utils";
import { Header } from "../components/Header";

export function Home() {
  const navigate = useNavigate();
  const { recentNotes, removeRecentNote, addRecentNote, isNoteOwner } = useAppStore();
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2000);
  };

  const handleCreateNote = () => {
    const noteId = generateNoteId();
    addRecentNote(noteId, "", true);
    navigate(`/note/${noteId}`);
  };

  const handleShare = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/note/${noteId}`;
    navigator.clipboard.writeText(url);
    showToast("Link copied to clipboard!", "success");
  };

  const handleRemoveFromList = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeRecentNote(noteId);
  };

  const handleDeleteNote = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this note? This cannot be undone.")) {
      removeRecentNote(noteId);
      showToast("Note deleted", "info");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDisplayTitle = (title: string, id: string) => {
    if (!title || title === `Note ${id}`) {
      return "Untitled";
    }
    return title;
  };

  return (
    <Box minH="100vh" bg="gray.50">
      <Header showNameInput />

      {/* Toast notification */}
      {toast && (
        <Box
          position="fixed"
          bottom={4}
          left="50%"
          transform="translateX(-50%)"
          bg={toast.type === "success" ? "green.500" : "blue.500"}
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
          <LuCheck size={16} />
          <Text fontSize="sm" fontWeight="medium">{toast.message}</Text>
        </Box>
      )}

      <Container maxW="900px" py={8}>
        <VStack gap={8} align="stretch">
          <Button
            colorPalette="blue"
            size="lg"
            onClick={handleCreateNote}
          >
            <LuPlus /> Create New Note
          </Button>

          {recentNotes.length > 0 && (
            <Box>
              <Text fontSize="xl" fontWeight="bold" mb={4}>Recent Notes</Text>
              <VStack gap={2} align="stretch">
                {recentNotes.map((note) => {
                  const isOwner = isNoteOwner(note.id);
                  const displayTitle = getDisplayTitle(note.title, note.id);

                  return (
                    <Card.Root
                      key={note.id}
                      p={3}
                      cursor="pointer"
                      _hover={{ bg: "gray.100" }}
                      onClick={() => navigate(`/note/${note.id}`)}
                    >
                      <HStack justify="space-between">
                        <HStack>
                          <LuFileText />
                          <Box>
                            <Text
                              fontWeight="medium"
                              color={displayTitle === "Untitled" ? "gray.500" : undefined}
                              fontStyle={displayTitle === "Untitled" ? "italic" : undefined}
                            >
                              {displayTitle}
                            </Text>
                            <HStack gap={1} fontSize="xs" color="gray.500">
                              <Text>{formatDate(note.lastVisited)}</Text>
                              {note.ownerName && (
                                <>
                                  <Text>·</Text>
                                  <Text>by {note.ownerName}</Text>
                                </>
                              )}
                              <Text>·</Text>
                              <Text fontFamily="mono">ID: {note.id}</Text>
                            </HStack>
                          </Box>
                        </HStack>

                        <Menu.Root>
                          <Menu.Trigger asChild>
                            <IconButton
                              aria-label="Note options"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <LuEllipsisVertical />
                            </IconButton>
                          </Menu.Trigger>
                          <Portal>
                            <Menu.Positioner>
                              <Menu.Content>
                                <Menu.Item
                                  value="share"
                                  onClick={(e) => handleShare(note.id, e as unknown as React.MouseEvent)}
                                >
                                  <LuShare2 />
                                  Share
                                </Menu.Item>
                                <Menu.Item
                                  value="remove"
                                  onClick={(e) => handleRemoveFromList(note.id, e as unknown as React.MouseEvent)}
                                >
                                  <LuX />
                                  Remove from my list
                                </Menu.Item>
                                {isOwner && (
                                  <Menu.Item
                                    value="delete"
                                    color="red.500"
                                    onClick={(e) => handleDeleteNote(note.id, e as unknown as React.MouseEvent)}
                                  >
                                    <LuTrash2 />
                                    Delete note
                                  </Menu.Item>
                                )}
                              </Menu.Content>
                            </Menu.Positioner>
                          </Portal>
                        </Menu.Root>
                      </HStack>
                    </Card.Root>
                  );
                })}
              </VStack>
            </Box>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
