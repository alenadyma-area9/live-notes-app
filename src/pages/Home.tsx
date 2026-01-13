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
import { LuPlus, LuEllipsisVertical, LuX, LuTrash2, LuShare2, LuCheck, LuFilter, LuArrowUpDown, LuList, LuLayoutGrid, LuCopy, LuLock, LuLockOpen, LuUsers, LuLink, LuZap, LuCircleX } from "react-icons/lu";
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
  const { recentNotes, removeRecentNote, addRecentNote, isNoteOwner, userId, viewType, setViewType, updateNoteLocked } = useAppStore();
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search, filter, sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("lastEdited");

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [pendingActionNoteId, setPendingActionNoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cmd+K shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const showToast = (message: string, type: "success" | "info" | "error" = "success") => {
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
      showToast("Failed to delete note", "error");
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
    const noteTitle = note?.title;
    const notePreview = note?.preview; // Copy the preview from source note
    // Check if it's an "untitled" note (empty, or matches "Note {id}" pattern)
    const isUntitled = !noteTitle || noteTitle === `Note ${pendingActionNoteId}`;
    const newTitle = isUntitled ? "(copy) Untitled" : `(copy) ${noteTitle}`;
    const newNoteId = generateNoteId();

    setIsDuplicating(true);

    try {
      const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";

      // Fetch the source note's state from server
      const stateRes = await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${pendingActionNoteId}/state`);
      if (!stateRes.ok) {
        throw new Error("Could not fetch source note state");
      }
      const { state: stateToUse } = await stateRes.json();

      if (!stateToUse) {
        throw new Error("Source note has no content");
      }

      // Send to server - server applies state directly to Y.Doc
      const initRes = await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${newNoteId}/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: stateToUse, title: newTitle }),
      });

      if (!initRes.ok) {
        throw new Error(`Server returned ${initRes.status}`);
      }
      console.log("[Duplicate] Server applied state");

      // Store marker for client to set owner info when note is opened
      sessionStorage.setItem(`duplicate:${newNoteId}`, "1");

      // Add to recent notes immediately with the new title and copy the preview
      addRecentNote(newNoteId, newTitle, true, notePreview);

      showToast(`Created "${newTitle}"`, "success");
    } catch (err) {
      console.error("[Duplicate] Failed:", err);
      showToast("Failed to duplicate note", "error");
    }

    setIsDuplicating(false);
    setDuplicateDialogOpen(false);
    setPendingActionNoteId(null);
  }, [pendingActionNoteId, recentNotes, addRecentNote]);

  const handleLockClick = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingActionNoteId(noteId);
    setLockDialogOpen(true);
  };

  const handleLockConfirm = useCallback(async () => {
    if (!pendingActionNoteId) return;

    const note = recentNotes.find(n => n.id === pendingActionNoteId);
    const newLockedState = !note?.isLocked;

    setIsLocking(true);
    try {
      const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${pendingActionNoteId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: newLockedState }),
      });

      if (res.ok) {
        updateNoteLocked(pendingActionNoteId, newLockedState);
        showToast(newLockedState ? "Note locked" : "Note unlocked", "success");
      } else {
        showToast("Failed to update lock status", "error");
      }
    } catch (err) {
      console.error("Failed to toggle lock:", err);
      showToast("Failed to update lock status", "error");
    }

    setIsLocking(false);
    setLockDialogOpen(false);
    setPendingActionNoteId(null);
  }, [pendingActionNoteId, recentNotes, updateNoteLocked]);

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

  // Check if user has any visible notes (not locked by others)
  const visibleNotes = useMemo(() => {
    return recentNotes.filter(note => !note.isLocked || note.ownerId === userId);
  }, [recentNotes, userId]);

  const hasVisibleNotes = visibleNotes.length > 0;

  // Filter and sort notes
  const filteredAndSortedNotes = useMemo(() => {
    let notes = [...recentNotes];

    // Hide locked notes from non-owners (they can still access via direct link)
    notes = notes.filter(note => !note.isLocked || note.ownerId === userId);

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
        case "title": {
          const titleA = getDisplayTitle(a.title, a.id).toLowerCase();
          const titleB = getDisplayTitle(b.title, b.id).toLowerCase();
          return titleA.localeCompare(titleB);
        }
        case "author": {
          const authorA = a.ownerName || "zzz"; // Put notes without author at end
          const authorB = b.ownerName || "zzz";
          return authorA.localeCompare(authorB);
        }
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
    <Box h="100vh" bg="#F8FAFC" overflow="auto">
      <Header />

      {/* Toast notification */}
      {toast && (
        <Box
          position="fixed"
          bottom={4}
          left="50%"
          transform="translateX(-50%)"
          bg={toast.type === "error" ? "red.500" : toast.type === "success" ? "green.500" : "#6366F1"}
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
          {toast.type === "error" ? <LuCircleX size={16} /> : <LuCheck size={16} />}
          <Text fontSize="sm" fontWeight="medium">{toast.message}</Text>
        </Box>
      )}

      {/* Full-page gradient background for empty state */}
      {!hasVisibleNotes && (
        <>
          <Box
            position="fixed"
            top={0}
            left={0}
            w="100vw"
            h="100vh"
            pointerEvents="none"
            zIndex={0}
            overflow="hidden"
          >
            {/* Purple blob - top left */}
            <Box
              position="absolute"
              top={{ base: "5%", md: "10%" }}
              left={{ base: "-10%", md: "10%" }}
              w={{ base: "350px", md: "500px" }}
              h={{ base: "350px", md: "500px" }}
              bg="rgba(139, 92, 246, 0.15)"
              borderRadius="full"
              filter="blur(100px)"
            />
            {/* Orange blob - bottom right */}
            <Box
              position="absolute"
              bottom={{ base: "10%", md: "15%" }}
              right={{ base: "-10%", md: "5%" }}
              w={{ base: "300px", md: "450px" }}
              h={{ base: "300px", md: "450px" }}
              bg="rgba(251, 191, 146, 0.2)"
              borderRadius="full"
              filter="blur(100px)"
            />
          </Box>
        </>
      )}

      <Container maxW="900px" py={{ base: 4, md: 4 }} position="relative" zIndex={1}>
        <VStack gap={6} align="stretch">
          {!hasVisibleNotes ? (
            /* Empty state - premium onboarding */
            <Box
              minH={{ base: "auto", md: "calc(100vh - 120px)" }}
              display="flex"
              flexDirection="column"
              justifyContent="center"
              alignItems="center"
              position="relative"
            >

              {/* Frosted Glass Card */}
              <Box
                bg="rgba(255, 255, 255, 0.8)"
                backdropFilter="blur(12px)"
                border="1px solid rgba(255, 255, 255, 0.5)"
                borderRadius="2xl"
                p={{ base: 5, md: 8 }}
                mx={{ base: 4, md: 4 }}
                maxW="380px"
                w={{ base: "calc(100% - 32px)", md: "full" }}
                boxShadow="0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.6)"
                position="relative"
                zIndex={1}
              >
                {/* Hero section */}
                <Box textAlign="center" mb={6}>
                  <Text
                    fontSize={{ base: "xl", md: "2xl" }}
                    fontWeight="800"
                    color="gray.800"
                    mb={1}
                    letterSpacing="-0.02em"
                  >
                    Welcome to Live Notes{" "}
                    <Text as="span" display="inline">✨</Text>
                  </Text>
                  <Text
                    fontSize="sm"
                    color="#4B5563"
                    mx="auto"
                    lineHeight="1.5"
                  >
                    Real-time collaborative notes.<br />No sign-up required.
                  </Text>
                </Box>

                {/* High-End CTA Button with Gradient */}
                <Button
                  bgGradient="linear(135deg, #7C3AED 0%, #6366F1 100%)"
                  bg="linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)"
                  color="white"
                  size="md"
                  w="full"
                  onClick={handleCreateNote}
                  borderRadius="xl"
                  h={11}
                  fontSize="sm"
                  fontWeight="semibold"
                  boxShadow="0 10px 15px -3px rgba(99, 102, 241, 0.3), 0 4px 6px -2px rgba(99, 102, 241, 0.2)"
                  _hover={{
                    bg: "linear-gradient(135deg, #6D28D9 0%, #4F46E5 100%)",
                    boxShadow: "0 14px 20px -3px rgba(99, 102, 241, 0.4), 0 6px 8px -2px rgba(99, 102, 241, 0.25)",
                    transform: "translateY(-2px)"
                  }}
                  _active={{
                    transform: "translateY(0)",
                    boxShadow: "0 8px 12px -3px rgba(99, 102, 241, 0.25)"
                  }}
                  transition="all 0.2s ease"
                >
                  <LuPlus /> Create Your First Note
                </Button>

                {/* Features - compact list */}
                <VStack gap={2.5} mt={6} w="full">
                  <HStack gap={2.5} justify="center" w="full">
                    <Box
                      color="#6366F1"
                      bg="rgba(99, 102, 241, 0.08)"
                      p={2}
                      borderRadius="lg"
                    >
                      <LuUsers size={16} />
                    </Box>
                    <Text fontSize="xs" color="#4B5563" fontWeight="medium">
                      Real-time collaboration
                    </Text>
                  </HStack>
                  <HStack gap={2.5} justify="center" w="full">
                    <Box
                      color="#10B981"
                      bg="rgba(34, 197, 94, 0.08)"
                      p={2}
                      borderRadius="lg"
                    >
                      <LuLink size={16} />
                    </Box>
                    <Text fontSize="xs" color="#4B5563" fontWeight="medium">
                      Share instantly, no sign-up
                    </Text>
                  </HStack>
                  <HStack gap={2.5} justify="center" w="full">
                    <Box
                      color="#F59E0B"
                      bg="rgba(245, 158, 11, 0.08)"
                      p={2}
                      borderRadius="lg"
                    >
                      <LuZap size={16} />
                    </Box>
                    <Text fontSize="xs" color="#4B5563" fontWeight="medium">
                      Auto-saved with history
                    </Text>
                  </HStack>
                </VStack>
              </Box>


            </Box>
          ) : (
            <Box>
              {/* Search, Filter, Sort Controls */}
              {/* Desktop: Single row | Mobile: Two rows */}
              <Box mb={4}>
                {/* Desktop layout */}
                <HStack gap={3} display={{ base: "none", md: "flex" }}>
                  <Input
                    ref={searchInputRef}
                    placeholder="Search notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    bg="white"
                    border="none"
                    borderRadius="xl"
                    fontSize="md"
                    boxShadow="sm"
                    px={4}
                    flex={1}
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ boxShadow: "md" }}
                    _focus={{ boxShadow: "0 0 0 2px #818CF8", outline: "none" }}
                  />

                  <Button
                    bg="#6366F1"
                    color="white"
                    size="sm"
                    onClick={handleCreateNote}
                    borderRadius="lg"
                    px={3}
                    h={10}
                    boxShadow="sm"
                    fontWeight="medium"
                    flexShrink={0}
                    _hover={{ bg: "#4F46E5", boxShadow: "md", transform: "translateY(-1px)" }}
                    transition="all 0.2s"
                  >
                    <LuPlus size={16} /> New
                  </Button>

                {/* Filter by owner */}
                <Menu.Root positioning={{ placement: "bottom-start" }}>
                  <Menu.Trigger asChild>
                    <IconButton
                      aria-label={getFilterLabel()}
                      title={getFilterLabel()}
                      variant="ghost"
                      size="md"
                      color={ownerFilter !== "all" ? "#6366F1" : "gray.500"}
                      bg={ownerFilter !== "all" ? "#EEF2FF" : "white"}
                      boxShadow="sm"
                      borderRadius="xl"
                      _hover={{ bg: ownerFilter !== "all" ? "#E0E7FF" : "gray.100" }}
                    >
                      <LuFilter size={18} />
                    </IconButton>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content minW="150px">
                      <Menu.Item
                        value="all"
                        onClick={() => setOwnerFilter("all")}
                        bg={ownerFilter === "all" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>All notes</Text>
                          {ownerFilter === "all" && <Text color="#6366F1">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="me"
                        onClick={() => setOwnerFilter("me")}
                        bg={ownerFilter === "me" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>My notes</Text>
                          {ownerFilter === "me" && <Text color="#6366F1">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="others"
                        onClick={() => setOwnerFilter("others")}
                        bg={ownerFilter === "others" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Shared with me</Text>
                          {ownerFilter === "others" && <Text color="#6366F1">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="locked"
                        onClick={() => setOwnerFilter("locked")}
                        bg={ownerFilter === "locked" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <HStack gap={2}>
                            <LuLock size={14} />
                            <Text>Locked</Text>
                          </HStack>
                          {ownerFilter === "locked" && <Text color="#6366F1">✓</Text>}
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
                      color={sortOption !== "lastEdited" ? "#6366F1" : "gray.500"}
                      bg={sortOption !== "lastEdited" ? "#EEF2FF" : "white"}
                      boxShadow="sm"
                      borderRadius="xl"
                      _hover={{ bg: sortOption !== "lastEdited" ? "#E0E7FF" : "gray.100" }}
                    >
                      <LuArrowUpDown size={18} />
                    </IconButton>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content minW="150px">
                      <Menu.Item
                        value="lastEdited"
                        onClick={() => setSortOption("lastEdited")}
                        bg={sortOption === "lastEdited" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Last edited</Text>
                          {sortOption === "lastEdited" && <Text color="#6366F1">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="created"
                        onClick={() => setSortOption("created")}
                        bg={sortOption === "created" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Last created</Text>
                          {sortOption === "created" && <Text color="#6366F1">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="title"
                        onClick={() => setSortOption("title")}
                        bg={sortOption === "title" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Title A-Z</Text>
                          {sortOption === "title" && <Text color="#6366F1">✓</Text>}
                        </HStack>
                      </Menu.Item>
                      <Menu.Item
                        value="author"
                        onClick={() => setSortOption("author")}
                        bg={sortOption === "author" ? "#EEF2FF" : undefined}
                      >
                        <HStack justify="space-between" w="full">
                          <Text>Author A-Z</Text>
                          {sortOption === "author" && <Text color="#6366F1">✓</Text>}
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
                        color={viewType === "list" ? "#6366F1" : "gray.500"}
                        bg={viewType === "list" ? "#EEF2FF" : "white"}
                        boxShadow="sm"
                        borderRadius="xl"
                        _hover={{ bg: viewType === "list" ? "#E0E7FF" : "gray.100" }}
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
                        color={viewType === "grid" ? "#6366F1" : "gray.500"}
                        bg={viewType === "grid" ? "#EEF2FF" : "white"}
                        boxShadow="sm"
                        borderRadius="xl"
                        _hover={{ bg: viewType === "grid" ? "#E0E7FF" : "gray.100" }}
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

                {/* Mobile layout - single row with menu */}
                <HStack gap={2} display={{ base: "flex", md: "none" }}>
                  <Input
                    placeholder="Search notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    bg="white"
                    border="none"
                    borderRadius="xl"
                    fontSize="md"
                    boxShadow="sm"
                    px={4}
                    flex={1}
                    _placeholder={{ color: "gray.400" }}
                    _focus={{ boxShadow: "0 0 0 2px #818CF8", outline: "none" }}
                  />
                  <IconButton
                    aria-label="New note"
                    bg="#6366F1"
                    color="white"
                    size="sm"
                    onClick={handleCreateNote}
                    borderRadius="lg"
                    boxShadow="sm"
                    _hover={{ bg: "#4F46E5" }}
                  >
                    <LuPlus size={18} />
                  </IconButton>
                  <Menu.Root positioning={{ placement: "bottom-end" }}>
                    <Menu.Trigger asChild>
                      <IconButton
                        aria-label="Options"
                        variant="ghost"
                        size="sm"
                        color={(ownerFilter !== "all" || sortOption !== "lastEdited") ? "#6366F1" : "gray.500"}
                        bg={(ownerFilter !== "all" || sortOption !== "lastEdited") ? "#EEF2FF" : "white"}
                        boxShadow="sm"
                        borderRadius="lg"
                      >
                        <LuEllipsisVertical size={18} />
                      </IconButton>
                    </Menu.Trigger>
                    <Portal>
                      <Menu.Positioner>
                        <Menu.Content minW="180px">
                          {/* Filter section */}
                          <Text px={3} py={1} fontSize="xs" fontWeight="semibold" color="gray.500">Filter</Text>
                          <Menu.Item value="filter-all" onClick={() => setOwnerFilter("all")} bg={ownerFilter === "all" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>All notes</Text>{ownerFilter === "all" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Item value="filter-me" onClick={() => setOwnerFilter("me")} bg={ownerFilter === "me" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>My notes</Text>{ownerFilter === "me" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Item value="filter-others" onClick={() => setOwnerFilter("others")} bg={ownerFilter === "others" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>Shared with me</Text>{ownerFilter === "others" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Item value="filter-locked" onClick={() => setOwnerFilter("locked")} bg={ownerFilter === "locked" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>Locked</Text>{ownerFilter === "locked" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Separator />
                          {/* Sort section */}
                          <Text px={3} py={1} fontSize="xs" fontWeight="semibold" color="gray.500">Sort by</Text>
                          <Menu.Item value="sort-lastEdited" onClick={() => setSortOption("lastEdited")} bg={sortOption === "lastEdited" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>Last edited</Text>{sortOption === "lastEdited" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Item value="sort-created" onClick={() => setSortOption("created")} bg={sortOption === "created" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>Last created</Text>{sortOption === "created" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Item value="sort-title" onClick={() => setSortOption("title")} bg={sortOption === "title" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>Title A-Z</Text>{sortOption === "title" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Item value="sort-author" onClick={() => setSortOption("author")} bg={sortOption === "author" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><Text>Author A-Z</Text>{sortOption === "author" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Separator />
                          {/* View section */}
                          <Text px={3} py={1} fontSize="xs" fontWeight="semibold" color="gray.500">View</Text>
                          <Menu.Item value="view-list" onClick={() => setViewType("list")} bg={viewType === "list" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><HStack gap={2}><LuList size={14} /><Text>List</Text></HStack>{viewType === "list" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                          <Menu.Item value="view-grid" onClick={() => setViewType("grid")} bg={viewType === "grid" ? "#EEF2FF" : undefined}>
                            <HStack justify="space-between" w="full"><HStack gap={2}><LuLayoutGrid size={14} /><Text>Grid</Text></HStack>{viewType === "grid" && <Text color="#6366F1">✓</Text>}</HStack>
                          </Menu.Item>
                        </Menu.Content>
                      </Menu.Positioner>
                    </Portal>
                  </Menu.Root>
                </HStack>
              </Box>

              {/* Notes list/grid */}
              {filteredAndSortedNotes.length === 0 ? (
                <Box textAlign="center" py={8} color="gray.500">
                  <Text>No notes found</Text>
                  {searchQuery && <Text fontSize="sm">Try a different search term</Text>}
                </Box>
              ) : viewType === "list" ? (
                <VStack gap={3} align="stretch">
                  {filteredAndSortedNotes.map((note) => {
                    const isOwner = isNoteOwner(note.id);
                    const displayTitle = getDisplayTitle(note.title, note.id);

                    return (
                      <Card.Root
                        key={note.id}
                        p={3}
                        cursor="pointer"
                        bg="white"
                        border="none"
                        boxShadow="0 2px 8px rgba(0, 0, 0, 0.06)"
                        borderRadius="xl"
                        _hover={{ boxShadow: "0 4px 16px rgba(0, 0, 0, 0.1)", transform: "translateY(-1px)" }}
                        transition="all 0.2s"
                        onClick={() => navigate(`/note/${note.id}`)}
                      >
                        <HStack justify="space-between">
                          <Box minW={0} flex={1} opacity={note.isLocked ? 0.6 : 1}>
                            <HStack gap={2}>
                              {note.isLocked && (
                                <Box
                                  color="gray.500"
                                  bg="gray.100"
                                  px={1.5}
                                  py={0.5}
                                  borderRadius="full"
                                  fontSize="2xs"
                                  fontWeight="bold"
                                  textTransform="uppercase"
                                  letterSpacing="wide"
                                  flexShrink={0}
                                >
                                  Locked
                                </Box>
                              )}
                              <TruncatedText
                                fontWeight="medium"
                                color={displayTitle === "Untitled" ? "gray.400" : undefined}
                                fontStyle={displayTitle === "Untitled" ? "italic" : undefined}
                              >
                                {displayTitle}
                              </TruncatedText>
                            </HStack>
                            <HStack gap={1} fontSize="xs" color="gray.500" ml={note.isLocked ? 0 : 0}>
                              <Text whiteSpace="nowrap">{formatDate(note.lastVisited)}</Text>
                              {note.ownerName && (
                                <>
                                  <Text>·</Text>
                                  <Text
                                    whiteSpace="nowrap"
                                    textTransform="uppercase"
                                    letterSpacing="wide"
                                    fontWeight="medium"
                                    fontSize="2xs"
                                  >
                                    by {note.ownerName}
                                  </Text>
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
                                    onClick={(e) => !note.isLocked && handleShare(note.id, e as unknown as React.MouseEvent)}
                                    disabled={note.isLocked}
                                    color={note.isLocked ? "gray.400" : undefined}
                                  >
                                    <LuShare2 />
                                    {note.isLocked ? "Unlock to share" : "Share"}
                                  </Menu.Item>
                                  <Menu.Item
                                    value="duplicate"
                                    onClick={(e) => handleDuplicateClick(note.id, e as unknown as React.MouseEvent)}
                                  >
                                    <LuCopy />
                                    Duplicate
                                  </Menu.Item>
                                  {!isOwner && (
                                    <Menu.Item
                                      value="remove"
                                      onClick={(e) => handleRemoveFromList(note.id, e as unknown as React.MouseEvent)}
                                    >
                                      <LuX />
                                      Remove from my list
                                    </Menu.Item>
                                  )}
                                  {isOwner && (
                                    <>
                                      <Menu.Item
                                        value="lock"
                                        onClick={(e) => handleLockClick(note.id, e as unknown as React.MouseEvent)}
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
                        bg="white"
                        border="none"
                        boxShadow="0 4px 20px rgba(0, 0, 0, 0.08)"
                        borderRadius="2xl"
                        _hover={{ transform: "translateY(-4px)", boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)" }}
                        transition="all 0.2s"
                        onClick={() => navigate(`/note/${note.id}`)}
                        h="200px"
                        overflow="hidden"
                        position="relative"
                      >
                        {/* Lock indicator - quiet pill badge */}
                        {note.isLocked && (
                          <Box
                            position="absolute"
                            top={3}
                            right={3}
                            color="gray.500"
                            bg="gray.100"
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            fontSize="2xs"
                            fontWeight="bold"
                            textTransform="uppercase"
                            letterSpacing="wider"
                          >
                            Locked
                          </Box>
                        )}

                        {/* Content area - reduced opacity when locked, extra right padding when locked to avoid badge overlap */}
                        <Box p={4} pb={14} pr={note.isLocked ? 16 : 4} opacity={note.isLocked ? 0.5 : 1}>
                          {/* Title at top */}
                          <TruncatedText
                            fontWeight="semibold"
                            fontSize="md"
                            color={displayTitle === "Untitled" ? "gray.400" : undefined}
                            fontStyle={displayTitle === "Untitled" ? "italic" : undefined}
                            mb={2}
                            lineHeight="1.4"
                          >
                            {displayTitle}
                          </TruncatedText>

                          {/* Content preview - 4 lines */}
                          <Text
                            fontSize="sm"
                            color={note.preview ? "gray.500" : "gray.400"}
                            fontStyle={note.preview ? undefined : "italic"}
                            lineHeight="1.6"
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
                          gradientFrom="gray.50"
                          gradientTo="transparent"
                        >
                          <HStack justify="space-between" align="flex-end">
                            <VStack align="start" gap={0}>
                              <Text fontSize="xs" color="gray.500">
                                {formatDate(note.lastVisited)}
                              </Text>
                              {note.ownerName && (
                                <Text
                                  fontSize="2xs"
                                  color="gray.400"
                                  truncate
                                  maxW="120px"
                                  textTransform="uppercase"
                                  letterSpacing="wide"
                                  fontWeight="medium"
                                >
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
                                      onClick={(e) => !note.isLocked && handleShare(note.id, e as unknown as React.MouseEvent)}
                                      disabled={note.isLocked}
                                      color={note.isLocked ? "gray.400" : undefined}
                                    >
                                      <LuShare2 />
                                      {note.isLocked ? "Unlock to share" : "Share"}
                                    </Menu.Item>
                                    <Menu.Item
                                      value="duplicate"
                                      onClick={(e) => handleDuplicateClick(note.id, e as unknown as React.MouseEvent)}
                                    >
                                      <LuCopy />
                                      Duplicate
                                    </Menu.Item>
                                    {!isOwner && (
                                      <Menu.Item
                                        value="remove"
                                        onClick={(e) => handleRemoveFromList(note.id, e as unknown as React.MouseEvent)}
                                      >
                                        <LuX />
                                        Remove from my list
                                      </Menu.Item>
                                    )}
                                    {isOwner && (
                                      <>
                                        <Menu.Item
                                          value="lock"
                                          onClick={(e) => handleLockClick(note.id, e as unknown as React.MouseEvent)}
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
                  Showing {filteredAndSortedNotes.length} of {visibleNotes.length} notes
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

      {/* Lock/Unlock Confirmation Dialog */}
      <ConfirmDialog
        isOpen={lockDialogOpen}
        onClose={() => {
          if (!isLocking) {
            setLockDialogOpen(false);
            setPendingActionNoteId(null);
          }
        }}
        onConfirm={handleLockConfirm}
        title={pendingNote?.isLocked ? "Unlock Note" : "Lock Note"}
        variant="warning"
        confirmText={pendingNote?.isLocked ? "Unlock" : "Lock"}
        cancelText="Cancel"
        isLoading={isLocking}
        description={
          pendingNote?.isLocked ? (
            <VStack gap={2}>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Make "{pendingNote?.title || "Untitled"}" accessible again?
              </Text>
              <Text fontSize="xs" color="gray.500" textAlign="center">
                Anyone with the link will be able to view and edit.
              </Text>
            </VStack>
          ) : (
            <VStack gap={2}>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Restrict access to "{pendingNote?.title || "Untitled"}"?
              </Text>
              <Box bg="orange.50" p={3} borderRadius="md" w="full">
                <VStack gap={1} align="start">
                  <Text fontSize="xs" color="orange.700">
                    • Only you will be able to view and edit
                  </Text>
                  <Text fontSize="xs" color="orange.700">
                    • Others will see "This note is locked"
                  </Text>
                  <Text fontSize="xs" color="orange.700">
                    • You can unlock anytime
                  </Text>
                </VStack>
              </Box>
            </VStack>
          )
        }
      />
    </Box>
  );
}
