import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  IconButton,
  VStack,
  HStack,
  Text,
  Spinner,
  Tooltip,
  useBreakpointValue,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { LuRotateCcw, LuGitCompare, LuX, LuInfo, LuRefreshCw } from "react-icons/lu";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;
import * as Y from "yjs";
import { ConfirmDialog, AlertDialog } from "./ConfirmDialog";

interface Version {
  id: string;
  timestamp: number;
  title: string;
  editedBy?: string;
  editorColor?: string;
  isCreation?: boolean;
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

interface RestoreData {
  state: Uint8Array;
  title: string;
}

interface HistoryPanelProps {
  noteId: string;
  partykitHost: string;
  isOpen: boolean;
  onRestore: (data: RestoreData) => void;
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

        if (data.state) {
          const state = base64ToUint8Array(data.state);

          // Extract title from the version state
          const tempDoc = new Y.Doc();
          Y.applyUpdate(tempDoc, state);
          const oldMeta = tempDoc.getMap("meta");
          const oldTitle = (oldMeta.get("title") as string) || "";
          tempDoc.destroy();

          // Pass the state to Editor.tsx to handle the actual restore
          // This allows using TipTap's setContent which works better than manual Y.js manipulation
          onPreview(null);
          onCompare(null);
          onRestore({ state, title: oldTitle });
          fetchVersions();
        } else {
          console.error("No state in restore response");
          setErrorDialogOpen(true);
        }
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
  }, [pendingRestoreId, partykitHost, noteId, onPreview, onCompare, onRestore]);

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

  const isMobile = useBreakpointValue({ base: true, md: false });

  if (!isOpen) return null;

  return (
    <Box
      w={{ base: "200px", md: "320px" }}
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
      {/* Header */}
      <HStack px={{ base: 2, md: 4 }} h="49px" bg="gray.50" borderBottom="1px solid" borderColor="gray.100" justify="space-between">
        <HStack gap={1}>
          <Text fontWeight="semibold" color="gray.700" fontSize={{ base: "sm", md: "md" }}>History</Text>
          <Tooltip.Root openDelay={200} closeDelay={100} closeOnClick={false} interactive>
            <Tooltip.Trigger asChild>
              <IconButton
                aria-label="Version info"
                variant="ghost"
                size="xs"
                color="gray.400"
                _hover={{ color: "gray.600" }}
                minW="auto"
                h="auto"
                p={0.5}
              >
                <LuInfo size={14} />
              </IconButton>
            </Tooltip.Trigger>
            <Tooltip.Positioner>
              <Tooltip.Content>
                <Box p={2} maxW="260px">
                  <Text fontWeight="semibold" fontSize="xs" mb={1.5}>When versions are saved:</Text>
                  <VStack align="start" gap={1} fontSize="xs">
                    <Text>• <Text as="span" fontWeight="medium">Auto:</Text> 5 min idle + significant changes</Text>
                    <Text>• <Text as="span" fontWeight="medium">Page close:</Text> Always saves</Text>
                    <Text>• <Text as="span" fontWeight="medium">Manual:</Text> "Save version" in menu</Text>
                  </VStack>
                  <Text mt={2} fontSize="2xs" color="gray.400">
                    Text syncs in real-time. Versions are restore points.
                  </Text>
                </Box>
              </Tooltip.Content>
            </Tooltip.Positioner>
          </Tooltip.Root>
        </HStack>
        <HStack gap={0}>
          <IconButton
            aria-label="Refresh versions"
            variant="ghost"
            size="xs"
            onClick={fetchVersions}
            disabled={loading}
            color="gray.500"
            _hover={{ color: "gray.700" }}
            css={loading ? { animation: `${spin} 1s linear infinite` } : undefined}
          >
            <LuRefreshCw size={14} />
          </IconButton>
          <IconButton
            aria-label="Close history"
            variant="ghost"
            size="xs"
            onClick={onClose}
          >
            <LuX />
          </IconButton>
        </HStack>
      </HStack>

      {/* Content */}
      <Box flex={1} overflowY="auto" p={{ base: 2, md: 4 }}>
        {loading ? (
          <VStack py={8}>
            <Spinner size="sm" />
            <Text color="gray.500" fontSize={{ base: "xs", md: "sm" }}>Loading...</Text>
          </VStack>
        ) : versions.length === 0 ? (
          <VStack py={6}>
            <Text color="gray.500" fontSize={{ base: "xs", md: "sm" }}>No versions yet</Text>
          </VStack>
        ) : (
          <VStack gap={{ base: 1, md: 2 }} align="stretch">
            {/* Restore button - shown when a version is selected */}
            {selectedVersionId && (
              <Button
                bg="#6366F1"
                color="white"
                _hover={{ bg: "#4F46E5" }}
                size="xs"
                w="full"
                onClick={() => handleRestoreClick(selectedVersionId)}
                loading={restoring === selectedVersionId}
                fontSize={{ base: "2xs", md: "xs" }}
              >
                <LuRotateCcw size={isMobile ? 12 : 14} />
                Restore
              </Button>
            )}

            {/* Current version - clickable to return to editing */}
            <Box
              p={{ base: 2, md: 3 }}
              borderRadius="lg"
              border="none"
              bg={viewMode === "editing" ? "green.50" : "gray.50"}
              _hover={{ bg: viewMode === "editing" ? "green.100" : "gray.100" }}
              cursor="pointer"
              onClick={handleBackToEditing}
              transition="background 0.15s ease"
            >
              <HStack gap={2}>
                <Box w={2} h={2} borderRadius="full" bg={viewMode === "editing" ? "green.500" : "gray.400"} flexShrink={0} />
                <Text fontWeight="medium" fontSize={{ base: "xs", md: "sm" }} color={viewMode === "editing" ? "green.700" : "gray.600"}>
                  Current
                </Text>
              </HStack>
            </Box>

            {/* Past versions */}
            {versions.map((version) => {
              const isSelected = selectedVersionId === version.id;
              const isLoading = loadingVersion === version.id;
              const isCreation = version.isCreation;

              return (
                <Box
                  key={version.id}
                  p={{ base: 2, md: 3 }}
                  borderRadius="lg"
                  border="none"
                  bg={isSelected ? "#EEF2FF" : isCreation ? "purple.50" : "gray.50"}
                  opacity={isLoading ? 0.7 : 1}
                  transition="background 0.15s ease"
                >
                  <VStack align="stretch" gap={1}>
                    <HStack gap={2}>
                      {isSelected && (
                        <Box w={2} h={2} borderRadius="full" bg="#6366F1" flexShrink={0} />
                      )}
                      <Text fontWeight="medium" fontSize={{ base: "xs", md: "sm" }} lineClamp={1} color={isCreation ? "purple.700" : undefined}>
                        {isCreation ? (version.id.includes("duplicated") ? "Duplicated" : "Created") : (version.title || "Untitled")}
                      </Text>
                    </HStack>
                    <HStack gap={1} flexWrap="wrap" ml={isSelected ? 4 : 0}>
                      {version.editedBy && (
                        <HStack gap={1}>
                          <Box w={1.5} h={1.5} borderRadius="full" bg={version.editorColor || "gray.400"} />
                          <Text fontSize="2xs" color={isCreation ? "purple.600" : "gray.500"} lineClamp={1}>
                            {version.editedBy}
                          </Text>
                        </HStack>
                      )}
                      <Text fontSize="2xs" color="gray.400">
                        {formatTime(version.timestamp)}
                      </Text>
                    </HStack>

                    {/* Action buttons - View and Compare */}
                    <HStack gap={1} mt={1}>
                      <Button
                        size="xs"
                        variant={isSelected ? "solid" : "ghost"}
                        bg={isSelected ? "#6366F1" : undefined}
                        color={isSelected ? "white" : "gray.600"}
                        _hover={{ bg: isSelected ? "#4F46E5" : "gray.100" }}
                        onClick={() => !isLoading && handleVersionClick(version)}
                        loading={isLoading && !isSelected}
                        flex={1}
                        fontSize={{ base: "2xs", md: "xs" }}
                      >
                        View
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        color="gray.600"
                        _hover={{ bg: "gray.100" }}
                        onClick={() => handleCompare(version)}
                        loading={isLoading && isSelected}
                        flex={1}
                        fontSize={{ base: "2xs", md: "xs" }}
                      >
                        <LuGitCompare size={12} />
                        Diff
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
      <Box p={{ base: 2, md: 4 }} borderTop="1px solid" borderColor="gray.100">
        <Button variant="ghost" size="xs" w="full" onClick={fetchVersions} color="gray.600" fontSize={{ base: "xs", md: "sm" }}>
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
