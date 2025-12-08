import { HStack, IconButton } from "@chakra-ui/react";
import { Editor } from "@tiptap/react";
import {
  LuBold,
  LuItalic,
  LuStrikethrough,
  LuList,
  LuListOrdered,
  LuHeading1,
  LuHeading2,
} from "react-icons/lu";

interface ToolbarProps {
  editor: Editor | null;
}

export function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  const buttons = [
    {
      icon: <LuBold />,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive("bold"),
      label: "Bold",
    },
    {
      icon: <LuItalic />,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive("italic"),
      label: "Italic",
    },
    {
      icon: <LuStrikethrough />,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive("strike"),
      label: "Strikethrough",
    },
    {
      icon: <LuHeading1 />,
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive("heading", { level: 1 }),
      label: "Heading 1",
    },
    {
      icon: <LuHeading2 />,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive("heading", { level: 2 }),
      label: "Heading 2",
    },
    {
      icon: <LuList />,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive("bulletList"),
      label: "Bullet List",
    },
    {
      icon: <LuListOrdered />,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive("orderedList"),
      label: "Ordered List",
    },
  ];

  return (
    <HStack gap={1} p={2} flexWrap="wrap">
      {buttons.map((btn) => (
        <IconButton
          key={btn.label}
          aria-label={btn.label}
          onClick={btn.action}
          variant={btn.isActive ? "solid" : "ghost"}
          colorPalette={btn.isActive ? "blue" : "gray"}
          size="sm"
        >
          {btn.icon}
        </IconButton>
      ))}
    </HStack>
  );
}
