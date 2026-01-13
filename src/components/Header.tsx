import { Box, HStack, Text, Input, Popover, Portal, VStack, Button } from "@chakra-ui/react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "../store";
import { LuPenLine } from "react-icons/lu";
import { useState } from "react";

interface HeaderProps {
  showNameInput?: boolean;
}

export function Header({ showNameInput = false }: HeaderProps) {
  const { userName, userColor, setUserName } = useAppStore();
  const [nameInput, setNameInput] = useState(userName);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSaveName = () => {
    if (nameInput.trim()) {
      setUserName(nameInput.trim());
    }
    setPopoverOpen(false);
  };

  return (
    <HStack
      px={4}
      h="56px"
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.100"
      justify="space-between"
      gap={4}
      flexShrink={0}
      position="sticky"
      top={0}
      zIndex={100}
    >
      {/* Left: Logo - clickable to navigate home or refresh if already home */}
      <HStack
        gap={3}
        cursor="pointer"
        onClick={() => {
          if (location.pathname === '/') {
            window.location.reload();
          } else {
            navigate('/');
          }
        }}
        _hover={{ opacity: 0.8 }}
        transition="opacity 0.2s"
      >
        <Box
          bg="#6366F1"
          color="white"
          p={2}
          borderRadius="lg"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <LuPenLine size={18} />
        </Box>
        <Box>
          <Text fontWeight="bold" fontSize="md" lineHeight="1.2">
            Live Notes
          </Text>
          <Text fontSize="xs" color="gray.500" lineHeight="1.2" display={{ base: "none", sm: "block" }}>
            Collaborate in real-time
          </Text>
        </Box>
      </HStack>

      {/* Right: Avatar with popover for name */}
      <Popover.Root open={popoverOpen} onOpenChange={(e) => setPopoverOpen(e.open)}>
        <Popover.Trigger asChild>
          <HStack gap={2} cursor="pointer" _hover={{ opacity: 0.9 }}>
            {!showNameInput && (
              <Text fontSize="sm" color="gray.600" display={{ base: "none", sm: "block" }}>
                {userName}
              </Text>
            )}
            <Box
              w={9}
              h={9}
              borderRadius="full"
              bg={userColor}
              display="flex"
              alignItems="center"
              justifyContent="center"
              border="2px solid white"
              boxShadow="0 0 0 2px #6366F1"
            >
              <Text fontSize="sm" fontWeight="bold" color="white">
                {userName.charAt(0).toUpperCase()}
              </Text>
            </Box>
          </HStack>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content p={4} w="250px" borderRadius="xl" boxShadow="lg">
              <VStack gap={3} align="stretch">
                <Text fontSize="sm" fontWeight="medium" color="gray.700">
                  Your display name
                </Text>
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter your name"
                  size="sm"
                  borderRadius="lg"
                  maxLength={20}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                />
                <HStack justify="flex-end" gap={2}>
                  <Button size="sm" variant="ghost" onClick={() => setPopoverOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" bg="#6366F1" color="white" _hover={{ bg: "#4F46E5" }} onClick={handleSaveName}>
                    Save
                  </Button>
                </HStack>
              </VStack>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
    </HStack>
  );
}
