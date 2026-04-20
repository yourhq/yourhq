/**
 * Convert a markdown filename into a human-readable document title.
 * Strips .md/.markdown extension, replaces hyphens/underscores with spaces,
 * and applies title case.
 */
export function filenameToTitle(filename: string): string {
  const stripped = filename.replace(/\.(md|markdown)$/i, "");
  const spaced = stripped.replace(/[-_]+/g, " ").trim();
  if (!spaced) return "Untitled";
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}
