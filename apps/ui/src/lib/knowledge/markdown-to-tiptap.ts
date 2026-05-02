import type { JSONContent } from "novel";

export function isMarkdownInParagraphs(json: JSONContent): boolean {
  if (json.type !== "doc" || !json.content?.length) return false;

  const paragraphs = json.content.filter(
    (n) => n.type === "paragraph" && n.content?.length
  );
  if (paragraphs.length === 0) return false;

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

export function markdownToTiptap(markdown: string): JSONContent {
  const lines = markdown.split("\n");
  const content: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      content.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      content.push({ type: "horizontalRule" });
      i++;
      continue;
    }

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

    content.push({
      type: "paragraph",
      content: parseInlineMarks(line),
    });
    i++;
  }

  return { type: "doc", content };
}

function parseInlineMarks(text: string): JSONContent[] {
  const result: JSONContent[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      result.push({ type: "text", marks: [{ type: "bold" }], text: match[2] });
    } else if (match[3]) {
      result.push({ type: "text", marks: [{ type: "italic" }], text: match[3] });
    } else if (match[4]) {
      result.push({ type: "text", marks: [{ type: "code" }], text: match[4] });
    } else if (match[5] && match[6]) {
      result.push({
        type: "text",
        marks: [{ type: "link", attrs: { href: match[6], target: "_blank" } }],
        text: match[5],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push({ type: "text", text: text.slice(lastIndex) });
  }

  return result.length > 0 ? result : [{ type: "text", text: text || " " }];
}

export function convertMarkdownContent(json: JSONContent): JSONContent {
  if (!isMarkdownInParagraphs(json)) return json;
  const markdown = extractFullText(json);
  return markdownToTiptap(markdown);
}
