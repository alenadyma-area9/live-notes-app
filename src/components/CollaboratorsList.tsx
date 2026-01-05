import { useEffect, useState } from "react";
import { HStack, Box, Text, Tooltip } from "@chakra-ui/react";
import type YPartyKitProvider from "y-partykit/provider";
import { useAppStore } from "../store";

interface Collaborator {
  name: string;
  color: string;
  visibleUserId?: string;
}

interface CollaboratorsListProps {
  provider: YPartyKitProvider;
  currentUser: { name: string; color: string };
  maxDisplay?: number;
}

export function CollaboratorsList({ provider, currentUser, maxDisplay = 4 }: CollaboratorsListProps) {
  const { userId } = useAppStore();
  const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map());

  useEffect(() => {
    const awareness = provider.awareness;

    const updateCollaborators = () => {
      const states = awareness.getStates() as Map<number, { user?: Collaborator }>;
      // Deduplicate by visibleUserId (or name+color as fallback)
      const uniqueUsers = new Map<string, Collaborator>();

      states.forEach((state, clientId) => {
        if (state.user && clientId !== awareness.clientID) {
          // Use visibleUserId if available, otherwise use name+color combo as key
          const userKey = state.user.visibleUserId || `${state.user.name}-${state.user.color}`;

          // Skip if this is the current user (same visibleUserId)
          if (state.user.visibleUserId === userId) return;

          // Only add if not already present (first connection wins)
          if (!uniqueUsers.has(userKey)) {
            uniqueUsers.set(userKey, state.user);
          }
        }
      });

      setCollaborators(uniqueUsers);
    };

    awareness.on("change", updateCollaborators);
    updateCollaborators();

    return () => {
      awareness.off("change", updateCollaborators);
    };
  }, [provider, userId]);

  const allUsers = [
    { id: "me", ...currentUser, isMe: true },
    ...Array.from(collaborators.entries()).map(([id, user]) => ({
      id,
      ...user,
      isMe: false,
    })),
  ];

  const visibleUsers = allUsers.slice(0, maxDisplay);
  const hiddenCount = allUsers.length - maxDisplay;
  const hiddenUsers = allUsers.slice(maxDisplay);

  return (
    <HStack gap={-2}>
      {visibleUsers.map((user) => (
        <Tooltip.Root key={user.id} openDelay={200} closeDelay={100}>
          <Tooltip.Trigger asChild>
            <Box
              w={8}
              h={8}
              borderRadius="full"
              bg={user.color}
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid white"
              boxShadow={user.isMe ? "0 0 0 3px " + user.color : "sm"}
              cursor="default"
              position="relative"
              zIndex={user.isMe ? 10 : 1}
              _hover={{ zIndex: 20 }}
            >
              <Text fontSize="xs" fontWeight="bold" color="white">
                {user.name.charAt(0).toUpperCase()}
              </Text>
            </Box>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>
              {user.isMe ? `${user.name} (you)` : user.name}
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
      ))}

      {hiddenCount > 0 && (
        <Tooltip.Root openDelay={200} closeDelay={100}>
          <Tooltip.Trigger asChild>
            <Box
              w={8}
              h={8}
              borderRadius="full"
              bg="gray.400"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid white"
              boxShadow="sm"
              cursor="default"
              ml={1}
            >
              <Text fontSize="xs" fontWeight="bold" color="white">
                +{hiddenCount}
              </Text>
            </Box>
          </Tooltip.Trigger>
          <Tooltip.Positioner>
            <Tooltip.Content>
              {hiddenUsers.map(u => u.name).join(", ")}
            </Tooltip.Content>
          </Tooltip.Positioner>
        </Tooltip.Root>
      )}
    </HStack>
  );
}
