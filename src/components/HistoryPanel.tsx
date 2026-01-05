import { useEffect, useState } from "react";
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

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy?: string;
  editorColor?: string;
  windowStart?: number;
  windowEnd?: number;
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
        onPreview(null);
        onCompare(null);
        onRestore();
        fetchVersions();
      }
    } catch (err) {
      console.error("Failed to restore version:", err);
    }
    setRestoring(null);
  };

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
      border="1px solid"
      borderLeft="none"
      borderColor="gray.200"
      borderRadius="0 md md 0"
      display="flex"
      flexDirection="column"
      flexShrink={0}
      h="100%"
      overflow="hidden"
    >
      {/* Header - same height as editor top bar */}
      <HStack px={4} h="49px" bg="gray.50" borderBottom="1px solid" borderColor="gray.200" justify="space-between">
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
                colorPalette="blue"
                size="sm"
                w="full"
                onClick={() => handleRestore(selectedVersionId)}
                loading={restoring === selectedVersionId}
              >
                <LuRotateCcw />
                Restore selected version
              </Button>
            )}

            {/* Current version - clickable to return to editing */}
            <Box
              p={3}
              borderRadius="md"
              border={viewMode === "editing" ? "2px solid" : "1px solid"}
              borderColor={viewMode === "editing" ? "green.400" : "gray.200"}
              bg={viewMode === "editing" ? "green.50" : "white"}
              _hover={{ bg: viewMode === "editing" ? "green.50" : "gray.50" }}
              cursor="pointer"
              onClick={handleBackToEditing}
            >
              <HStack justify="space-between">
                <VStack align="start" gap={0}>
                  <Text fontWeight="medium" fontSize="sm" color={viewMode === "editing" ? "green.700" : "gray.600"}>
                    Current version
                  </Text>
                  {viewMode === "editing" && (
                    <Text fontSize="xs" color="green.600">Live editing</Text>
                  )}
                </VStack>
                {viewMode === "editing" && (
                  <Box w={2} h={2} borderRadius="full" bg="green.500" />
                )}
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
                  borderRadius="md"
                  border={isSelected ? "2px solid" : "1px solid"}
                  borderColor={isSelected ? "blue.400" : "gray.200"}
                  bg={isSelected ? "blue.50" : "white"}
                  _hover={{ bg: isSelected ? "blue.50" : "gray.50" }}
                  cursor="pointer"
                  onClick={() => !isLoading && handleVersionClick(version)}
                  opacity={isLoading ? 0.7 : 1}
                >
                  <VStack align="stretch" gap={2}>
                    <Box>
                      <Text fontWeight="medium" fontSize="sm" lineClamp={1}>
                        {version.title || "Untitled"}
                      </Text>
                      <HStack gap={2} mt={1} flexWrap="wrap">
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

                    {/* Compare button */}
                    <HStack gap={2}>
                      <Button
                        size="xs"
                        variant={isSelected ? "outline" : "ghost"}
                        colorPalette={isSelected ? "blue" : "gray"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompare(version);
                        }}
                        loading={isLoading}
                      >
                        <LuGitCompare />
                        Compare
                      </Button>
                    </HStack>
                  </VStack>
                </Box>
              );
            })}
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
