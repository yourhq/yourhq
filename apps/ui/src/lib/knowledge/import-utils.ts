export function filenameToTitle(filename: string): string {
  const stripped = filename.replace(/\.(md|markdown|txt)$/i, "");
  const spaced = stripped.replace(/[-_]+/g, " ").trim();
  if (!spaced) return "Untitled";
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}
