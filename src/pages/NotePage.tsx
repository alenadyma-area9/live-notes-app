import { useCallback, useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Text,
} from "@chakra-ui/react";
import { CollaborativeEditor } from "../components/Editor";
import { Header } from "../components/Header";
import { useAppStore } from "../store";

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || "localhost:1999";

export function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { addRecentNote, removeRecentNote, isNoteOwner } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState(false);

  const isOwner = noteId ? isNoteOwner(noteId) : false;

  // Check for duplicate action in URL
  useEffect(() => {
    if (searchParams.get("action") === "duplicate") {
      setPendingDuplicate(true);
      // Clear the action from URL
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
    <Box h="100vh" bg="gray.50" overflow="hidden" display="flex" flexDirection="column">
      <Header />

      <Box flex={1} maxW="1200px" w="100%" mx="auto" px={4} py={4} overflow="hidden">
        <CollaborativeEditor
          noteId={noteId}
          partykitHost={PARTYKIT_HOST}
          onTitleChange={handleTitleChange}
          onBack={handleBack}
          onShare={handleCopyLink}
          onDelete={isOwner ? handleDelete : undefined}
          onDuplicate={handleDuplicate}
          autoDuplicate={pendingDuplicate}
          shareButtonState={copied ? "copied" : "default"}
        />
      </Box>
    </Box>
  );
}
