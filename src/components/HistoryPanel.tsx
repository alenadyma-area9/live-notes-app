import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  VStack,
  HStack,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { LuRotateCcw, LuGitCompare, LuX } from "react-icons/lu";
import * as Y from "yjs";
import { ConfirmDialog, AlertDialog } from "./ConfirmDialog";

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy?: string;
  editorColor?: string;
}

export type ViewMode = "editing" | "preview" | "compare";

interface PreviewState {
  doc: Y.Doc;
  version: Version;
}

interface CompareState {
  oldDoc: Y.Doc;
  newDoc: Y.Doc;
  oldVersion: Version;
  versionId: string;
}

interface HistoryPanelProps {
  noteId: string;
  partykitHost: string;
  isOpen: boolean;
  onRestore: () => void;
  onClose: () => void;
  currentDoc?: Y.Doc;
  viewMode: ViewMode;
  onPreview: (state: PreviewState | null) => void;
  onCompare: (state: CompareState | null) => void;
  selectedVersionId?: string;
}

// Helper to decode base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function HistoryPanel({
  noteId,
  partykitHost,
  isOpen,
  onRestore,
  onClose,
  currentDoc,
  viewMode,
  onPreview,
  onCompare,
  selectedVersionId
}: HistoryPanelProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [loadingVersion, setLoadingVersion] = useState<string | null>(null);

  // Dialog states
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } catch (err) {
      console.error("Failed to fetch versions:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, noteId]);

  const handleRestoreClick = useCallback((versionId: string) => {
    setPendingRestoreId(versionId);
    setRestoreDialogOpen(true);
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!pendingRestoreId) return;

    const versionId = pendingRestoreId;
    setRestoreDialogOpen(false);
    setRestoring(versionId);

    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/restore/${versionId}`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();

        // Apply the restored state to the current document
        if (data.state && currentDoc) {
          const state = base64ToUint8Array(data.state);

          // Create temp doc with the old state
          const tempDoc = new Y.Doc();
          Y.applyUpdate(tempDoc, state);

          // Get old content and title
          const oldContent = tempDoc.getXmlFragment("default");
          const oldMeta = tempDoc.getMap("meta");
          const oldTitle = oldMeta.get("title") as string;

          // Clear current content
          const currentContent = currentDoc.getXmlFragment("default");
          currentDoc.transact(() => {
            // Delete all current content
            while (currentContent.length > 0) {
              currentContent.delete(0, 1);
            }

            // Clone and insert old content elements
            for (let i = 0; i < oldContent.length; i++) {
              const element = oldContent.get(i);
              if (element) {
                currentContent.insert(i, [element.clone()]);
              }
            }

            // Update title
            const currentMeta = currentDoc.getMap("meta");
            if (oldTitle) {
              currentMeta.set("title", oldTitle);
            }
          });

          tempDoc.destroy();
        }

        onPreview(null);
        onCompare(null);
        onRestore();
        fetchVersions();
      } else {
        console.error("Failed to restore version:", res.status);
        setErrorDialogOpen(true);
      }
    } catch (err) {
      console.error("Failed to restore version:", err);
      setErrorDialogOpen(true);
    }
    setRestoring(null);
    setPendingRestoreId(null);
  }, [pendingRestoreId, partykitHost, noteId, currentDoc, onPreview, onCompare, onRestore]);

  // Get the pending restore version info for dialog
  const pendingRestoreVersion = pendingRestoreId ? versions.find(v => v.id === pendingRestoreId) : null;

  const handleVersionClick = async (version: Version) => {
    setLoadingVersion(version.id);
    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/version/${version.id}`);

      if (res.ok) {
        const data = await res.json();
        const doc = new Y.Doc();
        const state = base64ToUint8Array(data.state);
        Y.applyUpdate(doc, state);

        onCompare(null);
        onPreview({ doc, version });
      }
    } catch (err) {
      console.error("Failed to load version:", err);
    }
    setLoadingVersion(null);
  };

  const handleCompare = async (version: Version) => {
    if (!currentDoc) return;

    setLoadingVersion(version.id);
    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/version/${version.id}`);

      if (res.ok) {
        const data = await res.json();

        // Create old doc from version
        const oldDoc = new Y.Doc();
        const state = base64ToUint8Array(data.state);
        Y.applyUpdate(oldDoc, state);

        // Clone current doc for comparison
        const newDoc = new Y.Doc();
        const currentState = Y.encodeStateAsUpdate(currentDoc);
        Y.applyUpdate(newDoc, currentState);

        onPreview(null);
        onCompare({
          oldDoc,
          newDoc,
          oldVersion: version,
          versionId: version.id,
        });
      }
    } catch (err) {
      console.error("Failed to load version:", err);
    }
    setLoadingVersion(null);
  };

  const handleBackToEditing = () => {
    onPreview(null);
    onCompare(null);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!isOpen) return null;

  return (
    <Box
      w="320px"
      bg="white"
      border="none"
      borderLeft="1px solid"
      borderColor="gray.100"
      borderRadius="0 xl xl 0"
      boxShadow="4px 4px 24px rgba(0, 0, 0, 0.08)"
      display="flex"
      flexDirection="column"
      flexShrink={0}
      h="100%"
      overflow="hidden"
    >
      {/* Header - same height as editor top bar */}
      <HStack px={4} h="49px" bg="gray.50" borderBottom="1px solid" borderColor="gray.100" justify="space-between">
        <Text fontWeight="semibold" color="gray.700">History</Text>
        <IconButton
          aria-label="Close history"
          variant="ghost"
          size="sm"
          onClick={onClose}
        >
          <LuX />
        </IconButton>
      </HStack>

      {/* Content */}
      <Box flex={1} overflowY="auto" p={4}>
        {loading ? (
          <VStack py={8}>
            <Spinner />
            <Text color="gray.500">Loading versions...</Text>
          </VStack>
        ) : versions.length === 0 ? (
          <VStack py={8}>
            <Text color="gray.500">No versions saved yet</Text>
            <Text fontSize="sm" color="gray.400" textAlign="center">
              Versions are saved after 60s of inactivity when significant changes are made
            </Text>
          </VStack>
        ) : (
          <VStack gap={2} align="stretch">
            {/* Restore button - shown when a version is selected */}
            {selectedVersionId && (
              <Button
                bg="#6366F1"
                color="white"
                _hover={{ bg: "#4F46E5" }}
                size="sm"
                w="full"
                onClick={() => handleRestoreClick(selectedVersionId)}
                loading={restoring === selectedVersionId}
              >
                <LuRotateCcw />
                Restore selected version
              </Button>
            )}

            {/* Current version - clickable to return to editing */}
            <Box
              p={3}
              borderRadius="lg"
              border="none"
              bg={viewMode === "editing" ? "green.50" : "gray.50"}
              _hover={{ bg: viewMode === "editing" ? "green.100" : "gray.100" }}
              cursor="pointer"
              onClick={handleBackToEditing}
              transition="background 0.15s ease"
            >
              <HStack justify="space-between">
                <HStack gap={2}>
                  <Box w={2} h={2} borderRadius="full" bg={viewMode === "editing" ? "green.500" : "gray.400"} />
                  <VStack align="start" gap={0}>
                    <Text fontWeight="medium" fontSize="sm" color={viewMode === "editing" ? "green.700" : "gray.600"}>
                      Current version
                    </Text>
                    {viewMode === "editing" && (
                      <Text fontSize="xs" color="green.600">Live editing</Text>
                    )}
                  </VStack>
                </HStack>
              </HStack>
            </Box>

            {/* Past versions */}
            {versions.map((version) => {
              const isSelected = selectedVersionId === version.id;
              const isLoading = loadingVersion === version.id;

              return (
                <Box
                  key={version.id}
                  p={3}
                  borderRadius="lg"
                  border="none"
                  bg={isSelected ? "#EEF2FF" : "gray.50"}
                  _hover={{
                    bg: isSelected ? "#E0E7FF" : "gray.100",
                    "& .compare-btn": { opacity: 1 }
                  }}
                  cursor="pointer"
                  onClick={() => !isLoading && handleVersionClick(version)}
                  opacity={isLoading ? 0.7 : 1}
                  transition="background 0.15s ease"
                >
                  <VStack align="stretch" gap={2}>
                    <Box>
                      <HStack gap={2}>
                        {isSelected && (
                          <Box w={2} h={2} borderRadius="full" bg="#6366F1" flexShrink={0} />
                        )}
                        <Text fontWeight="medium" fontSize="sm" lineClamp={1}>
                          {version.title || "Untitled"}
                        </Text>
                      </HStack>
                      <HStack gap={2} mt={1} flexWrap="wrap" ml={isSelected ? 4 : 0}>
                        {version.editedBy && (
                          <HStack gap={1}>
                            <Box
                              w={2}
                              h={2}
                              borderRadius="full"
                              bg={version.editorColor || "gray.400"}
                            />
                            <Text fontSize="xs" color="gray.500">
                              {version.editedBy}
                            </Text>
                          </HStack>
                        )}
                        <Text fontSize="xs" color="gray.400">
                          {formatTime(version.timestamp)}
                        </Text>
                      </HStack>
                    </Box>

                    {/* Compare button - muted, visible on hover */}
                    <Box
                      className="compare-btn"
                      opacity={isSelected ? 1 : 0.4}
                      transition="opacity 0.15s ease"
                    >
                      <Button
                        size="xs"
                        variant="ghost"
                        color={isSelected ? "#4F46E5" : "gray.500"}
                        _hover={{ bg: isSelected ? "#E0E7FF" : "gray.200" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompare(version);
                        }}
                        loading={isLoading}
                      >
                        <LuGitCompare />
                        Compare
                      </Button>
                    </Box>
                  </VStack>
                </Box>
              );
            })}
          </VStack>
        )}
      </Box>

      {/* Footer */}
      <Box p={4} borderTop="1px solid" borderColor="gray.100">
        <Button variant="ghost" size="sm" w="full" onClick={fetchVersions} color="gray.600">
          Refresh
        </Button>
      </Box>

      {/* Restore Confirmation Dialog */}
      <ConfirmDialog
        isOpen={restoreDialogOpen}
        onClose={() => {
          setRestoreDialogOpen(false);
          setPendingRestoreId(null);
        }}
        onConfirm={handleRestoreConfirm}
        title="Restore Version"
        variant="restore"
        confirmText="Restore"
        cancelText="Cancel"
        description={
          pendingRestoreVersion ? (
            <VStack gap={2}>
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Restore to version from{" "}
                <Text as="span" fontWeight="medium">
                  {new Date(pendingRestoreVersion.timestamp).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </Text>
                ?
              </Text>
              <Text fontSize="xs" color="gray.500" textAlign="center">
                Current content will be saved as a new version
              </Text>
            </VStack>
          ) : "Restore this version?"
        }
      />

      {/* Error Alert Dialog */}
      <AlertDialog
        isOpen={errorDialogOpen}
        onClose={() => setErrorDialogOpen(false)}
        title="Restore Failed"
        description="Failed to restore version. Please try again."
        variant="error"
        buttonText="OK"
      />
    </Box>
  );
}
