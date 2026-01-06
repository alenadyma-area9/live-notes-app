import { HStack, IconButton, Box, Menu, Text, Tooltip, useBreakpointValue } from "@chakra-ui/react";
import { Editor } from "@tiptap/react";
import {
  LuItalic,
  LuStrikethrough,
  LuList,
  LuListOrdered,
  LuHeading1,
  LuHeading2,
  LuHighlighter,
  LuRemoveFormatting,
  LuImage,
} from "react-icons/lu";
import { useRef, useState } from "react";
import { AlertDialog } from "./ConfirmDialog";

interface ToolbarProps {
  editor: Editor | null;
}

// Vertical separator between groups
function Separator() {
  return (
    <Box
      w="1px"
      h={6}
      bg="gray.300"
      mx={1}
      display={{ base: "none", md: "block" }}
    />
  );
}

// Tooltip wrapper for buttons
function TooltipButton({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Root openDelay={100} closeDelay={50}>
      <Tooltip.Trigger asChild>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content>
          {label}
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  );
}

// Text colors - readable colors
const TEXT_COLORS = [
  { name: "Default", color: null, displayColor: "#1a1a1a" },
  { name: "Red", color: "#DC2626", displayColor: "#DC2626" },
  { name: "Orange", color: "#EA580C", displayColor: "#EA580C" },
  { name: "Green", color: "#16A34A", displayColor: "#16A34A" },
  { name: "Blue", color: "#2563EB", displayColor: "#2563EB" },
  { name: "Purple", color: "#9333EA", displayColor: "#9333EA" },
];

// Highlight colors - neon marker colors (slightly muted for readability)
const HIGHLIGHT_COLORS = [
  { name: "None", color: null },
  { name: "Yellow", color: "#FFFF66" },
  { name: "Green", color: "#99FF66" },
  { name: "Pink", color: "#FF99FF" },
  { name: "Blue", color: "#66FFFF" },
  { name: "Orange", color: "#FFCC66" },
];

export function Toolbar({ editor }: ToolbarProps) {
  const isMobile = useBreakpointValue({ base: true, md: false });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSizeError, setImageSizeError] = useState(false);

  if (!editor) return null;

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setImageSizeError(true);
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      editor.chain().focus().setImage({ src: base64 }).run();
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = "";
  };

  // Only show active styles on toolbar buttons when editor is focused
  const isFocused = editor.isFocused;

  const isActiveButton = (name: string, attrs?: Record<string, unknown>) => {
    return isFocused && editor.isActive(name, attrs);
  };

  // Always show active state inside dropdowns (regardless of focus)
  const isActiveItem = (name: string, attrs?: Record<string, unknown>) => {
    return editor.isActive(name, attrs);
  };

  const getCurrentTextColor = () => {
    for (const c of TEXT_COLORS) {
      if (c.color && editor.isActive("textStyle", { color: c.color })) {
        return c.displayColor;
      }
    }
    // Default is black
    return "#1a1a1a";
  };

  const getCurrentHighlight = () => {
    if (!isFocused) return null;
    for (const c of HIGHLIGHT_COLORS) {
      if (c.color && editor.isActive("highlight", { color: c.color })) {
        return c.color;
      }
    }
    return null;
  };

  const currentTextColor = getCurrentTextColor();
  const currentHighlight = getCurrentHighlight();

  // Mobile: Compact toolbar with grouped dropdowns
  if (isMobile) {
    return (
      <HStack gap={1} p={2} flexWrap="wrap" align="center">
        {/* Text Formatting Group */}
        <Menu.Root positioning={{ placement: "bottom-start" }}>
          <Menu.Trigger asChild>
            <IconButton
              aria-label="Text formatting"
              variant={isActiveButton("bold") || isActiveButton("italic") || isActiveButton("strike") ? "solid" : "ghost"}
              colorPalette={isActiveButton("bold") || isActiveButton("italic") || isActiveButton("strike") ? "blue" : "gray"}
              size="sm"
            >
              <Text fontSize="xs" fontWeight="semibold">Aa</Text>
            </IconButton>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content minW="140px">
              <Menu.Item
                value="bold"
                onClick={() => editor.chain().focus().toggleBold().run()}
                bg={isActiveItem("bold") ? "blue.50" : undefined}
              >
                <HStack gap={2} justify="space-between" w="full">
                  <HStack gap={2}>
                    <Text fontWeight="black">B</Text>
                    <Text fontSize="sm">Bold</Text>
                  </HStack>
                  {isActiveItem("bold") && <Text color="blue.500">✓</Text>}
                </HStack>
              </Menu.Item>
              <Menu.Item
                value="italic"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                bg={isActiveItem("italic") ? "blue.50" : undefined}
              >
                <HStack gap={2} justify="space-between" w="full">
                  <HStack gap={2}>
                    <LuItalic />
                    <Text fontSize="sm">Italic</Text>
                  </HStack>
                  {isActiveItem("italic") && <Text color="blue.500">✓</Text>}
                </HStack>
              </Menu.Item>
              <Menu.Item
                value="strikethrough"
                onClick={() => editor.chain().focus().toggleStrike().run()}
                bg={isActiveItem("strike") ? "blue.50" : undefined}
              >
                <HStack gap={2} justify="space-between" w="full">
                  <HStack gap={2}>
                    <LuStrikethrough />
                    <Text fontSize="sm">Strikethrough</Text>
                  </HStack>
                  {isActiveItem("strike") && <Text color="blue.500">✓</Text>}
                </HStack>
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>

        {/* Headings Group */}
        <Menu.Root positioning={{ placement: "bottom-start" }}>
          <Menu.Trigger asChild>
            <IconButton
              aria-label="Headings"
              variant={isActiveButton("heading", { level: 1 }) || isActiveButton("heading", { level: 2 }) ? "solid" : "ghost"}
              colorPalette={isActiveButton("heading", { level: 1 }) || isActiveButton("heading", { level: 2 }) ? "blue" : "gray"}
              size="sm"
            >
              <Text fontSize="xs" fontWeight="bold">H</Text>
            </IconButton>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content minW="140px">
              <Menu.Item
                value="h1"
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                bg={isActiveItem("heading", { level: 1 }) ? "blue.50" : undefined}
              >
                <HStack gap={2} justify="space-between" w="full">
                  <HStack gap={2}>
                    <LuHeading1 />
                    <Text fontSize="sm">Heading 1</Text>
                  </HStack>
                  {isActiveItem("heading", { level: 1 }) && <Text color="blue.500">✓</Text>}
                </HStack>
              </Menu.Item>
              <Menu.Item
                value="h2"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                bg={isActiveItem("heading", { level: 2 }) ? "blue.50" : undefined}
              >
                <HStack gap={2} justify="space-between" w="full">
                  <HStack gap={2}>
                    <LuHeading2 />
                    <Text fontSize="sm">Heading 2</Text>
                  </HStack>
                  {isActiveItem("heading", { level: 2 }) && <Text color="blue.500">✓</Text>}
                </HStack>
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>

        {/* Lists Group */}
        <Menu.Root positioning={{ placement: "bottom-start" }}>
          <Menu.Trigger asChild>
            <IconButton
              aria-label="Lists"
              variant={isActiveButton("bulletList") || isActiveButton("orderedList") ? "solid" : "ghost"}
              colorPalette={isActiveButton("bulletList") || isActiveButton("orderedList") ? "blue" : "gray"}
              size="sm"
            >
              <LuList size={14} />
            </IconButton>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content minW="140px">
              <Menu.Item
                value="bullet"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                bg={isActiveItem("bulletList") ? "blue.50" : undefined}
              >
                <HStack gap={2} justify="space-between" w="full">
                  <HStack gap={2}>
                    <LuList />
                    <Text fontSize="sm">Bullet List</Text>
                  </HStack>
                  {isActiveItem("bulletList") && <Text color="blue.500">✓</Text>}
                </HStack>
              </Menu.Item>
              <Menu.Item
                value="numbered"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                bg={isActiveItem("orderedList") ? "blue.50" : undefined}
              >
                <HStack gap={2} justify="space-between" w="full">
                  <HStack gap={2}>
                    <LuListOrdered />
                    <Text fontSize="sm">Numbered List</Text>
                  </HStack>
                  {isActiveItem("orderedList") && <Text color="blue.500">✓</Text>}
                </HStack>
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>

        {/* Text Color */}
        <Menu.Root positioning={{ placement: "bottom-start" }}>
          <Menu.Trigger asChild>
            <IconButton
              aria-label="Text Color"
              variant="ghost"
              colorPalette="gray"
              size="sm"
            >
              <Box position="relative" display="flex" alignItems="center" justifyContent="center">
                <Text fontWeight="bold" fontSize="sm">A</Text>
                <Box
                  position="absolute"
                  bottom={0}
                  left={0}
                  right={0}
                  h="3px"
                  bg={currentTextColor || "#1a1a1a"}
                  borderRadius="full"
                />
              </Box>
            </IconButton>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content minW="120px">
              {TEXT_COLORS.map((c) => {
                const isSelected = c.color ? editor.isActive("textStyle", { color: c.color }) : !editor.getAttributes("textStyle").color;
                return (
                  <Menu.Item
                    key={c.name}
                    value={c.name}
                    onClick={() => {
                      if (c.color) {
                        // Toggle: if already selected, unset; otherwise set
                        if (isSelected) {
                          editor.chain().focus().unsetColor().run();
                        } else {
                          editor.chain().focus().setColor(c.color).run();
                        }
                      } else {
                        editor.chain().focus().unsetColor().run();
                      }
                    }}
                    bg={isSelected ? "blue.50" : undefined}
                  >
                    <HStack gap={2} justify="space-between" w="full">
                      <HStack gap={2}>
                        <Box
                          w={4}
                          h={4}
                          borderRadius="sm"
                          bg={c.displayColor}
                          border="1px solid"
                          borderColor="gray.300"
                        />
                        <Text fontSize="sm">{c.name}</Text>
                      </HStack>
                      {isSelected && <Text color="blue.500">✓</Text>}
                    </HStack>
                  </Menu.Item>
                );
              })}
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>

        {/* Highlight Color */}
        <Menu.Root positioning={{ placement: "bottom-start" }}>
          <Menu.Trigger asChild>
            <IconButton
              aria-label="Highlight"
              variant={currentHighlight ? "solid" : "ghost"}
              colorPalette={currentHighlight ? "blue" : "gray"}
              size="sm"
            >
              <Box position="relative">
                <LuHighlighter size={14} />
                {currentHighlight && (
                  <Box
                    position="absolute"
                    bottom={-1}
                    left={0}
                    right={0}
                    h="3px"
                    bg={currentHighlight}
                    borderRadius="full"
                  />
                )}
              </Box>
            </IconButton>
          </Menu.Trigger>
          <Menu.Positioner>
            <Menu.Content minW="120px">
              {HIGHLIGHT_COLORS.map((c) => {
                const isSelected = c.color ? editor.isActive("highlight", { color: c.color }) : !editor.isActive("highlight");
                return (
                  <Menu.Item
                    key={c.name}
                    value={c.name}
                    onClick={() => {
                      if (c.color) {
                        // Toggle: if already selected, unset; otherwise set
                        if (isSelected) {
                          editor.chain().focus().unsetHighlight().run();
                        } else {
                          editor.chain().focus().setHighlight({ color: c.color }).run();
                        }
                      } else {
                        editor.chain().focus().unsetHighlight().run();
                      }
                    }}
                    bg={isSelected ? "blue.50" : undefined}
                  >
                    <HStack gap={2} justify="space-between" w="full">
                      <HStack gap={2}>
                        <Box
                          w={4}
                          h={4}
                          borderRadius="sm"
                          bg={c.color || "transparent"}
                          border="1px solid"
                          borderColor="gray.300"
                        />
                        <Text fontSize="sm">{c.name}</Text>
                      </HStack>
                      {isSelected && <Text color="blue.500">✓</Text>}
                    </HStack>
                  </Menu.Item>
                );
              })}
            </Menu.Content>
          </Menu.Positioner>
        </Menu.Root>

        {/* Image */}
        <TooltipButton label="Insert Image">
          <IconButton
            aria-label="Insert Image"
            onClick={() => fileInputRef.current?.click()}
            variant="ghost"
            colorPalette="gray"
            size="sm"
          >
            <LuImage size={14} />
          </IconButton>
        </TooltipButton>

        {/* Clear Formatting */}
        <TooltipButton label="Clear Formatting">
          <IconButton
            aria-label="Clear Formatting"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
            variant="ghost"
            colorPalette="gray"
            size="sm"
          >
            <LuRemoveFormatting size={14} />
          </IconButton>
        </TooltipButton>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          style={{ display: "none" }}
        />
      </HStack>
    );
  }

  // Desktop: Full toolbar
  return (
    <HStack gap={1} p={2} flexWrap="wrap" align="center">
      {/* Text formatting group */}
      <TooltipButton label="Bold (Ctrl+B)">
        <IconButton
          aria-label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          variant={isActiveButton("bold") ? "solid" : "ghost"}
          colorPalette={isActiveButton("bold") ? "blue" : "gray"}
          size="sm"
        >
          <Text fontWeight="black" fontSize="md">B</Text>
        </IconButton>
      </TooltipButton>

      <TooltipButton label="Italic (Ctrl+I)">
        <IconButton
          aria-label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          variant={isActiveButton("italic") ? "solid" : "ghost"}
          colorPalette={isActiveButton("italic") ? "blue" : "gray"}
          size="sm"
        >
          <LuItalic />
        </IconButton>
      </TooltipButton>

      <TooltipButton label="Strikethrough (Ctrl+Shift+S)">
        <IconButton
          aria-label="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          variant={isActiveButton("strike") ? "solid" : "ghost"}
          colorPalette={isActiveButton("strike") ? "blue" : "gray"}
          size="sm"
        >
          <LuStrikethrough />
        </IconButton>
      </TooltipButton>

      <Separator />

      {/* Headings group */}
      <TooltipButton label="Heading 1 (Ctrl+Alt+1)">
        <IconButton
          aria-label="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          variant={isActiveButton("heading", { level: 1 }) ? "solid" : "ghost"}
          colorPalette={isActiveButton("heading", { level: 1 }) ? "blue" : "gray"}
          size="sm"
        >
          <LuHeading1 />
        </IconButton>
      </TooltipButton>

      <TooltipButton label="Heading 2 (Ctrl+Alt+2)">
        <IconButton
          aria-label="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          variant={isActiveButton("heading", { level: 2 }) ? "solid" : "ghost"}
          colorPalette={isActiveButton("heading", { level: 2 }) ? "blue" : "gray"}
          size="sm"
        >
          <LuHeading2 />
        </IconButton>
      </TooltipButton>

      <Separator />

      {/* Lists group */}
      <TooltipButton label="Bullet List (Ctrl+Shift+8)">
        <IconButton
          aria-label="Bullet List"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          variant={isActiveButton("bulletList") ? "solid" : "ghost"}
          colorPalette={isActiveButton("bulletList") ? "blue" : "gray"}
          size="sm"
        >
          <LuList />
        </IconButton>
      </TooltipButton>

      <TooltipButton label="Numbered List (Ctrl+Shift+7)">
        <IconButton
          aria-label="Numbered List"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          variant={isActiveButton("orderedList") ? "solid" : "ghost"}
          colorPalette={isActiveButton("orderedList") ? "blue" : "gray"}
          size="sm"
        >
          <LuListOrdered />
        </IconButton>
      </TooltipButton>

      <Separator />

      {/* Text Color */}
      <Menu.Root positioning={{ placement: "bottom-start" }}>
        <Menu.Trigger asChild>
          <Box>
            <TooltipButton label="Text Color">
              <IconButton
                aria-label="Text Color"
                variant="ghost"
                colorPalette="gray"
                size="sm"
              >
                <Box position="relative" display="flex" alignItems="center" justifyContent="center">
                  <Text fontWeight="bold" fontSize="sm">A</Text>
                  <Box
                    position="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    h="3px"
                    bg={currentTextColor || "#1a1a1a"}
                    borderRadius="full"
                  />
                </Box>
              </IconButton>
            </TooltipButton>
          </Box>
        </Menu.Trigger>
        <Menu.Positioner>
          <Menu.Content minW="120px">
            {TEXT_COLORS.map((c) => {
              const isSelected = c.color ? editor.isActive("textStyle", { color: c.color }) : !editor.getAttributes("textStyle").color;
              return (
                <Menu.Item
                  key={c.name}
                  value={c.name}
                  onClick={() => {
                    if (c.color) {
                      // Toggle: if already selected, unset; otherwise set
                      if (isSelected) {
                        editor.chain().focus().unsetColor().run();
                      } else {
                        editor.chain().focus().setColor(c.color).run();
                      }
                    } else {
                      editor.chain().focus().unsetColor().run();
                    }
                  }}
                  bg={isSelected ? "blue.50" : undefined}
                >
                  <HStack gap={2} justify="space-between" w="full">
                    <HStack gap={2}>
                      <Box
                        w={4}
                        h={4}
                        borderRadius="sm"
                        bg={c.displayColor}
                        border="1px solid"
                        borderColor="gray.300"
                      />
                      <Text fontSize="sm">{c.name}</Text>
                    </HStack>
                    {isSelected && <Text color="blue.500">✓</Text>}
                  </HStack>
                </Menu.Item>
              );
            })}
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>

      {/* Highlight Color */}
      <Menu.Root positioning={{ placement: "bottom-start" }}>
        <Menu.Trigger asChild>
          <Box>
            <TooltipButton label="Highlight">
              <IconButton
                aria-label="Highlight"
                variant={currentHighlight ? "solid" : "ghost"}
                colorPalette={currentHighlight ? "blue" : "gray"}
                size="sm"
              >
                <Box position="relative">
                  <LuHighlighter />
                  {currentHighlight && (
                    <Box
                      position="absolute"
                      bottom={-1}
                      left={0}
                      right={0}
                      h="3px"
                      bg={currentHighlight}
                      borderRadius="full"
                    />
                  )}
                </Box>
              </IconButton>
            </TooltipButton>
          </Box>
        </Menu.Trigger>
        <Menu.Positioner>
          <Menu.Content minW="120px">
            {HIGHLIGHT_COLORS.map((c) => {
              const isSelected = c.color ? editor.isActive("highlight", { color: c.color }) : !editor.isActive("highlight");
              return (
                <Menu.Item
                  key={c.name}
                  value={c.name}
                  onClick={() => {
                    if (c.color) {
                      // Toggle: if already selected, unset; otherwise set
                      if (isSelected) {
                        editor.chain().focus().unsetHighlight().run();
                      } else {
                        editor.chain().focus().setHighlight({ color: c.color }).run();
                      }
                    } else {
                      editor.chain().focus().unsetHighlight().run();
                    }
                  }}
                  bg={isSelected ? "blue.50" : undefined}
                >
                  <HStack gap={2} justify="space-between" w="full">
                    <HStack gap={2}>
                      <Box
                        w={4}
                        h={4}
                        borderRadius="sm"
                        bg={c.color || "transparent"}
                        border="1px solid"
                        borderColor="gray.300"
                      />
                      <Text fontSize="sm">{c.name}</Text>
                    </HStack>
                    {isSelected && <Text color="blue.500">✓</Text>}
                  </HStack>
                </Menu.Item>
              );
            })}
          </Menu.Content>
        </Menu.Positioner>
      </Menu.Root>

      <Separator />

      <Separator />

      {/* Image */}
      <TooltipButton label="Insert Image">
        <IconButton
          aria-label="Insert Image"
          onClick={() => fileInputRef.current?.click()}
          variant="ghost"
          colorPalette="gray"
          size="sm"
        >
          <LuImage />
        </IconButton>
      </TooltipButton>

      {/* Clear Formatting */}
      <TooltipButton label="Clear Formatting (Ctrl+\)">
        <IconButton
          aria-label="Clear Formatting"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          variant="ghost"
          colorPalette="gray"
          size="sm"
        >
          <LuRemoveFormatting />
        </IconButton>
      </TooltipButton>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        accept="image/*"
        style={{ display: "none" }}
      />

      {/* Image Size Error Dialog */}
      <AlertDialog
        isOpen={imageSizeError}
        onClose={() => setImageSizeError(false)}
        title="Image Too Large"
        description="Please select an image smaller than 5MB."
        variant="warning"
        buttonText="OK"
      />
    </HStack>
  );
}
