// Converts markdown text (stored as plain text in Tiptap paragraph nodes)
// into proper Tiptap JSONContent with heading, bulletList, etc. nodes.

import type { JSONContent } from "novel";

/**
 * Detect if Tiptap JSON content is "markdown in paragraphs" —
 * all paragraph nodes containing raw markdown syntax like # headings, - lists.
 */
export function isMarkdownInParagraphs(json: JSONContent): boolean {
  if (json.type !== "doc" || !json.content?.length) return false;

  // Check if >50% of non-empty paragraphs look like markdown
  const paragraphs = json.content.filter(
    (n) => n.type === "paragraph" && n.content?.length
  );
  if (paragraphs.length === 0) return false;

  // Already has proper structured nodes (headings, lists, etc.)
  const hasStructured = json.content.some(
    (n) =>
      n.type === "heading" ||
      n.type === "bulletList" ||
      n.type === "orderedList" ||
      n.type === "codeBlock" ||
      n.type === "blockquote"
  );
  if (hasStructured) return false;

  let mdCount = 0;
  for (const p of paragraphs) {
    const text = extractText(p);
    if (/^#{1,3}\s/.test(text) || /^[-*]\s/.test(text) || /^\d+\.\s/.test(text) || /^>\s/.test(text) || text === "---") {
      mdCount++;
    }
  }
  return mdCount >= 2;
}

/**
 * Extract the full markdown string from a Tiptap JSON doc
 * that consists only of paragraph nodes with text.
 */
function extractFullText(json: JSONContent): string {
  if (!json.content) return "";
  return json.content
    .map((node) => {
      if (node.type === "paragraph") {
        return extractText(node);
      }
      return "";
    })
    .join("\n");
}

function extractText(node: JSONContent): string {
  if (!node.content) return "";
  return node.content
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("");
}

/**
 * Convert a markdown string into Tiptap JSONContent.
 * Handles: headings, bullet lists, ordered lists, code blocks,
 * blockquotes, horizontal rules, and paragraphs with inline marks.
 */
export function markdownToTiptap(markdown: string): JSONContent {
  const lines = markdown.split("\n");
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (```)
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      content.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      content.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInlineMarks(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: parseInlineMarks(lines[i].replace(/^[-*]\s+/, "")),
            },
          ],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: parseInlineMarks(lines[i].replace(/^\d+\.\s+/, "")),
            },
          ],
        });
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      content.push({
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarks(quoteLines.join(" ")),
          },
        ],
      });
      continue;
    }

    // Regular paragraph
    content.push({
      type: "paragraph",
      content: parseInlineMarks(line),
    });
    i++;
  }

  return { type: "doc", content };
}

/**
 * Parse inline markdown marks: **bold**, *italic*, `code`, [links](url).
 */
function parseInlineMarks(text: string): JSONContent[] {
  const result: JSONContent[] = [];
  // Regex matches: **bold**, *italic*, `code`, [text](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      result.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      // **bold**
      result.push({ type: "text", marks: [{ type: "bold" }], text: match[2] });
    } else if (match[3]) {
      // *italic*
      result.push({ type: "text", marks: [{ type: "italic" }], text: match[3] });
    } else if (match[4]) {
      // `code`
      result.push({ type: "text", marks: [{ type: "code" }], text: match[4] });
    } else if (match[5] && match[6]) {
      // [text](url)
      result.push({
        type: "text",
        marks: [{ type: "link", attrs: { href: match[6], target: "_blank" } }],
        text: match[5],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    result.push({ type: "text", text: text.slice(lastIndex) });
  }

  return result.length > 0 ? result : [{ type: "text", text: text || " " }];
}

/**
 * Convert Tiptap JSON that contains markdown-in-paragraphs to proper Tiptap JSON.
 * Returns the original content if it's already properly structured.
 */
export function convertMarkdownContent(json: JSONContent): JSONContent {
  if (!isMarkdownInParagraphs(json)) return json;
  const markdown = extractFullText(json);
  return markdownToTiptap(markdown);
}
