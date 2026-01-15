import { HStack, IconButton, Box, Text } from "@chakra-ui/react";
import { Editor } from "@tiptap/react";
import {
  LuRemoveFormatting,
  LuImage,
  LuLink,
  LuSquareCheck,
} from "react-icons/lu";
import { useRef } from "react";

interface ToolbarProps {
  editor: Editor | null;
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

    // Reset input
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

  const buttonStyle = {
    variant: "ghost" as const,
    size: "sm" as const,
    minW: "32px",
    h: "32px",
  };

  const getActiveStyle = (isActive: boolean) => ({
    bg: isActive ? "#EEF2FF" : undefined,
    color: isActive ? "#4F46E5" : "gray.600",
  });

  return (
    <HStack
      px={{ base: 2, md: 4 }}
      py={1.5}
      bg="gray.50"
      borderBottom="1px solid"
      borderColor="gray.200"
      gap={0.5}
      flexWrap="wrap"
    >
      {/* Bold */}
      <IconButton
        aria-label="Bold"
        {...buttonStyle}
        {...getActiveStyle(editor.isActive("bold"))}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Text fontWeight="black" fontSize="sm">B</Text>
      </IconButton>

      {/* Italic */}
      <IconButton
        aria-label="Italic"
        {...buttonStyle}
        {...getActiveStyle(editor.isActive("italic"))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Text fontStyle="italic" fontSize="sm">I</Text>
      </IconButton>

      {/* Separator */}
      <Box w="1px" h={5} bg="gray.300" mx={1} />

      {/* Red Text - toggle between red and default */}
      <IconButton
        aria-label="Red text"
        {...buttonStyle}
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
      </IconButton>

      {/* Yellow Highlight - toggle on/off */}
      <IconButton
        aria-label="Yellow highlight"
        {...buttonStyle}
        onClick={() => {
          if (editor.isActive('highlight', { color: '#fef08a' })) {
            editor.chain().focus().unsetHighlight().run();
          } else {
            editor.chain().focus().setHighlight({ color: "#fef08a" }).run();
          }
        }}
      >
        <Box
          w={4}
          h={4}
          borderRadius="sm"
          bg={editor.isActive('highlight', { color: '#fef08a' }) ? "transparent" : "#fef08a"}
          border="2px solid"
          borderColor={editor.isActive('highlight', { color: '#fef08a' }) ? "gray.600" : "gray.400"}
        />
      </IconButton>

      {/* Separator */}
      <Box w="1px" h={5} bg="gray.300" mx={1} />

      {/* Checkbox List */}
      <IconButton
        aria-label="Checkbox list"
        {...buttonStyle}
        {...getActiveStyle(editor.isActive("taskList"))}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <LuSquareCheck size={16} />
      </IconButton>

      {/* Separator */}
      <Box w="1px" h={5} bg="gray.300" mx={1} />

      {/* Link */}
      <IconButton
        aria-label="Add link"
        {...buttonStyle}
        {...getActiveStyle(editor.isActive("link"))}
        onClick={handleAddLink}
      >
        <LuLink size={16} />
      </IconButton>

      {/* Image */}
      <IconButton
        aria-label="Insert image"
        {...buttonStyle}
        color="gray.600"
        onClick={handleImageUpload}
      >
        <LuImage size={16} />
      </IconButton>

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
      <IconButton
        aria-label="Clear formatting"
        {...buttonStyle}
        color="gray.600"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <LuRemoveFormatting size={16} />
      </IconButton>
    </HStack>
  );
}
