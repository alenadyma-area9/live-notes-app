import { useCallback, useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Text,
  VStack,
} from "@chakra-ui/react";
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

  const isOwner = noteId ? isNoteOwner(noteId) : false;
  const currentNote = noteId ? recentNotes.find(n => n.id === noteId) : null;

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
    setPendingDuplicate(false);
    addRecentNote(newNoteId, newTitle);
    navigate(`/note/${newNoteId}`);
  };

  if (!noteId) {
    return <Text>Invalid note ID</Text>;
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
