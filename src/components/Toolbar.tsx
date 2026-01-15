import { HStack, IconButton, Box, Text, Tooltip } from "@chakra-ui/react";
import { Editor } from "@tiptap/react";
import {
  LuRemoveFormatting,
  LuImage,
  LuLink,
  LuSquareCheck,
  LuUnderline,
} from "react-icons/lu";
import { useRef } from "react";

interface ToolbarProps {
  editor: Editor | null;
}

// Tooltip wrapper component for cleaner code
function ToolbarButton({
  label,
  shortcut,
  children,
  onClick,
  isActive = false,
  ...props
}: {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  [key: string]: unknown;
}) {
  return (
    <Tooltip.Root openDelay={300} closeDelay={100}>
      <Tooltip.Trigger asChild>
        <IconButton
          aria-label={label}
          variant="ghost"
          size="sm"
          minW="32px"
          h="32px"
          bg={isActive ? "#EEF2FF" : undefined}
          color={isActive ? "#4F46E5" : "gray.600"}
          onClick={onClick}
          {...props}
        >
          {children}
        </IconButton>
      </Tooltip.Trigger>
      <Tooltip.Positioner>
        <Tooltip.Content>
          <Text fontSize="xs">{label}{shortcut && ` (${shortcut})`}</Text>
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  );
}

export function Toolbar({ editor }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image too large (max 5MB)");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAddLink = () => {
    const url = prompt("Enter URL:");
    if (url) {
      const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
      editor.chain().focus().setLink({ href: normalizedUrl }).run();
    }
  };

  return (
    <HStack
      px={{ base: 2, md: 4 }}
      py={1.5}
      gap={0.5}
      flexWrap="wrap"
    >
      {/* Bold */}
      <ToolbarButton
        label="Bold"
        shortcut="Ctrl+B"
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
      >
        <Text fontWeight="black" fontSize="sm">B</Text>
      </ToolbarButton>

      {/* Italic */}
      <ToolbarButton
        label="Italic"
        shortcut="Ctrl+I"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
      >
        <Text fontStyle="italic" fontSize="sm">I</Text>
      </ToolbarButton>

      {/* Underline */}
      <ToolbarButton
        label="Underline"
        shortcut="Ctrl+U"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
      >
        <LuUnderline size={16} />
      </ToolbarButton>

      {/* Separator */}
      <Box w="1px" h={5} bg="gray.300" mx={1} />

      {/* Red Text */}
      <ToolbarButton
        label="Red text"
        onClick={() => {
          if (editor.isActive('textStyle', { color: '#DC2626' })) {
            editor.chain().focus().unsetColor().run();
          } else {
            editor.chain().focus().setColor("#DC2626").run();
          }
        }}
      >
        <Box display="flex" flexDirection="column" alignItems="center" gap={0}>
          <Text fontWeight="bold" fontSize="sm" lineHeight={1}>A</Text>
          <Box
            w={3.5}
            h="2px"
            bg={editor.isActive('textStyle', { color: '#DC2626' }) ? "black" : "#DC2626"}
            borderRadius="full"
          />
        </Box>
      </ToolbarButton>

      {/* Yellow Highlight */}
      <ToolbarButton
        label="Highlight"
        onClick={() => {
          if (editor.isActive('highlight', { color: '#fef08a' })) {
            editor.chain().focus().unsetHighlight().run();
          } else {
            editor.chain().focus().setHighlight({ color: "#fef08a" }).run();
          }
        }}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg={editor.isActive('highlight', { color: '#fef08a' }) ? "transparent" : "#fef08a"}
          border={editor.isActive('highlight', { color: '#fef08a' }) ? "1.5px solid" : "none"}
          borderColor="gray.500"
          px={1}
          borderRadius="sm"
        >
          <Text fontWeight="bold" fontSize="sm" lineHeight={1} color="gray.700">A</Text>
        </Box>
      </ToolbarButton>

      {/* Separator */}
      <Box w="1px" h={5} bg="gray.300" mx={1} />

      {/* Checkbox List */}
      <ToolbarButton
        label="Checkbox list"
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive("taskList")}
      >
        <LuSquareCheck size={16} />
      </ToolbarButton>

      {/* Separator */}
      <Box w="1px" h={5} bg="gray.300" mx={1} />

      {/* Link */}
      <ToolbarButton
        label="Add link"
        onClick={handleAddLink}
        isActive={editor.isActive("link")}
      >
        <LuLink size={16} />
      </ToolbarButton>

      {/* Image */}
      <ToolbarButton
        label="Insert image"
        onClick={handleImageUpload}
      >
        <LuImage size={16} />
      </ToolbarButton>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Separator */}
      <Box w="1px" h={5} bg="gray.300" mx={1} />

      {/* Clear Formatting */}
      <ToolbarButton
        label="Clear formatting"
        shortcut="Ctrl+\"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <LuRemoveFormatting size={16} />
      </ToolbarButton>
    </HStack>
  );
}
