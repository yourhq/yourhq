// Boot tag utilities — "boot:all" and "boot:{agent-slug}" tags
// control which documents agents auto-load at startup.

export const BOOT_PREFIX = "boot:";
export const BOOT_TAG_ALL = "boot:all";

export function isBootTag(tag: string): boolean {
  return tag.startsWith(BOOT_PREFIX);
}

export function getBootTags(tags: string[]): string[] {
  return tags.filter(isBootTag);
}

export function getRegularTags(tags: string[]): string[] {
  return tags.filter((t) => !isBootTag(t));
}

/** Extract the agent slug from a boot tag, or null for boot:all / non-boot tags */
export function parseBootSlug(tag: string): string | null {
  if (!isBootTag(tag) || tag === BOOT_TAG_ALL) return null;
  return tag.slice(BOOT_PREFIX.length);
}

/** Human-readable label for a boot tag using an agent slug→name map */
export function getBootLabel(
  tag: string,
  agentMap: Record<string, string>
): string {
  if (tag === BOOT_TAG_ALL) return "All agents";
  const slug = parseBootSlug(tag);
  if (!slug) return tag;
  return agentMap[slug] || slug;
}
