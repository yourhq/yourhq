import type { JSONContent } from "novel";

export function tiptapToMarkdown(json: JSONContent): string {
  if (!json.content) return "";
  return json.content.map((node) => serializeNode(node)).join("\n\n");
}

function serializeNode(node: JSONContent): string {
  switch (node.type) {
    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = "#".repeat(level);
      return `${prefix} ${serializeInline(node.content)}`;
    }

    case "paragraph":
      return serializeInline(node.content);

    case "bulletList":
      return (
        node.content
          ?.map((item) => {
            const inner = serializeListItemContent(item);
            return `- ${inner}`;
          })
          .join("\n") ?? ""
      );

    case "orderedList":
      return (
        node.content
          ?.map((item, i) => {
            const inner = serializeListItemContent(item);
            return `${i + 1}. ${inner}`;
          })
          .join("\n") ?? ""
      );

    case "taskList":
      return (
        node.content
          ?.map((item) => {
            const checked = item.attrs?.checked ? "x" : " ";
            const inner = serializeListItemContent(item);
            return `- [${checked}] ${inner}`;
          })
          .join("\n") ?? ""
      );

    case "blockquote":
      return (
        node.content
          ?.map((child) => `> ${serializeNode(child)}`)
          .join("\n") ?? ""
      );

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = node.content
        ?.map((c) => c.text ?? "")
        .join("") ?? "";
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case "horizontalRule":
      return "---";

    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      return `![${alt}](${src})`;
    }

    default:
      return serializeInline(node.content);
  }
}

function serializeListItemContent(item: JSONContent): string {
  if (!item.content) return "";
  return item.content.map((child) => serializeNode(child)).join("\n");
}

function serializeInline(content?: JSONContent[]): string {
  if (!content) return "";
  return content
    .map((node) => {
      if (node.type !== "text") {
        if (node.type === "hardBreak") return "\n";
        return "";
      }
      let text = node.text ?? "";
      if (!node.marks) return text;

      for (const mark of node.marks) {
        switch (mark.type) {
          case "bold":
            text = `**${text}**`;
            break;
          case "italic":
            text = `*${text}*`;
            break;
          case "code":
            text = `\`${text}\``;
            break;
          case "strike":
            text = `~~${text}~~`;
            break;
          case "underline":
            break;
          case "link": {
            const href = (mark.attrs?.href as string) ?? "";
            text = `[${text}](${href})`;
            break;
          }
        }
      }
      return text;
    })
    .join("");
}
