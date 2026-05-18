import { describe, test, expect } from "vitest";
import {
  buildFolderTree,
  collectDescendantIds,
  getFolderPath,
  isDescendant,
  flattenFolderTree,
  computeDescendantCounts,
} from "@/lib/knowledge/tree";

function folder(id: string, parent_id: string | null, name: string, sort_order = 0) {
  return { id, parent_id, name, sort_order };
}

const FLAT = [
  folder("root", null, "Root", 0),
  folder("child1", "root", "Child 1", 0),
  folder("child2", "root", "Child 2", 1),
  folder("grandchild", "child1", "Grandchild", 0),
];

describe("buildFolderTree", () => {
  test("organizes flat list into tree", () => {
    const tree = buildFolderTree(FLAT);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children).toHaveLength(2);
  });

  test("sorts by sort_order then name", () => {
    const folders = [
      folder("b", null, "Banana", 1),
      folder("a", null, "Apple", 0),
      folder("c", null, "Cherry", 1),
    ];
    const tree = buildFolderTree(folders);
    expect(tree.map((f) => f.name)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  test("handles empty input", () => {
    expect(buildFolderTree([])).toEqual([]);
  });

  test("orphaned nodes become roots", () => {
    const folders = [
      folder("orphan", "nonexistent", "Orphan", 0),
    ];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("orphan");
  });
});

describe("collectDescendantIds", () => {
  test("returns root and all descendants", () => {
    const ids = collectDescendantIds(FLAT, "root");
    expect(new Set(ids)).toEqual(new Set(["root", "child1", "child2", "grandchild"]));
  });

  test("returns only self for leaf node", () => {
    const ids = collectDescendantIds(FLAT, "grandchild");
    expect(ids).toEqual(["grandchild"]);
  });

  test("subtree collection", () => {
    const ids = collectDescendantIds(FLAT, "child1");
    expect(new Set(ids)).toEqual(new Set(["child1", "grandchild"]));
  });
});

describe("getFolderPath", () => {
  test("returns path from root to target", () => {
    const path = getFolderPath(FLAT, "grandchild");
    expect(path.map((f) => f.id)).toEqual(["root", "child1", "grandchild"]);
  });

  test("returns single element for root", () => {
    const path = getFolderPath(FLAT, "root");
    expect(path.map((f) => f.id)).toEqual(["root"]);
  });

  test("returns empty for null/undefined id", () => {
    expect(getFolderPath(FLAT, null)).toEqual([]);
    expect(getFolderPath(FLAT, undefined)).toEqual([]);
  });

  test("returns empty for nonexistent id", () => {
    expect(getFolderPath(FLAT, "doesnt-exist")).toEqual([]);
  });
});

describe("isDescendant", () => {
  test("returns true for self", () => {
    expect(isDescendant(FLAT, "root", "root")).toBe(true);
  });

  test("returns true for direct child", () => {
    expect(isDescendant(FLAT, "root", "child1")).toBe(true);
  });

  test("returns true for grandchild", () => {
    expect(isDescendant(FLAT, "root", "grandchild")).toBe(true);
  });

  test("returns false for non-descendant", () => {
    expect(isDescendant(FLAT, "child2", "grandchild")).toBe(false);
  });

  test("returns false for ancestor (not descendant)", () => {
    expect(isDescendant(FLAT, "child1", "root")).toBe(false);
  });
});

describe("flattenFolderTree", () => {
  test("flattens built tree with correct depths", () => {
    const tree = buildFolderTree(FLAT);
    const flat = flattenFolderTree(tree);
    expect(flat).toHaveLength(4);
    expect(flat[0].folder.id).toBe("root");
    expect(flat[0].depth).toBe(0);

    const grandchild = flat.find((f) => f.folder.id === "grandchild");
    expect(grandchild?.depth).toBe(2);
  });

  test("handles empty tree", () => {
    expect(flattenFolderTree([])).toEqual([]);
  });
});

describe("computeDescendantCounts", () => {
  test("counts bubble up to ancestors", () => {
    const counts = computeDescendantCounts(FLAT, ["grandchild", "child2"]);
    expect(counts["root"]).toBe(2);
    expect(counts["child1"]).toBe(1);
    expect(counts["grandchild"]).toBe(1);
    expect(counts["child2"]).toBe(1);
  });

  test("skips null/undefined folder IDs", () => {
    const counts = computeDescendantCounts(FLAT, [null, undefined, "child1"]);
    expect(counts["child1"]).toBe(1);
    expect(counts["root"]).toBe(1);
  });

  test("returns empty for no items", () => {
    expect(computeDescendantCounts(FLAT, [])).toEqual({});
  });
});
