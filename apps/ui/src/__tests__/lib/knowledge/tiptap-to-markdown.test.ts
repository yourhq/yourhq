import { describe, test, expect } from "vitest";
import { tiptapToMarkdown } from "@/lib/knowledge/tiptap-to-markdown";

describe("tiptapToMarkdown", () => {
  test("returns empty string for empty content", () => {
    expect(tiptapToMarkdown({})).toBe("");
    expect(tiptapToMarkdown({ content: [] })).toBe("");
  });

  test("converts paragraph", () => {
    const json = {
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("Hello world");
  });

  test("converts heading levels", () => {
    const json = {
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Subtitle" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Section" }],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("# Title\n\n## Subtitle\n\n### Section");
  });

  test("defaults to h1 when level is missing", () => {
    const json = {
      content: [
        { type: "heading", content: [{ type: "text", text: "No level" }] },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("# No level");
  });

  test("converts bold text", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("**bold**");
  });

  test("converts italic text", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("*italic*");
  });

  test("converts inline code", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "code", marks: [{ type: "code" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("`code`");
  });

  test("converts strikethrough", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "strike", marks: [{ type: "strike" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("~~strike~~");
  });

  test("converts link", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click here",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("[click here](https://example.com)");
  });

  test("underline mark is ignored (no markdown equivalent)", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "underlined", marks: [{ type: "underline" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("underlined");
  });

  test("converts bullet list", () => {
    const json = {
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item 1" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item 2" }] }],
            },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("- Item 1\n- Item 2");
  });

  test("converts ordered list", () => {
    const json = {
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }],
            },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("1. First\n2. Second");
  });

  test("converts task list with checked and unchecked items", () => {
    const json = {
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }],
            },
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Todo" }] }],
            },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("- [x] Done\n- [ ] Todo");
  });

  test("converts blockquote", () => {
    const json = {
      content: [
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Quote" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("> Quote");
  });

  test("converts code block with language", () => {
    const json = {
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("```typescript\nconst x = 1;\n```");
  });

  test("converts code block without language", () => {
    const json = {
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "plain code" }],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("```\nplain code\n```");
  });

  test("converts horizontal rule", () => {
    const json = {
      content: [{ type: "horizontalRule" }],
    };
    expect(tiptapToMarkdown(json)).toBe("---");
  });

  test("converts image", () => {
    const json = {
      content: [
        {
          type: "image",
          attrs: { src: "https://example.com/img.png", alt: "Photo" },
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("![Photo](https://example.com/img.png)");
  });

  test("converts hard break to newline", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line 1" },
            { type: "hardBreak" },
            { type: "text", text: "Line 2" },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("Line 1\nLine 2");
  });

  test("mixed inline marks", () => {
    const json = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "normal " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ],
        },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("normal **bold** and *italic*");
  });

  test("multiple paragraphs separated by double newline", () => {
    const json = {
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Para 1" }] },
        { type: "paragraph", content: [{ type: "text", text: "Para 2" }] },
      ],
    };
    expect(tiptapToMarkdown(json)).toBe("Para 1\n\nPara 2");
  });
});
