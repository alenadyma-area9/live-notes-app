import { Box, HStack, Text, Container, Input, Tooltip } from "@chakra-ui/react";
import { useAppStore } from "../store";
import { LuPenLine } from "react-icons/lu";

interface HeaderProps {
  showNameInput?: boolean;
}

export function Header({ showNameInput = false }: HeaderProps) {
  const { userName, userColor, setUserName } = useAppStore();

  return (
    <Box bg="white" borderBottom="1px solid" borderColor="gray.200" py={3}>
      <Container maxW="900px">
        <HStack justify="space-between">
          {/* Logo and Title */}
          <HStack gap={2}>
            <Box
              bg="blue.500"
              color="white"
              p={2}
              borderRadius="lg"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <LuPenLine size={20} />
            </Box>
            <Box>
              <Text fontWeight="bold" fontSize="lg" lineHeight="1.2">
                Live Notes
              </Text>
              <Text fontSize="xs" color="gray.500" lineHeight="1.2">
                Collaborate in real-time
              </Text>
            </Box>
          </HStack>

          {/* User Avatar and Name */}
          <HStack gap={3}>
            {showNameInput ? (
              <HStack>
                <Text fontSize="sm" color="gray.600">Your name:</Text>
                <Input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter name"
                  size="sm"
                  maxW="150px"
                  bg="white"
                />
              </HStack>
            ) : (
              <Text fontSize="sm" color="gray.600">{userName}</Text>
            )}
            <Tooltip.Root openDelay={200} closeDelay={100}>
              <Tooltip.Trigger asChild>
                <Box
                  w={8}
                  h={8}
                  borderRadius="full"
                  bg={userColor}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  border="2px solid white"
                  boxShadow="sm"
                  cursor="default"
                >
                  <Text fontSize="xs" fontWeight="bold" color="white">
                    {userName.charAt(0).toUpperCase()}
                  </Text>
                </Box>
              </Tooltip.Trigger>
              <Tooltip.Positioner>
                <Tooltip.Content>
                  {userName} (you)
                </Tooltip.Content>
              </Tooltip.Positioner>
            </Tooltip.Root>
          </HStack>
        </HStack>
      </Container>
    </Box>
  );
}
