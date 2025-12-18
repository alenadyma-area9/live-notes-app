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
} from "@chakra-ui/react";
import { LuPlus, LuFileText, LuTrash2 } from "react-icons/lu";
import { useAppStore } from "../store";
import { generateNoteId } from "../utils";
import { Header } from "../components/Header";

export function Home() {
  const navigate = useNavigate();
  const { recentNotes, removeRecentNote } = useAppStore();

  const handleCreateNote = () => {
    const noteId = generateNoteId();
    navigate(`/note/${noteId}`);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Box minH="100vh" bg="gray.50">
      <Header showNameInput />

      <Container maxW="900px" py={8}>
        <VStack gap={8} align="stretch">
          {/* Create Note Button */}
          <Button
            colorPalette="blue"
            size="lg"
            onClick={handleCreateNote}
          >
            <LuPlus /> Create New Note
          </Button>

          {/* Recent Notes */}
          {recentNotes.length > 0 && (
            <Box>
              <Text fontSize="xl" fontWeight="bold" mb={4}>Recent Notes</Text>
              <VStack gap={2} align="stretch">
                {recentNotes.map((note) => (
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
                          <Text fontWeight="medium">{note.title || `Note ${note.id}`}</Text>
                          <Text fontSize="sm" color="gray.500">
                            {formatDate(note.lastVisited)}
                          </Text>
                        </Box>
                      </HStack>
                      <IconButton
                        aria-label="Delete"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecentNote(note.id);
                        }}
                      >
                        <LuTrash2 />
                      </IconButton>
                    </HStack>
                  </Card.Root>
                ))}
              </VStack>
            </Box>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
