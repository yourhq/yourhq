import { describe, test, expect } from "vitest";
import {
  buildFolderTree,
  collectDescendantIds,
  getFolderPath,
  isDescendant,
  flattenFolderTree,
  computeDescendantCounts,
  type TreeFolder,
} from "@/lib/shared/folder-tree";

function folder(
  id: string,
  parent_id: string | null,
  name: string,
  sort_order = 0
): TreeFolder {
  return { id, parent_id, name, sort_order };
}

describe("buildFolderTree", () => {
  test("returns empty array for empty input", () => {
    expect(buildFolderTree([])).toEqual([]);
  });

  test("builds a flat list of roots when no parents", () => {
    const folders = [
      folder("a", null, "Alpha", 2),
      folder("b", null, "Beta", 1),
    ];
    const tree = buildFolderTree(folders);
    expect(tree.map((f) => f.id)).toEqual(["b", "a"]);
  });

  test("nests children under parents and sorts recursively", () => {
    const folders = [
      folder("root", null, "Root"),
      folder("c2", "root", "Charlie", 2),
      folder("c1", "root", "Alpha", 1),
      folder("gc", "c1", "Grandchild", 0),
    ];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children![0].id).toBe("c1");
    expect(tree[0].children![0].children![0].id).toBe("gc");
    expect(tree[0].children![1].id).toBe("c2");
  });

  test("promotes orphans (missing parent) to roots", () => {
    const folders = [
      folder("orphan", "nonexistent", "Orphan"),
      folder("root", null, "Root"),
    ];
    const tree = buildFolderTree(folders);
    expect(tree).toHaveLength(2);
  });

  test("sorts by sort_order then name", () => {
    const folders = [
      folder("a", null, "Zebra", 1),
      folder("b", null, "Apple", 1),
      folder("c", null, "Mango", 0),
    ];
    const tree = buildFolderTree(folders);
    expect(tree.map((f) => f.id)).toEqual(["c", "b", "a"]);
  });
});

describe("collectDescendantIds", () => {
  const folders = [
    folder("root", null, "Root"),
    folder("a", "root", "A"),
    folder("b", "root", "B"),
    folder("a1", "a", "A1"),
    folder("a2", "a", "A2"),
  ];

  test("includes the root itself", () => {
    const ids = collectDescendantIds(folders, "root");
    expect(ids).toContain("root");
  });

  test("collects all descendants recursively", () => {
    const ids = collectDescendantIds(folders, "root");
    expect(new Set(ids)).toEqual(new Set(["root", "a", "b", "a1", "a2"]));
  });

  test("returns only the node for a leaf", () => {
    const ids = collectDescendantIds(folders, "a1");
    expect(ids).toEqual(["a1"]);
  });

  test("returns subtree for intermediate node", () => {
    const ids = collectDescendantIds(folders, "a");
    expect(new Set(ids)).toEqual(new Set(["a", "a1", "a2"]));
  });
});

describe("getFolderPath", () => {
  const folders = [
    folder("root", null, "Root"),
    folder("child", "root", "Child"),
    folder("grandchild", "child", "Grandchild"),
  ];

  test("returns empty array for null id", () => {
    expect(getFolderPath(folders, null)).toEqual([]);
  });

  test("returns empty array for undefined id", () => {
    expect(getFolderPath(folders, undefined)).toEqual([]);
  });

  test("returns single element for root", () => {
    const path = getFolderPath(folders, "root");
    expect(path.map((f) => f.id)).toEqual(["root"]);
  });

  test("returns full path from root to leaf", () => {
    const path = getFolderPath(folders, "grandchild");
    expect(path.map((f) => f.id)).toEqual(["root", "child", "grandchild"]);
  });

  test("handles cycles by stopping via seen set", () => {
    const cyclicFolders = [
      folder("a", "b", "A"),
      folder("b", "a", "B"),
    ];
    const path = getFolderPath(cyclicFolders, "a");
    expect(path.length).toBeLessThanOrEqual(2);
    expect(path.map((f) => f.id)).toContain("a");
  });
});

describe("isDescendant", () => {
  const folders = [
    folder("root", null, "Root"),
    folder("child", "root", "Child"),
    folder("grandchild", "child", "Grandchild"),
    folder("other", null, "Other"),
  ];

  test("returns true when ancestor equals candidate", () => {
    expect(isDescendant(folders, "root", "root")).toBe(true);
  });

  test("returns true for direct child", () => {
    expect(isDescendant(folders, "root", "child")).toBe(true);
  });

  test("returns true for deep descendant", () => {
    expect(isDescendant(folders, "root", "grandchild")).toBe(true);
  });

  test("returns false for unrelated node", () => {
    expect(isDescendant(folders, "root", "other")).toBe(false);
  });

  test("returns false for ancestor as candidate", () => {
    expect(isDescendant(folders, "child", "root")).toBe(false);
  });
});

describe("flattenFolderTree", () => {
  test("returns empty for empty tree", () => {
    expect(flattenFolderTree([])).toEqual([]);
  });

  test("flattens with correct depths", () => {
    const tree = buildFolderTree([
      folder("root", null, "Root"),
      folder("child", "root", "Child"),
      folder("grandchild", "child", "Grandchild"),
    ]);
    const flat = flattenFolderTree(tree);
    expect(flat.map((f) => ({ id: f.folder.id, depth: f.depth }))).toEqual([
      { id: "root", depth: 0 },
      { id: "child", depth: 1 },
      { id: "grandchild", depth: 2 },
    ]);
  });

  test("handles multiple roots", () => {
    const tree = buildFolderTree([
      folder("a", null, "A", 0),
      folder("b", null, "B", 1),
    ]);
    const flat = flattenFolderTree(tree);
    expect(flat).toHaveLength(2);
    expect(flat.every((f) => f.depth === 0)).toBe(true);
  });
});

describe("computeDescendantCounts", () => {
  const folders = [
    folder("root", null, "Root"),
    folder("child", "root", "Child"),
    folder("grandchild", "child", "Grandchild"),
  ];

  test("returns empty for no items", () => {
    expect(computeDescendantCounts(folders, [])).toEqual({});
  });

  test("counts bubble up to ancestors", () => {
    const counts = computeDescendantCounts(folders, ["grandchild"]);
    expect(counts).toEqual({ grandchild: 1, child: 1, root: 1 });
  });

  test("accumulates multiple items", () => {
    const counts = computeDescendantCounts(folders, [
      "grandchild",
      "child",
    ]);
    expect(counts).toEqual({ grandchild: 1, child: 2, root: 2 });
  });

  test("skips null and undefined folder ids", () => {
    const counts = computeDescendantCounts(folders, [null, undefined, "child"]);
    expect(counts).toEqual({ child: 1, root: 1 });
  });

  test("handles items in unknown folders", () => {
    const counts = computeDescendantCounts(folders, ["unknown"]);
    expect(counts).toEqual({ unknown: 1 });
  });

  test("handles cycles without infinite loop", () => {
    const cyclicFolders = [
      folder("a", "b", "A"),
      folder("b", "a", "B"),
    ];
    const counts = computeDescendantCounts(cyclicFolders, ["a"]);
    expect(counts["a"]).toBe(1);
    expect(counts["b"]).toBe(1);
  });
});
