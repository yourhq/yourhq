import fs from "node:fs";
import path from "node:path";

const DOCS_ROOT = path.resolve(process.cwd());
const CONFIG_PATH = path.join(DOCS_ROOT, "docs.json");
const OUTPUT_PATH = path.join(DOCS_ROOT, "llms-full.txt");
const BASE_URL = "https://docs.yourhq.ai";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectPages(node, out = []) {
  if (!node) return out;
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectPages(item, out);
    return out;
  }
  if (typeof node === "object") {
    if (node.pages) collectPages(node.pages, out);
    if (node.groups) collectPages(node.groups, out);
    if (node.tabs) collectPages(node.tabs, out);
  }
  return out;
}

function pagePath(slug) {
  const mdx = path.join(DOCS_ROOT, `${slug}.mdx`);
  if (fs.existsSync(mdx)) return mdx;
  const md = path.join(DOCS_ROOT, `${slug}.md`);
  if (fs.existsSync(md)) return md;
  throw new Error(`Missing docs page for navigation slug: ${slug}`);
}

function titleFromSlug(slug) {
  const base = slug.split("/").pop() ?? slug;
  return base
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractFrontmatter(raw) {
  if (!raw.startsWith("---\n")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { data: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const data = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return { data, body: raw.slice(end + "\n---".length).trimStart() };
}

function normalizeMdx(raw) {
  return raw
    // Remove JSX comments.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    // Preserve the labels from common Mintlify components so the generated
    // full-text file remains useful without the visual UI.
    .replace(/<Card\s+([^>]*)>/g, (_, attrs) => {
      const title = attrs.match(/\btitle=(["'])(.*?)\1/)?.[2];
      return title ? `- **${title}**: ` : "- ";
    })
    .replace(/<\/Card>/g, "\n")
    .replace(/<Step\s+([^>]*)>/g, (_, attrs) => {
      const title = attrs.match(/\btitle=(["'])(.*?)\1/)?.[2];
      return title ? `\n### ${title}\n` : "\n";
    })
    .replace(/<\/Step>/g, "\n")
    .replace(/<(Info|Tip|Warning|Note)[^>]*>/g, "\n> ")
    .replace(/<\/(Info|Tip|Warning|Note)>/g, "\n")
    // Keep simple component contents readable while removing remaining tags.
    .replace(/<\/?(CardGroup|Steps|Accordion|AccordionGroup|Tabs|Tab)[^>]*>/g, "")
    // Drop self-closing JSX tags that are visual-only.
    .replace(/<([A-Z][A-Za-z0-9]*)[^>]*\/>/g, "")
    // Remove any remaining simple HTML/JSX tags.
    .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^>]*)?>/g, "")
    // Collapse excessive blank lines.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageUrl(slug) {
  return `${BASE_URL}/${slug === "index" ? "" : slug}`.replace(/\/$/, "");
}

const config = readJson(CONFIG_PATH);
const slugs = [...new Set(collectPages(config.navigation))];

const sections = [];
sections.push(`# HQ Documentation`);
sections.push(`> Complete Markdown snapshot of the HQ documentation for AI assistants and search/retrieval tools.`);
sections.push(``);
sections.push(`Generated from the Mintlify source in \`docs-site/\`.`);
sections.push(``);
sections.push(`Canonical documentation: ${BASE_URL}`);
sections.push(`Repository: https://github.com/yourhq/yourhq`);
sections.push(``);

for (const slug of slugs) {
  const filePath = pagePath(slug);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, body } = extractFrontmatter(raw);
  const title = data.title || titleFromSlug(slug);
  const description = data.description ? `\n\n> ${data.description}` : "";
  const content = normalizeMdx(body);
  sections.push(`---`);
  sections.push(``);
  sections.push(`# ${title}`);
  sections.push(``);
  sections.push(`Source: ${pageUrl(slug)}${description}`);
  sections.push(``);
  sections.push(content);
  sections.push(``);
}

fs.writeFileSync(OUTPUT_PATH, `${sections.join("\n").trim()}\n`, "utf8");
console.log(`Wrote ${path.relative(DOCS_ROOT, OUTPUT_PATH)} from ${slugs.length} pages.`);
