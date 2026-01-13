import { useCallback, useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Text,
  VStack,
  Button,
} from "@chakra-ui/react";
import { LuFileQuestion } from "react-icons/lu";
import { CollaborativeEditor } from "../components/Editor";
import { useAppStore } from "../store";
import { ConfirmDialog } from "../components/ConfirmDialog";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

export function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addRecentNote, removeRecentNote, isNoteOwner, recentNotes } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingLockAction, setPendingLockAction] = useState<'lock' | 'unlock' | null>(null);
  const [noteExists, setNoteExists] = useState<boolean | null>(null); // null = checking, true/false = result

  const isOwner = noteId ? isNoteOwner(noteId) : false;
  const currentNote = noteId ? recentNotes.find(n => n.id === noteId) : null;

  // Check if note exists (skip for notes we know about locally, or if creating new)
  useEffect(() => {
    if (!noteId) return;

    // If we have this note in our recent list, it exists
    if (recentNotes.some(n => n.id === noteId)) {
      setNoteExists(true);
      return;
    }

    // If there's duplicate data in sessionStorage, it's being created
    if (sessionStorage.getItem(`duplicate:${noteId}`)) {
      setNoteExists(true);
      return;
    }

    // Check with server
    const checkExists = async () => {
      try {
        const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";
        const res = await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${noteId}/exists`);
        if (res.ok) {
          const data = await res.json();
          setNoteExists(data.exists);
        } else {
          // Endpoint might not exist yet, assume note exists and let editor handle it
          setNoteExists(true);
        }
      } catch {
        // On error, assume note exists and let editor handle it
        setNoteExists(true);
      }
    };

    checkExists();
  }, [noteId, recentNotes]);

  // Check for actions in URL
  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "duplicate") {
      setPendingDuplicate(true);
      setSearchParams({}, { replace: true });
    } else if (action === "lock" || action === "unlock") {
      setPendingLockAction(action);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!noteId) return;

    setIsDeleting(true);
    try {
      const protocol = PARTYKIT_HOST.includes("localhost") ? "http" : "https";
      await fetch(`${protocol}://${PARTYKIT_HOST}/parties/notes/${noteId}/delete`, {
        method: "POST",
      });
      removeRecentNote(noteId);
      setDeleteDialogOpen(false);
      navigate("/");
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
    setIsDeleting(false);
  }, [noteId, removeRecentNote, navigate]);

  const handleBack = () => navigate("/");

  const handleDuplicate = (newNoteId: string, newTitle: string) => {
    console.log("[NotePage] handleDuplicate called:", newNoteId, newTitle);
    setPendingDuplicate(false);
    addRecentNote(newNoteId, newTitle, true); // Mark as owner
    console.log("[NotePage] Navigating to new note...");
    navigate(`/note/${newNoteId}`);
  };

  if (!noteId) {
    return <Text>Invalid note ID</Text>;
  }

  // Still checking if note exists
  if (noteExists === null) {
    return (
      <Box h="100vh" bg="#F8FAFC" display="flex" alignItems="center" justifyContent="center">
        <Text color="gray.500">Loading...</Text>
      </Box>
    );
  }

  // Note doesn't exist
  if (noteExists === false) {
    return (
      <Box h="100vh" bg="#F8FAFC" display="flex" alignItems="center" justifyContent="center" p={4}>
        <VStack
          bg="white"
          borderRadius="2xl"
          boxShadow="0 8px 32px rgba(0, 0, 0, 0.08)"
          p={10}
          maxW="400px"
          w="full"
          gap={4}
          textAlign="center"
        >
          <Box
            w={16}
            h={16}
            bg="gray.100"
            borderRadius="2xl"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="gray.400"
          >
            <LuFileQuestion size={32} />
          </Box>
          <VStack gap={1}>
            <Text fontSize="xl" fontWeight="semibold" color="gray.800">
              Note not found
            </Text>
            <Text fontSize="sm" color="gray.500" lineHeight="1.6">
              This note doesn't exist or may have been deleted.
            </Text>
          </VStack>
          <Button
            bg="#6366F1"
            color="white"
            size="md"
            borderRadius="xl"
            px={6}
            mt={2}
            _hover={{ bg: "#4F46E5", transform: "translateY(-1px)" }}
            transition="all 0.2s"
            onClick={() => navigate("/")}
          >
            Go to my notes
          </Button>
        </VStack>
      </Box>
    );
  }

  return (
    <Box h="100vh" bg="#F8FAFC" overflow="hidden" display="flex" flexDirection="column">
      <Box flex={1} w="100%" overflow="hidden">
        <CollaborativeEditor
          noteId={noteId}
          partykitHost={PARTYKIT_HOST}
          onTitleChange={handleTitleChange}
          onBack={handleBack}
          onShare={handleCopyLink}
          onDelete={isOwner ? handleDeleteClick : undefined}
          onDuplicate={handleDuplicate}
          autoDuplicate={pendingDuplicate}
          autoLockAction={pendingLockAction}
          onLockActionComplete={() => setPendingLockAction(null)}
          shareButtonState={copied ? "copied" : "default"}
        />
      </Box>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Note"
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        description={
          <VStack gap={2}>
            <Text fontSize="sm" color="gray.600" textAlign="center">
              Are you sure you want to delete "{currentNote?.title || "Untitled"}"?
            </Text>
            <Text fontSize="xs" color="red.500" textAlign="center">
              This action cannot be undone.
            </Text>
          </VStack>
        }
      />
    </Box>
  );
}
