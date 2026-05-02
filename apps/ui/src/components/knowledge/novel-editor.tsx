"use client";

import { useEffect, useState } from "react";
import {
  EditorRoot,
  EditorContent,
  EditorCommand,
  EditorCommandList,
  EditorCommandItem,
  EditorCommandEmpty,
  EditorBubble,
  EditorBubbleItem,
  type JSONContent,
  type EditorInstance,
  useEditor,
  handleCommandNavigation,
  createSuggestionItems,
  renderItems,
  Command,
  Placeholder,
  StarterKit,
  TaskList,
  TaskItem,
  HorizontalRule,
  TiptapLink,
  TiptapImage,
  TiptapUnderline,
  CodeBlockLowlight,
} from "novel";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  CodeSquare,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createLowlight, common } from "lowlight";

const lowlight = createLowlight(common);

const suggestionItems = createSuggestionItems([
  {
    title: "Heading 1",
    description: "Large section heading",
    searchTerms: ["h1", "title", "big"],
    icon: <Heading1 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    searchTerms: ["h2", "subtitle"],
    icon: <Heading2 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    searchTerms: ["h3"],
    icon: <Heading3 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list",
    searchTerms: ["unordered", "list", "bullet"],
    icon: <List className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a numbered list",
    searchTerms: ["ordered", "list", "number"],
    icon: <ListOrdered className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Task List",
    description: "Track tasks with checkboxes",
    searchTerms: ["todo", "checkbox", "task"],
    icon: <ListTodo className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Blockquote",
    description: "Add a quote block",
    searchTerms: ["quote", "blockquote"],
    icon: <Quote className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Code Block",
    description: "Add a code snippet",
    searchTerms: ["code", "codeblock", "snippet"],
    icon: <CodeSquare className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Horizontal Rule",
    description: "Add a divider line",
    searchTerms: ["divider", "hr", "rule"],
    icon: <Minus className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Image",
    description: "Embed an image from URL",
    searchTerms: ["image", "photo", "picture"],
    icon: <ImageIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const url = window.prompt("Enter image URL:");
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
  },
]);

const extensions = [
  StarterKit.configure({
    codeBlock: false,
    horizontalRule: false,
  }),
  Placeholder.configure({
    placeholder: "Start writing, or press '/' for commands...",
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  HorizontalRule,
  TiptapLink.configure({
    HTMLAttributes: { class: "text-primary underline underline-offset-4 cursor-pointer" },
  }),
  TiptapImage.configure({
    HTMLAttributes: { class: "rounded-md border border-border/50" },
  }),
  TiptapUnderline,
  CodeBlockLowlight.configure({ lowlight }),
  Command.configure({
    suggestion: {
      items: () => suggestionItems,
      render: renderItems,
    },
  }),
];

interface NovelEditorProps {
  initialContent?: JSONContent;
  onChange?: (content: JSONContent) => void;
  onHtmlChange?: (html: string) => void;
  className?: string;
}

export function NovelEditor({
  initialContent,
  onChange,
  onHtmlChange,
  className,
}: NovelEditorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={cn("min-h-[400px] animate-pulse rounded-md bg-muted/20", className)} />
    );
  }

  return (
    <EditorRoot>
      <EditorContent
        initialContent={initialContent}
        extensions={extensions}
        className={cn(
          "novel-editor relative min-h-[400px] w-full border-0",
          className
        )}
        editorProps={{
          handleDOMEvents: {
            keydown: (_view, event) => handleCommandNavigation(event),
          },
          attributes: {
            class: "focus:outline-none",
          },
        }}
        onUpdate={({ editor }: { editor: EditorInstance }) => {
          onChange?.(editor.getJSON());
          onHtmlChange?.(editor.getHTML());
        }}
      >
        <EditorCommand className="z-50 h-auto max-h-[330px] overflow-y-auto rounded-md border border-border bg-popover px-1 py-2 shadow-md">
          <EditorCommandEmpty className="px-2 text-xs text-muted-foreground">
            No results
          </EditorCommandEmpty>
          <EditorCommandList>
            {suggestionItems.map((item) => (
              <EditorCommandItem
                value={item.title}
                onCommand={(val) => item.command?.(val)}
                key={item.title}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent aria-selected:bg-accent"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-border/50 bg-muted/30">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </EditorCommandItem>
            ))}
          </EditorCommandList>
        </EditorCommand>

        <EditorBubble className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-md">
          <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleBold().run()}>
            <BubbleButton active={(editor) => editor.isActive("bold")}>
              <Bold className="h-3.5 w-3.5" />
            </BubbleButton>
          </EditorBubbleItem>
          <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleItalic().run()}>
            <BubbleButton active={(editor) => editor.isActive("italic")}>
              <Italic className="h-3.5 w-3.5" />
            </BubbleButton>
          </EditorBubbleItem>
          <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleUnderline().run()}>
            <BubbleButton active={(editor) => editor.isActive("underline")}>
              <Underline className="h-3.5 w-3.5" />
            </BubbleButton>
          </EditorBubbleItem>
          <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleStrike().run()}>
            <BubbleButton active={(editor) => editor.isActive("strike")}>
              <Strikethrough className="h-3.5 w-3.5" />
            </BubbleButton>
          </EditorBubbleItem>
          <EditorBubbleItem onSelect={(editor) => editor.chain().focus().toggleCode().run()}>
            <BubbleButton active={(editor) => editor.isActive("code")}>
              <Code className="h-3.5 w-3.5" />
            </BubbleButton>
          </EditorBubbleItem>
        </EditorBubble>
      </EditorContent>
    </EditorRoot>
  );
}

function BubbleButton({
  children,
  active,
}: {
  children: React.ReactNode;
  active: (editor: EditorInstance) => boolean;
}) {
  const { editor } = useEditor();
  const isActive = editor ? active(editor as unknown as EditorInstance) : false;

  return (
    <button
      type="button"
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-sm transition-colors",
        isActive
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
