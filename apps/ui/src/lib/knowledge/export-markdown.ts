import type { JSONContent } from "novel";
import { tiptapToMarkdown } from "./tiptap-to-markdown";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function downloadAsMarkdown(
  title: string,
  content: JSONContent | undefined,
  itemId: string
): void {
  const bodyMd = content ? tiptapToMarkdown(content) : "";
  const fullMd = title.trim() ? `# ${title.trim()}\n\n${bodyMd}` : bodyMd;

  const filename = title.trim()
    ? `${slugify(title)}.md`
    : `item-${itemId.slice(0, 8)}.md`;

  const blob = new Blob([fullMd], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
