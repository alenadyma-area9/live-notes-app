import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Input,
  Card,
  IconButton,
} from "@chakra-ui/react";
import { LuPlus, LuFileText, LuTrash2 } from "react-icons/lu";
import { useAppStore } from "../store";
import { generateNoteId } from "../utils";

export function Home() {
  const navigate = useNavigate();
  const { userName, setUserName, recentNotes, removeRecentNote } = useAppStore();

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
    <Box minH="100vh" bg="gray.50" py={10}>
      <Container maxW="container.md">
        <VStack gap={8} align="stretch">
          {/* Header */}
          <VStack gap={2}>
            <Heading size="2xl">Live Notes</Heading>
            <Text color="gray.600">Real-time collaborative note-taking</Text>
          </VStack>

          {/* User Name */}
          <Card.Root p={4}>
            <HStack>
              <Text fontWeight="medium" whiteSpace="nowrap">Your name:</Text>
              <Input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                size="sm"
                maxW="200px"
              />
            </HStack>
          </Card.Root>

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
              <Heading size="md" mb={4}>Recent Notes</Heading>
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
