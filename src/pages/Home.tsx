import { useState, useMemo } from "react";
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
  Input,
  Tooltip,
} from "@chakra-ui/react";
import { LuPlus, LuEllipsisVertical, LuX, LuTrash2, LuShare2, LuCheck, LuSearch, LuFilter, LuArrowUpDown, LuList, LuLayoutGrid } from "react-icons/lu";
import { useAppStore } from "../store";
import { generateNoteId } from "../utils";
import { Header } from "../components/Header";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

type OwnerFilter = "all" | "me" | "others";
type SortOption = "lastEdited" | "created" | "title" | "author";

export function Home() {
  const navigate = useNavigate();
  const { recentNotes, removeRecentNote, addRecentNote, isNoteOwner, userId, viewType, setViewType } = useAppStore();
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);

  // Search, filter, sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("lastEdited");

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

  const handleDeleteNote = async (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this note? This cannot be undone.")) {
      try {
        const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";
        await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${noteId}/delete`, {
          method: "POST",
        });
        removeRecentNote(noteId);
        showToast("Note deleted", "info");
      } catch (err) {
        console.error("Failed to delete note:", err);
        showToast("Failed to delete note", "info");
      }
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

  // Filter and sort notes
  const filteredAndSortedNotes = useMemo(() => {
    let notes = [...recentNotes];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      notes = notes.filter(note =>
        note.title?.toLowerCase().includes(query) ||
        note.id.toLowerCase().includes(query) ||
        note.ownerName?.toLowerCase().includes(query)
      );
    }

    // Owner filter
    if (ownerFilter === "me") {
      notes = notes.filter(note => note.ownerId === userId);
    } else if (ownerFilter === "others") {
      notes = notes.filter(note => note.ownerId && note.ownerId !== userId);
    }

    // Sort
    notes.sort((a, b) => {
      switch (sortOption) {
        case "lastEdited":
          return b.lastVisited - a.lastVisited;
        case "created":
          return (b.createdAt || b.lastVisited) - (a.createdAt || a.lastVisited);
        case "title":
          const titleA = getDisplayTitle(a.title, a.id).toLowerCase();
          const titleB = getDisplayTitle(b.title, b.id).toLowerCase();
          return titleA.localeCompare(titleB);
        case "author":
          const authorA = a.ownerName || "zzz"; // Put notes without author at end
          const authorB = b.ownerName || "zzz";
          return authorA.localeCompare(authorB);
        default:
          return 0;
      }
    });

    return notes;
  }, [recentNotes, searchQuery, ownerFilter, sortOption, userId]);

  const getFilterLabel = () => {
    switch (ownerFilter) {
      case "me": return "My notes";
      case "others": return "Shared with me";
      default: return "All notes";
    }
  };

  const getSortLabel = () => {
    switch (sortOption) {
      case "lastEdited": return "Last edited";
      case "created": return "Last created";
      case "title": return "Title A-Z";
      case "author": return "Author A-Z";
      default: return "Sort";
    }
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
        <VStack gap={6} align="stretch">
          <Button
            colorPalette="blue"
            size="lg"
            onClick={handleCreateNote}
          >
            <LuPlus /> Create New Note
          </Button>

          {recentNotes.length > 0 && (
            <Box>
              {/* Search, Filter, Sort Controls */}
              <HStack mb={4} gap={3}>
                {/* Search - styled nicely */}
                <Box position="relative" flex={1}>
                  <Box
                    position="absolute"
                    left={4}
                    top="50%"
                    transform="translateY(-50%)"
                    color="gray.400"
                    transition="color 0.2s"
                    css={{ "input:focus ~ &": { color: "blue.500" } }}
                  >
                    <LuSearch size={18} />
                  </Box>
                  <Input
                    placeholder="Search notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    pl={11}
                    pr={4}
                    py={5}
                    bg="white"
                    border="none"
                    borderRadius="xl"
                    boxShadow="sm"
                    fontSize="md"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ boxShadow: "md" }}
                    _focus={{ boxShadow: "0 0 0 2px var(--chakra-colors-blue-400)", outline: "none" }}
                    transition="all 0.2s"
                  />
                </Box>

                {/* Filter by owner */}
                <Menu.Root positioning={{ placement: "bottom-start" }}>
                  <Menu.Trigger asChild>
                    <IconButton
                      aria-label={getFilterLabel()}
                      title={getFilterLabel()}
                      variant="ghost"
                      size="md"
                      color={ownerFilter !== "all" ? "blue.500" : "gray.500"}
                      bg={ownerFilter !== "all" ? "blue.50" : "white"}
                      boxShadow="sm"
                      borderRadius="xl"
                      _hover={{ bg: ownerFilter !== "all" ? "blue.100" : "gray.100" }}
                    >
                      <LuFilter size={18} />
                    </IconButton>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content minW="150px">
                      <Menu.Item
                        value="all"
                        onClick={() => setOwnerFilter("all")}
                        bg={ownerFilter === "all" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>All notes</Text>
                          {ownerFilter === "all" && <Text color="blue.500">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="me"
                        onClick={() => setOwnerFilter("me")}
                        bg={ownerFilter === "me" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>My notes</Text>
                          {ownerFilter === "me" && <Text color="blue.500">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="others"
                        onClick={() => setOwnerFilter("others")}
                        bg={ownerFilter === "others" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Shared with me</Text>
                          {ownerFilter === "others" && <Text color="blue.500">✓</Text>}
                        </HStack>
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Menu.Root>

                {/* Sort */}
                <Menu.Root positioning={{ placement: "bottom-start" }}>
                  <Menu.Trigger asChild>
                    <IconButton
                      aria-label={getSortLabel()}
                      title={getSortLabel()}
                      variant="ghost"
                      size="md"
                      color={sortOption !== "lastEdited" ? "blue.500" : "gray.500"}
                      bg={sortOption !== "lastEdited" ? "blue.50" : "white"}
                      boxShadow="sm"
                      borderRadius="xl"
                      _hover={{ bg: sortOption !== "lastEdited" ? "blue.100" : "gray.100" }}
                    >
                      <LuArrowUpDown size={18} />
                    </IconButton>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content minW="150px">
                      <Menu.Item
                        value="lastEdited"
                        onClick={() => setSortOption("lastEdited")}
                        bg={sortOption === "lastEdited" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Last edited</Text>
                          {sortOption === "lastEdited" && <Text color="blue.500">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="created"
                        onClick={() => setSortOption("created")}
                        bg={sortOption === "created" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Last created</Text>
                          {sortOption === "created" && <Text color="blue.500">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="title"
                        onClick={() => setSortOption("title")}
                        bg={sortOption === "title" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Title A-Z</Text>
                          {sortOption === "title" && <Text color="blue.500">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="author"
                        onClick={() => setSortOption("author")}
                        bg={sortOption === "author" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Author A-Z</Text>
                          {sortOption === "author" && <Text color="blue.500">✓</Text>}
                        </HStack>
                      </Menu.Item>
                    </Menu.Content>
                  </Menu.Positioner>
                </Menu.Root>

                {/* View Toggle */}
                <HStack gap={1}>
                  <Tooltip.Root openDelay={300} closeDelay={50}>
                    <Tooltip.Trigger asChild>
                      <IconButton
                        aria-label="List view"
                        variant="ghost"
                        size="md"
                        color={viewType === "list" ? "blue.500" : "gray.500"}
                        bg={viewType === "list" ? "blue.50" : "white"}
                        boxShadow="sm"
                        borderRadius="xl"
                        _hover={{ bg: viewType === "list" ? "blue.100" : "gray.100" }}
                        onClick={() => setViewType("list")}
                      >
                        <LuList size={18} />
                      </IconButton>
                    </Tooltip.Trigger>
                    <Tooltip.Positioner>
                      <Tooltip.Content>List view</Tooltip.Content>
                    </Tooltip.Positioner>
                  </Tooltip.Root>
                  <Tooltip.Root openDelay={300} closeDelay={50}>
                    <Tooltip.Trigger asChild>
                      <IconButton
                        aria-label="Grid view"
                        variant="ghost"
                        size="md"
                        color={viewType === "grid" ? "blue.500" : "gray.500"}
                        bg={viewType === "grid" ? "blue.50" : "white"}
                        boxShadow="sm"
                        borderRadius="xl"
                        _hover={{ bg: viewType === "grid" ? "blue.100" : "gray.100" }}
                        onClick={() => setViewType("grid")}
                      >
                        <LuLayoutGrid size={18} />
                      </IconButton>
                    </Tooltip.Trigger>
                    <Tooltip.Positioner>
                      <Tooltip.Content>Grid view</Tooltip.Content>
                    </Tooltip.Positioner>
                  </Tooltip.Root>
                </HStack>
              </HStack>

              {/* Notes list/grid */}
              {filteredAndSortedNotes.length === 0 ? (
                <Box textAlign="center" py={8} color="gray.500">
                  <Text>No notes found</Text>
                  {searchQuery && <Text fontSize="sm">Try a different search term</Text>}
                </Box>
              ) : viewType === "list" ? (
                <VStack gap={2} align="stretch">
                  {filteredAndSortedNotes.map((note) => {
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
                          <Box minW={0} flex={1}>
                            <Tooltip.Root openDelay={300} closeDelay={50}>
                              <Tooltip.Trigger asChild>
                                <Text
                                  fontWeight="medium"
                                  color={displayTitle === "Untitled" ? "gray.500" : undefined}
                                  fontStyle={displayTitle === "Untitled" ? "italic" : undefined}
                                  truncate
                                >
                                  {displayTitle}
                                </Text>
                              </Tooltip.Trigger>
                              <Tooltip.Positioner>
                                <Tooltip.Content maxW="400px">{displayTitle}</Tooltip.Content>
                              </Tooltip.Positioner>
                            </Tooltip.Root>
                            <HStack gap={1} fontSize="xs" color="gray.500">
                              <Text whiteSpace="nowrap">{formatDate(note.lastVisited)}</Text>
                              {note.ownerName && (
                                <>
                                  <Text>·</Text>
                                  <Text whiteSpace="nowrap">by {note.ownerName}</Text>
                                </>
                              )}
                            </HStack>
                          </Box>

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
              ) : (
                /* Grid View */
                <Box
                  display="grid"
                  gridTemplateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }}
                  gap={4}
                >
                  {filteredAndSortedNotes.map((note) => {
                    const isOwner = isNoteOwner(note.id);
                    const displayTitle = getDisplayTitle(note.title, note.id);

                    return (
                      <Card.Root
                        key={note.id}
                        cursor="pointer"
                        _hover={{ bg: "gray.100", transform: "translateY(-2px)", boxShadow: "md" }}
                        transition="all 0.2s"
                        onClick={() => navigate(`/note/${note.id}`)}
                        h="200px"
                        overflow="hidden"
                        position="relative"
                      >
                        {/* Content area */}
                        <Box p={4} pb={14}>
                          {/* Title at top */}
                          <Tooltip.Root openDelay={300} closeDelay={50}>
                            <Tooltip.Trigger asChild>
                              <Text
                                fontWeight="semibold"
                                fontSize="md"
                                color={displayTitle === "Untitled" ? "gray.500" : undefined}
                                fontStyle={displayTitle === "Untitled" ? "italic" : undefined}
                                truncate
                                mb={2}
                                lineHeight="1.4"
                              >
                                {displayTitle}
                              </Text>
                            </Tooltip.Trigger>
                            <Tooltip.Positioner>
                              <Tooltip.Content maxW="300px">{displayTitle}</Tooltip.Content>
                            </Tooltip.Positioner>
                          </Tooltip.Root>

                          {/* Content preview - 4 lines */}
                          <Text
                            fontSize="sm"
                            color="gray.500"
                            overflow="hidden"
                            css={{
                              display: "-webkit-box",
                              WebkitLineClamp: 4,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {note.preview || "No content yet..."}
                          </Text>
                        </Box>

                        {/* Footer with gradient fade - absolute positioned */}
                        <Box
                          position="absolute"
                          bottom={0}
                          left={0}
                          right={0}
                          px={4}
                          pt={4}
                          pb={3}
                          bgGradient="to-t"
                          gradientFrom="gray.100"
                          gradientTo="transparent"
                        >
                          <HStack justify="space-between" align="flex-end">
                            <VStack align="start" gap={0}>
                              <Text fontSize="xs" color="gray.500">
                                {formatDate(note.lastVisited)}
                              </Text>
                              {note.ownerName && (
                                <Text fontSize="xs" color="gray.400" truncate maxW="150px">
                                  by {note.ownerName}
                                </Text>
                              )}
                            </VStack>

                            <Menu.Root>
                              <Menu.Trigger asChild>
                                <IconButton
                                  aria-label="Note options"
                                  variant="ghost"
                                  size="xs"
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
                        </Box>
                      </Card.Root>
                    );
                  })}
                </Box>
              )}

              {/* Results count */}
              {searchQuery || ownerFilter !== "all" ? (
                <Text fontSize="xs" color="gray.400" mt={2} textAlign="center">
                  Showing {filteredAndSortedNotes.length} of {recentNotes.length} notes
                </Text>
              ) : null}
            </Box>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
