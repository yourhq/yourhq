const STORAGE_KEY = "hq-recent-items";
const MAX_ITEMS = 12;

export interface RecentItem {
  id: string;
  type: "knowledge" | "task" | "contact" | "collection" | "collection_record" | "agent" | "routine";
  title: string;
  subtitle?: string;
  href: string;
  icon?: string;
  color?: string;
  timestamp: number;
}

export function getRecentItems(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
}

export function addRecentItem(item: Omit<RecentItem, "timestamp">) {
  if (typeof window === "undefined") return;
  try {
    const items = getRecentItems().filter((i) => i.id !== item.id);
    items.unshift({ ...item, timestamp: Date.now() });
    if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}
