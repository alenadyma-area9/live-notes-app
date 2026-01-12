import { useEffect, useState, useRef } from "react";
import { HStack, Box, Text, Tooltip, Popover, Portal, VStack } from "@chakra-ui/react";
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
  showCurrentUser?: boolean;
}

export function CollaboratorsList({ provider, currentUser, maxDisplay = 4, showCurrentUser = true }: CollaboratorsListProps) {
  const { userId } = useAppStore();
  const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(new Map());
  const [mobilePopoverOpen, setMobilePopoverOpen] = useState(false);
  const isTouchDevice = useRef(typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0));

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

  const otherUsers = Array.from(collaborators.entries()).map(([id, user]) => ({
    id,
    ...user,
    isMe: false,
  }));

  const allUsers = showCurrentUser
    ? [{ id: "me", ...currentUser, isMe: true }, ...otherUsers]
    : otherUsers;

  // If not showing current user and no other users, return null
  if (!showCurrentUser && otherUsers.length === 0) {
    return null;
  }

  const visibleUsers = allUsers.slice(0, maxDisplay);
  const hiddenCount = allUsers.length - maxDisplay;
  const hiddenUsers = allUsers.slice(maxDisplay);

  // Avatar size: smaller when not showing current user (others only)
  const avatarSize = showCurrentUser ? 8 : 7;

  // On mobile, wrap entire avatar list in a popover for tap-to-show-names
  if (isTouchDevice.current) {
    return (
      <Popover.Root open={mobilePopoverOpen} onOpenChange={(e) => setMobilePopoverOpen(e.open)}>
        <Popover.Trigger asChild>
          <HStack gap={0} cursor="pointer" onClick={() => setMobilePopoverOpen(true)}>
            {visibleUsers.map((user, index) => (
              <Box
                key={user.id}
                w={avatarSize}
                h={avatarSize}
                borderRadius="full"
                bg={user.color}
                display="flex"
                alignItems="center"
                justifyContent="center"
                border="2px solid white"
                boxShadow={user.isMe ? "0 0 0 2px " + user.color : "sm"}
                position="relative"
                zIndex={visibleUsers.length - index}
                ml={index > 0 ? -2 : 0}
              >
                <Text fontSize="xs" fontWeight="bold" color="white">
                  {user.name.charAt(0).toUpperCase()}
                </Text>
              </Box>
            ))}

            {hiddenCount > 0 && (
              <Box
                w={avatarSize}
                h={avatarSize}
                borderRadius="full"
                bg="gray.400"
                display="flex"
                alignItems="center"
                justifyContent="center"
                border="2px solid white"
                boxShadow="sm"
                ml={-2}
                zIndex={0}
              >
                <Text fontSize="xs" fontWeight="bold" color="white">
                  +{hiddenCount}
                </Text>
              </Box>
            )}
          </HStack>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content maxW="200px" p={3}>
              <VStack align="start" gap={2}>
                <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">
                  Collaborators
                </Text>
                {allUsers.map((user) => (
                  <HStack key={user.id} gap={2}>
                    <Box
                      w={5}
                      h={5}
                      borderRadius="full"
                      bg={user.color}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <Text fontSize="2xs" fontWeight="bold" color="white">
                        {user.name.charAt(0).toUpperCase()}
                      </Text>
                    </Box>
                    <Text fontSize="sm" color="gray.700">
                      {user.name}{user.isMe ? " (you)" : ""}
                    </Text>
                  </HStack>
                ))}
              </VStack>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    );
  }

  // Desktop: use tooltips on hover
  return (
    <HStack gap={0}>
      {visibleUsers.map((user, index) => (
        <Tooltip.Root key={user.id} openDelay={200} closeDelay={100}>
          <Tooltip.Trigger asChild>
            <Box
              w={avatarSize}
              h={avatarSize}
              borderRadius="full"
              bg={user.color}
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid white"
              boxShadow={user.isMe ? "0 0 0 2px " + user.color : "sm"}
              cursor="default"
              position="relative"
              zIndex={visibleUsers.length - index}
              ml={index > 0 ? -2 : 0}
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
              w={avatarSize}
              h={avatarSize}
              borderRadius="full"
              bg="gray.400"
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid white"
              boxShadow="sm"
              cursor="default"
              ml={-2}
              zIndex={0}
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
