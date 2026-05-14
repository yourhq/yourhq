import { describe, test, expect, vi, beforeEach } from "vitest";
import { getRecentItems, addRecentItem, type RecentItem } from "@/lib/search/recent-items";

const STORAGE_KEY = "hq-recent-items";

describe("recent-items", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key: string) => store[key] ?? null
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      (key: string, value: string) => {
        store[key] = value;
      }
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(
      (key: string) => {
        delete store[key];
      }
    );
  });

  describe("getRecentItems", () => {
    test("returns empty array when storage is empty", () => {
      expect(getRecentItems()).toEqual([]);
    });

    test("returns parsed items from storage", () => {
      const items: RecentItem[] = [
        {
          id: "1",
          type: "task",
          title: "Test",
          href: "/task/1",
          timestamp: 1000,
        },
      ];
      store[STORAGE_KEY] = JSON.stringify(items);
      expect(getRecentItems()).toEqual(items);
    });

    test("returns empty array on invalid JSON", () => {
      store[STORAGE_KEY] = "not-json";
      expect(getRecentItems()).toEqual([]);
    });
  });

  describe("addRecentItem", () => {
    test("adds item to empty storage", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      addRecentItem({
        id: "1",
        type: "contact",
        title: "Alice",
        href: "/contacts/1",
      });
      const stored = JSON.parse(store[STORAGE_KEY]);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("1");
      expect(stored[0].timestamp).toBe(5000);
    });

    test("prepends new item and deduplicates by id", () => {
      const existing: RecentItem[] = [
        { id: "1", type: "task", title: "Old", href: "/t/1", timestamp: 1000 },
        { id: "2", type: "task", title: "Other", href: "/t/2", timestamp: 900 },
      ];
      store[STORAGE_KEY] = JSON.stringify(existing);
      vi.spyOn(Date, "now").mockReturnValue(2000);

      addRecentItem({ id: "1", type: "task", title: "Updated", href: "/t/1" });

      const stored = JSON.parse(store[STORAGE_KEY]);
      expect(stored).toHaveLength(2);
      expect(stored[0].id).toBe("1");
      expect(stored[0].title).toBe("Updated");
      expect(stored[0].timestamp).toBe(2000);
      expect(stored[1].id).toBe("2");
    });

    test("caps at 12 items", () => {
      const existing: RecentItem[] = Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        type: "task" as const,
        title: `Task ${i}`,
        href: `/t/${i}`,
        timestamp: 1000 - i,
      }));
      store[STORAGE_KEY] = JSON.stringify(existing);
      vi.spyOn(Date, "now").mockReturnValue(2000);

      addRecentItem({
        id: "new",
        type: "agent",
        title: "New Agent",
        href: "/agents/new",
      });

      const stored = JSON.parse(store[STORAGE_KEY]);
      expect(stored).toHaveLength(12);
      expect(stored[0].id).toBe("new");
      expect(stored.find((i: RecentItem) => i.id === "11")).toBeUndefined();
    });
  });
});
