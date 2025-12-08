import { useEffect, useState } from "react";
import { HStack, Box, Text, Tooltip } from "@chakra-ui/react";
import type YPartyKitProvider from "y-partykit/provider";

interface Collaborator {
  name: string;
  color: string;
}

interface CollaboratorsListProps {
  provider: YPartyKitProvider;
  currentUser: { name: string; color: string };
}

export function CollaboratorsList({ provider, currentUser }: CollaboratorsListProps) {
  const [collaborators, setCollaborators] = useState<Map<number, Collaborator>>(new Map());

  useEffect(() => {
    const awareness = provider.awareness;

    const updateCollaborators = () => {
      const states = awareness.getStates() as Map<number, { user?: Collaborator }>;
      const users = new Map<number, Collaborator>();

      states.forEach((state, clientId) => {
        if (state.user && clientId !== awareness.clientID) {
          users.set(clientId, state.user);
        }
      });

      setCollaborators(users);
    };

    awareness.on("change", updateCollaborators);
    updateCollaborators();

    return () => {
      awareness.off("change", updateCollaborators);
    };
  }, [provider]);

  const allUsers = [
    { id: "me", ...currentUser, isMe: true },
    ...Array.from(collaborators.entries()).map(([id, user]) => ({
      id: String(id),
      ...user,
      isMe: false,
    })),
  ];

  return (
    <HStack gap={1}>
      {allUsers.map((user) => (
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
              boxShadow="sm"
              cursor="default"
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
      {allUsers.length > 1 && (
        <Text ml={1} fontSize="sm" color="gray.600">
          {allUsers.length} online
        </Text>
      )}
    </HStack>
  );
}
