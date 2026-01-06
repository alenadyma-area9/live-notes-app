import {
  Dialog,
  Portal,
  Button,
  VStack,
  HStack,
  Text,
  Box,
} from "@chakra-ui/react";
import { LuTriangleAlert, LuInfo, LuTrash2, LuCopy, LuRotateCcw } from "react-icons/lu";
import type { ReactNode } from "react";

export type DialogVariant = "danger" | "warning" | "info" | "duplicate" | "restore";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  isLoading?: boolean;
}

const variantConfig = {
  danger: {
    icon: LuTrash2,
    iconBg: "red.100",
    iconColor: "red.600",
    confirmColor: "red" as const,
  },
  warning: {
    icon: LuTriangleAlert,
    iconBg: "orange.100",
    iconColor: "orange.600",
    confirmColor: "orange" as const,
  },
  info: {
    icon: LuInfo,
    iconBg: "blue.100",
    iconColor: "blue.600",
    confirmColor: "blue" as const,
  },
  duplicate: {
    icon: LuCopy,
    iconBg: "purple.100",
    iconColor: "purple.600",
    confirmColor: "purple" as const,
  },
  restore: {
    icon: LuRotateCcw,
    iconBg: "blue.100",
    iconColor: "blue.600",
    confirmColor: "blue" as const,
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info",
  isLoading = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = () => {
    onConfirm();
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      motionPreset="scale"
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            bg="white"
            borderRadius="xl"
            boxShadow="2xl"
            maxW="400px"
            w="90vw"
            p={0}
            overflow="hidden"
          >
            <VStack gap={0} align="stretch">
              {/* Header with icon */}
              <VStack pt={6} pb={4} px={6} gap={3}>
                <Box
                  w={12}
                  h={12}
                  borderRadius="full"
                  bg={config.iconBg}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Icon size={24} color={`var(--chakra-colors-${config.iconColor.replace(".", "-")})`} />
                </Box>
                <Dialog.Title
                  fontSize="lg"
                  fontWeight="semibold"
                  textAlign="center"
                  color="gray.800"
                >
                  {title}
                </Dialog.Title>
              </VStack>

              {/* Description */}
              {description && (
                <Box px={6} pb={4}>
                  {typeof description === "string" ? (
                    <Text
                      fontSize="sm"
                      color="gray.600"
                      textAlign="center"
                      lineHeight="tall"
                    >
                      {description}
                    </Text>
                  ) : (
                    description
                  )}
                </Box>
              )}

              {/* Actions */}
              <HStack
                px={6}
                py={4}
                gap={3}
                bg="gray.50"
                borderTop="1px solid"
                borderColor="gray.100"
              >
                <Button
                  flex={1}
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  size="md"
                  borderRadius="lg"
                >
                  {cancelText}
                </Button>
                <Button
                  flex={1}
                  colorPalette={config.confirmColor}
                  onClick={handleConfirm}
                  loading={isLoading}
                  size="md"
                  borderRadius="lg"
                >
                  {confirmText}
                </Button>
              </HStack>
            </VStack>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// Alert Dialog for simple messages (no confirmation needed)
interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  variant?: "error" | "success" | "warning" | "info";
  buttonText?: string;
}

const alertVariantConfig = {
  error: {
    icon: LuTriangleAlert,
    iconBg: "red.100",
    iconColor: "red.600",
    buttonColor: "red" as const,
  },
  success: {
    icon: LuInfo,
    iconBg: "green.100",
    iconColor: "green.600",
    buttonColor: "green" as const,
  },
  warning: {
    icon: LuTriangleAlert,
    iconBg: "orange.100",
    iconColor: "orange.600",
    buttonColor: "orange" as const,
  },
  info: {
    icon: LuInfo,
    iconBg: "blue.100",
    iconColor: "blue.600",
    buttonColor: "blue" as const,
  },
};

export function AlertDialog({
  isOpen,
  onClose,
  title,
  description,
  variant = "info",
  buttonText = "OK",
}: AlertDialogProps) {
  const config = alertVariantConfig[variant];
  const Icon = config.icon;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      motionPreset="scale"
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            bg="white"
            borderRadius="xl"
            boxShadow="2xl"
            maxW="360px"
            w="90vw"
            p={0}
            overflow="hidden"
          >
            <VStack gap={0} align="stretch">
              {/* Header with icon */}
              <VStack pt={6} pb={4} px={6} gap={3}>
                <Box
                  w={12}
                  h={12}
                  borderRadius="full"
                  bg={config.iconBg}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Icon size={24} color={`var(--chakra-colors-${config.iconColor.replace(".", "-")})`} />
                </Box>
                <Dialog.Title
                  fontSize="lg"
                  fontWeight="semibold"
                  textAlign="center"
                  color="gray.800"
                >
                  {title}
                </Dialog.Title>
              </VStack>

              {/* Description */}
              {description && (
                <Box px={6} pb={4}>
                  <Text
                    fontSize="sm"
                    color="gray.600"
                    textAlign="center"
                    lineHeight="tall"
                  >
                    {description}
                  </Text>
                </Box>
              )}

              {/* Action */}
              <Box px={6} py={4} bg="gray.50" borderTop="1px solid" borderColor="gray.100">
                <Button
                  w="full"
                  colorPalette={config.buttonColor}
                  onClick={onClose}
                  size="md"
                  borderRadius="lg"
                >
                  {buttonText}
                </Button>
              </Box>
            </VStack>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// Custom hook for easier dialog management
import { useState, useCallback } from "react";

interface UseConfirmDialogOptions {
  title: string;
  description?: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
}

export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<UseConfirmDialogOptions>({
    title: "",
  });
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: UseConfirmDialogOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);
    return new Promise((resolve) => {
      setResolveRef(() => resolve);
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    resolveRef?.(false);
    setResolveRef(null);
  }, [resolveRef]);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolveRef?.(true);
    setResolveRef(null);
  }, [resolveRef]);

  const dialogProps = {
    isOpen,
    onClose: handleClose,
    onConfirm: handleConfirm,
    ...options,
  };

  return { confirm, dialogProps, ConfirmDialog };
}

export function useAlertDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<Omit<AlertDialogProps, "isOpen" | "onClose">>({
    title: "",
  });

  const alert = useCallback((opts: Omit<AlertDialogProps, "isOpen" | "onClose">) => {
    setOptions(opts);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const dialogProps = {
    isOpen,
    onClose: handleClose,
    ...options,
  };

  return { alert, dialogProps, AlertDialog };
}
