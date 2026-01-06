import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
import { LuPlus, LuEllipsisVertical, LuX, LuTrash2, LuShare2, LuCheck, LuFilter, LuArrowUpDown, LuList, LuLayoutGrid, LuCopy, LuLock, LuLockOpen } from "react-icons/lu";
import { useAppStore } from "../store";
import { generateNoteId } from "../utils";
import { Header } from "../components/Header";
import { ConfirmDialog } from "../components/ConfirmDialog";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

// Component that shows tooltip only when text is truncated
function TruncatedText({
  children,
  maxW,
  ...textProps
}: {
  children: string;
  maxW?: string;
} & React.ComponentProps<typeof Text>) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [children]);

  const textElement = (
    <Text ref={textRef} truncate maxW={maxW} {...textProps}>
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
          <Tooltip.Content maxW="400px" zIndex={9999}>{children}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}

type OwnerFilter = "all" | "me" | "others" | "locked";
type SortOption = "lastEdited" | "created" | "title" | "author";

export function Home() {
  const navigate = useNavigate();
  const { recentNotes, removeRecentNote, addRecentNote, isNoteOwner, userId, viewType, setViewType } = useAppStore();
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);

  // Search, filter, sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("lastEdited");

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [pendingActionNoteId, setPendingActionNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteClick = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingActionNoteId(noteId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!pendingActionNoteId) return;

    setIsDeleting(true);
    try {
      const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";
      await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${pendingActionNoteId}/delete`, {
        method: "POST",
      });
      removeRecentNote(pendingActionNoteId);
      showToast("Note deleted", "info");
    } catch (err) {
      console.error("Failed to delete note:", err);
      showToast("Failed to delete note", "info");
    }
    setIsDeleting(false);
    setDeleteDialogOpen(false);
    setPendingActionNoteId(null);
  }, [pendingActionNoteId, removeRecentNote]);

  const handleDuplicateClick = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingActionNoteId(noteId);
    setDuplicateDialogOpen(true);
  };

  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleDuplicateConfirm = useCallback(async () => {
    if (!pendingActionNoteId) return;

    const note = recentNotes.find(n => n.id === pendingActionNoteId);
    const noteTitle = note?.title || "Untitled";
    const newTitle = `(copy) ${noteTitle}`;
    const newNoteId = generateNoteId();

    setIsDuplicating(true);

    try {
      // Fetch the source note's state from server
      const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${pendingActionNoteId}/state`);

      if (res.ok) {
        const data = await res.json();

        // Store in sessionStorage for the new note to pick up when opened
        sessionStorage.setItem(`duplicate:${newNoteId}`, JSON.stringify({
          state: data.state,
          title: newTitle
        }));

        // Add to recent notes immediately with the new title
        addRecentNote(newNoteId, newTitle, true);

        showToast(`Created "${newTitle}"`, "success");
      } else {
        showToast("Failed to duplicate note", "info");
      }
    } catch (err) {
      console.error("Failed to duplicate:", err);
      showToast("Failed to duplicate note", "info");
    }

    setIsDuplicating(false);
    setDuplicateDialogOpen(false);
    setPendingActionNoteId(null);
  }, [pendingActionNoteId, recentNotes, addRecentNote]);

  // Get pending note info for dialogs
  const pendingNote = pendingActionNoteId ? recentNotes.find(n => n.id === pendingActionNoteId) : null;

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
    } else if (ownerFilter === "locked") {
      notes = notes.filter(note => note.isLocked);
    }

    // Sort - locked notes first when not filtering by locked
    notes.sort((a, b) => {
      // Locked notes first (only if not already filtering by locked)
      if (ownerFilter !== "locked") {
        if (a.isLocked && !b.isLocked) return -1;
        if (!a.isLocked && b.isLocked) return 1;
      }
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
      case "locked": return "Locked notes";
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
                <Input
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  flex={1}
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  fontSize="md"
                  _placeholder={{ color: "gray.400" }}
                  _hover={{ borderColor: "gray.300" }}
                  _focus={{ borderColor: "blue.400", boxShadow: "0 0 0 1px var(--chakra-colors-blue-400)", outline: "none" }}
                />

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
                      <Menu.Item
                        value="locked"
                        onClick={() => setOwnerFilter("locked")}
                        bg={ownerFilter === "locked" ? "blue.50" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <HStack gap={2}>
                            <LuLock size={14} />
                            <Text>Locked</Text>
                          </HStack>
                          {ownerFilter === "locked" && <Text color="blue.500">✓</Text>}
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
                            <HStack gap={2}>
                              {note.isLocked && (
                                <Tooltip.Root openDelay={200} closeDelay={50}>
                                  <Tooltip.Trigger asChild>
                                    <Box color="orange.500" flexShrink={0} cursor="default">
                                      <LuLock size={14} />
                                    </Box>
                                  </Tooltip.Trigger>
                                  <Tooltip.Positioner>
                                    <Tooltip.Content>
                                      Locked - only owner can access
                                    </Tooltip.Content>
                                  </Tooltip.Positioner>
                                </Tooltip.Root>
                              )}
                              <TruncatedText
                                fontWeight="medium"
                                color={displayTitle === "Untitled" ? "gray.500" : undefined}
                                fontStyle={displayTitle === "Untitled" ? "italic" : undefined}
                              >
                                {displayTitle}
                              </TruncatedText>
                            </HStack>
                            <HStack gap={1} fontSize="xs" color="gray.500" ml={note.isLocked ? 6 : 0}>
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
                                    value="duplicate"
                                    onClick={(e) => handleDuplicateClick(note.id, e as unknown as React.MouseEvent)}
                                  >
                                    <LuCopy />
                                    Duplicate
                                  </Menu.Item>
                                  <Menu.Item
                                    value="remove"
                                    onClick={(e) => handleRemoveFromList(note.id, e as unknown as React.MouseEvent)}
                                  >
                                    <LuX />
                                    Remove from my list
                                  </Menu.Item>
                                  {isOwner && (
                                    <>
                                      <Menu.Item
                                        value="lock"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/note/${note.id}?action=${note.isLocked ? 'unlock' : 'lock'}`);
                                        }}
                                      >
                                        {note.isLocked ? <LuLockOpen /> : <LuLock />}
                                        {note.isLocked ? "Unlock note" : "Lock note"}
                                      </Menu.Item>
                                      <Menu.Item
                                        value="delete"
                                        color="red.500"
                                        onClick={(e) => handleDeleteClick(note.id, e as unknown as React.MouseEvent)}
                                      >
                                        <LuTrash2 />
                                        Delete note
                                      </Menu.Item>
                                    </>
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
                        {/* Lock indicator */}
                        {note.isLocked && (
                          <Tooltip.Root openDelay={200} closeDelay={50}>
                            <Tooltip.Trigger asChild>
                              <Box
                                position="absolute"
                                top={2}
                                right={2}
                                color="orange.500"
                                bg="orange.50"
                                p={1}
                                borderRadius="md"
                                cursor="default"
                              >
                                <LuLock size={14} />
                              </Box>
                            </Tooltip.Trigger>
                            <Tooltip.Positioner>
                              <Tooltip.Content>
                                This note is locked. Only the owner can view and edit.
                              </Tooltip.Content>
                            </Tooltip.Positioner>
                          </Tooltip.Root>
                        )}

                        {/* Content area */}
                        <Box p={4} pb={14}>
                          {/* Title at top */}
                          <TruncatedText
                            fontWeight="semibold"
                            fontSize="md"
                            color={displayTitle === "Untitled" ? "gray.500" : undefined}
                            fontStyle={displayTitle === "Untitled" ? "italic" : undefined}
                            mb={2}
                            lineHeight="1.4"
                          >
                            {displayTitle}
                          </TruncatedText>

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
                                      value="duplicate"
                                      onClick={(e) => handleDuplicateClick(note.id, e as unknown as React.MouseEvent)}
                                    >
                                      <LuCopy />
                                      Duplicate
                                    </Menu.Item>
                                    <Menu.Item
                                      value="remove"
                                      onClick={(e) => handleRemoveFromList(note.id, e as unknown as React.MouseEvent)}
                                    >
                                      <LuX />
                                      Remove from my list
                                    </Menu.Item>
                                    {isOwner && (
                                      <>
                                        <Menu.Item
                                          value="lock"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/note/${note.id}?action=${note.isLocked ? 'unlock' : 'lock'}`);
                                          }}
                                        >
                                          {note.isLocked ? <LuLockOpen /> : <LuLock />}
                                          {note.isLocked ? "Unlock note" : "Lock note"}
                                        </Menu.Item>
                                        <Menu.Item
                                          value="delete"
                                          color="red.500"
                                          onClick={(e) => handleDeleteClick(note.id, e as unknown as React.MouseEvent)}
                                        >
                                          <LuTrash2 />
                                          Delete note
                                        </Menu.Item>
                                      </>
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setPendingActionNoteId(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Note"
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        description={
          <VStack gap={2}>
            <Text fontSize="sm" color="gray.600" textAlign="center">
              Are you sure you want to delete "{pendingNote?.title || "Untitled"}"?
            </Text>
            <Text fontSize="xs" color="red.500" textAlign="center">
              This action cannot be undone.
            </Text>
          </VStack>
        }
      />

      {/* Duplicate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={duplicateDialogOpen}
        onClose={() => {
          if (!isDuplicating) {
            setDuplicateDialogOpen(false);
            setPendingActionNoteId(null);
          }
        }}
        onConfirm={handleDuplicateConfirm}
        title="Duplicate Note"
        variant="duplicate"
        confirmText="Duplicate"
        cancelText="Cancel"
        isLoading={isDuplicating}
        description={
          <VStack gap={3} align="stretch">
            <Text fontSize="sm" color="gray.600" textAlign="center">
              Create a copy of "{pendingNote?.title || "Untitled"}"?
            </Text>
            <Box bg="gray.100" p={3} borderRadius="md">
              <VStack gap={2} align="start">
                <HStack gap={2}>
                  <Text fontSize="xs" color="green.600" fontWeight="medium">✓ Will copy:</Text>
                  <Text fontSize="xs" color="gray.600">Title, All content</Text>
                </HStack>
                <HStack gap={2}>
                  <Text fontSize="xs" color="orange.600" fontWeight="medium">✗ Won't copy:</Text>
                  <Text fontSize="xs" color="gray.600">Version history, Ownership</Text>
                </HStack>
              </VStack>
            </Box>
          </VStack>
        }
      />
    </Box>
  );
}
