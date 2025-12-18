import { useEffect, useState } from "react";
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  Spinner,
  IconButton,
} from "@chakra-ui/react";
import { LuX, LuRotateCcw, LuHistory, LuEye } from "react-icons/lu";
import * as Y from "yjs";

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy?: string;
  editorColor?: string;
}

interface DiffState {
  oldDoc: Y.Doc;
  newDoc: Y.Doc;
  oldVersion: { editedBy: string; editorColor: string; timestamp: number };
  newVersion: { editedBy: string; editorColor: string; timestamp: number };
  versionId: string;
}

interface HistoryPanelProps {
  noteId: string;
  partykitHost: string;
  isOpen: boolean;
  onClose: () => void;
  onRestore: () => void;
  currentDoc?: Y.Doc;
  onShowDiff?: (diff: DiffState) => void;
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

export function HistoryPanel({ noteId, partykitHost, isOpen, onClose, onRestore, currentDoc, onShowDiff, selectedVersionId }: HistoryPanelProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [loadingCompare, setLoadingCompare] = useState<string | null>(null);

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

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    try {
      const protocol = partykitHost.includes("localhost") ? "http" : "https";
      const res = await fetch(`${protocol}://${partykitHost}/parties/notes/${noteId}/restore/${versionId}`, {
        method: "POST",
      });
      if (res.ok) {
        onRestore();
        onClose();
      }
    } catch (err) {
      console.error("Failed to restore version:", err);
    }
    setRestoring(null);
  };

  const handleCompare = async (version: Version) => {
    if (!onShowDiff || !currentDoc) return;

    setLoadingCompare(version.id);

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

        onShowDiff({
          oldDoc,
          newDoc,
          oldVersion: {
            editedBy: version.editedBy || "Unknown",
            editorColor: version.editorColor || "#888",
            timestamp: version.timestamp,
          },
          newVersion: {
            editedBy: versions[0]?.editedBy || "Unknown",
            editorColor: versions[0]?.editorColor || "#888",
            timestamp: versions[0]?.timestamp || Date.now(),
          },
          versionId: version.id,
        });
      }
    } catch (err) {
      console.error("Failed to load version:", err);
    }
    setLoadingCompare(null);
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
      position="fixed"
      right={4}
      top="60px"
      bottom={4}
      w="320px"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      boxShadow="lg"
      zIndex={100}
      display="flex"
      flexDirection="column"
    >
      {/* Header */}
      <HStack justify="space-between" p={4} borderBottom="1px solid" borderColor="gray.200">
        <HStack>
          <LuHistory />
          <Text fontWeight="bold">Version History</Text>
        </HStack>
        <IconButton
          aria-label="Close"
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
            <Text fontSize="sm" color="gray.400">
              Versions are saved automatically every 5 seconds
            </Text>
          </VStack>
        ) : (
          <VStack gap={2} align="stretch">
            {versions.map((version, index) => {
              const isSelected = selectedVersionId === version.id;
              return (
              <Box
                key={version.id}
                p={3}
                borderRadius="md"
                border="2px solid"
                borderColor={isSelected ? "blue.400" : "gray.200"}
                bg={isSelected ? "blue.50" : "white"}
                _hover={{ bg: isSelected ? "blue.50" : "gray.50" }}
              >
                <VStack align="stretch" gap={2}>
                  <Box>
                    <Text fontWeight="medium" fontSize="sm" lineClamp={1}>
                      {version.title || "Untitled"}
                    </Text>
                    <HStack gap={2} mt={1}>
                      {version.editedBy && (
                        <HStack gap={1}>
                          <Box
                            w={3}
                            h={3}
                            borderRadius="full"
                            bg={version.editorColor || "gray.400"}
                          />
                          <Text fontSize="xs" color="gray.600">
                            {version.editedBy}
                          </Text>
                        </HStack>
                      )}
                      <Text fontSize="xs" color="gray.500">
                        {formatTime(version.timestamp)}
                      </Text>
                    </HStack>
                    {index === 0 && (
                      <Text fontSize="xs" color="green.500" fontWeight="medium" mt={1}>
                        Current
                      </Text>
                    )}
                  </Box>

                  {index > 0 && (
                    <HStack gap={2}>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleCompare(version)}
                        loading={loadingCompare === version.id}
                      >
                        <LuEye />
                        Compare
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="blue"
                        onClick={() => handleRestore(version.id)}
                        disabled={restoring !== null}
                        loading={restoring === version.id}
                      >
                        <LuRotateCcw />
                        Restore
                      </Button>
                    </HStack>
                  )}
                </VStack>
              </Box>
            )})}
          </VStack>
        )}
      </Box>

      {/* Footer */}
      <Box p={4} borderTop="1px solid" borderColor="gray.200">
        <Button variant="outline" size="sm" w="full" onClick={fetchVersions}>
          Refresh
        </Button>
      </Box>
    </Box>
  );
}
