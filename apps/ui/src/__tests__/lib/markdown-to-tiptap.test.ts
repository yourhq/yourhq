import { describe, it, expect } from "vitest";
import {
  markdownToTiptap,
  isMarkdownInParagraphs,
  convertMarkdownContent,
} from "@/lib/knowledge/markdown-to-tiptap";

describe("markdownToTiptap", () => {
  it("converts a basic paragraph", () => {
    const result = markdownToTiptap("Hello world");
    expect(result.type).toBe("doc");
    expect(result.content).toHaveLength(1);
    expect(result.content![0].type).toBe("paragraph");
    expect(result.content![0].content![0]).toEqual({
      type: "text",
      text: "Hello world",
    });
  });

  it("converts h1 heading", () => {
    const result = markdownToTiptap("# Title");
    expect(result.content![0].type).toBe("heading");
    expect(result.content![0].attrs).toEqual({ level: 1 });
    expect(result.content![0].content![0].text).toBe("Title");
  });

  it("converts h2 heading", () => {
    const result = markdownToTiptap("## Subtitle");
    expect(result.content![0].attrs).toEqual({ level: 2 });
    expect(result.content![0].content![0].text).toBe("Subtitle");
  });

  it("converts h3 heading", () => {
    const result = markdownToTiptap("### Section");
    expect(result.content![0].attrs).toEqual({ level: 3 });
  });

  it("converts bold text", () => {
    const result = markdownToTiptap("Some **bold** text");
    const nodes = result.content![0].content!;
    expect(nodes[0]).toEqual({ type: "text", text: "Some " });
    expect(nodes[1]).toEqual({
      type: "text",
      marks: [{ type: "bold" }],
      text: "bold",
    });
    expect(nodes[2]).toEqual({ type: "text", text: " text" });
  });

  it("converts italic text", () => {
    const result = markdownToTiptap("Some *italic* text");
    const nodes = result.content![0].content!;
    expect(nodes[1]).toEqual({
      type: "text",
      marks: [{ type: "italic" }],
      text: "italic",
    });
  });

  it("converts inline code", () => {
    const result = markdownToTiptap("Use `npm install` here");
    const nodes = result.content![0].content!;
    expect(nodes[1]).toEqual({
      type: "text",
      marks: [{ type: "code" }],
      text: "npm install",
    });
  });

  it("converts links", () => {
    const result = markdownToTiptap("Visit [Google](https://google.com) now");
    const nodes = result.content![0].content!;
    expect(nodes[1]).toEqual({
      type: "text",
      marks: [
        { type: "link", attrs: { href: "https://google.com", target: "_blank" } },
      ],
      text: "Google",
    });
  });

  it("converts a code block with language", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("codeBlock");
    expect(result.content![0].attrs).toEqual({ language: "typescript" });
    expect(result.content![0].content![0].text).toBe("const x = 1;");
  });

  it("converts a code block without language", () => {
    const md = "```\nplain code\n```";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("codeBlock");
    expect(result.content![0].attrs).toEqual({});
    expect(result.content![0].content![0].text).toBe("plain code");
  });

  it("converts a bullet list", () => {
    const md = "- Item one\n- Item two\n- Item three";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("bulletList");
    expect(result.content![0].content).toHaveLength(3);
    expect(result.content![0].content![0].type).toBe("listItem");
    expect(
      result.content![0].content![0].content![0].content![0].text,
    ).toBe("Item one");
  });

  it("converts bullet list with * prefix", () => {
    const md = "* Alpha\n* Beta";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("bulletList");
    expect(result.content![0].content).toHaveLength(2);
  });

  it("converts an ordered list", () => {
    const md = "1. First\n2. Second\n3. Third";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("orderedList");
    expect(result.content![0].content).toHaveLength(3);
    expect(
      result.content![0].content![1].content![0].content![0].text,
    ).toBe("Second");
  });

  it("converts a horizontal rule", () => {
    const md = "---";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("horizontalRule");
  });

  it("converts a blockquote", () => {
    const md = "> This is quoted";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("blockquote");
    expect(
      result.content![0].content![0].content![0].text,
    ).toBe("This is quoted");
  });

  it("joins multiline blockquotes", () => {
    const md = "> Line one\n> Line two";
    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("blockquote");
    expect(
      result.content![0].content![0].content![0].text,
    ).toBe("Line one Line two");
  });

  it("handles empty input", () => {
    const result = markdownToTiptap("");
    expect(result).toEqual({ type: "doc", content: [] });
  });

  it("skips blank lines", () => {
    const md = "Paragraph one\n\nParagraph two";
    const result = markdownToTiptap(md);
    expect(result.content).toHaveLength(2);
    expect(result.content![0].type).toBe("paragraph");
    expect(result.content![1].type).toBe("paragraph");
  });

  it("converts a mixed document", () => {
    const md = [
      "# Heading",
      "",
      "Some text with **bold** and *italic*.",
      "",
      "- Item A",
      "- Item B",
      "",
      "```js",
      "console.log('hi');",
      "```",
    ].join("\n");

    const result = markdownToTiptap(md);
    expect(result.content![0].type).toBe("heading");
    expect(result.content![1].type).toBe("paragraph");
    expect(result.content![2].type).toBe("bulletList");
    expect(result.content![3].type).toBe("codeBlock");
  });

  it("handles special characters in plain text", () => {
    const result = markdownToTiptap("Price: $100 & 50% off <tag>");
    const text = result.content![0].content![0].text;
    expect(text).toBe("Price: $100 & 50% off <tag>");
  });

  it("produces text with a space for a line with no inline content", () => {
    const result = markdownToTiptap("#### H4 level");
    expect(result.content![0].type).toBe("paragraph");
    expect(result.content![0].content![0].text).toBe("#### H4 level");
  });
});

describe("isMarkdownInParagraphs", () => {
  it("returns false for empty doc", () => {
    expect(isMarkdownInParagraphs({ type: "doc", content: [] })).toBe(false);
  });

  it("returns false for a single plain paragraph", () => {
    expect(
      isMarkdownInParagraphs({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Just text" }],
          },
        ],
      }),
    ).toBe(false);
  });

  it("returns true when paragraphs contain markdown-like syntax", () => {
    expect(
      isMarkdownInParagraphs({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "# Heading" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "- List item" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("returns false when document already has structured nodes", () => {
    expect(
      isMarkdownInParagraphs({
        type: "doc",
        content: [
          { type: "heading", content: [{ type: "text", text: "Real heading" }] },
          {
            type: "paragraph",
            content: [{ type: "text", text: "# Fake heading" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "- Fake list" }],
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("convertMarkdownContent", () => {
  it("passes through non-markdown content unchanged", () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Plain text" }],
        },
      ],
    };
    expect(convertMarkdownContent(doc)).toBe(doc);
  });

  it("converts markdown-in-paragraphs to structured tiptap", () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "# Title" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "- Item one" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "- Item two" }],
        },
      ],
    };
    const result = convertMarkdownContent(doc);
    expect(result.content![0].type).toBe("heading");
    expect(result.content![1].type).toBe("bulletList");
  });
});
