export interface TreeFolder {
  id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  children?: TreeFolder[];
}

export function buildFolderTree<T extends TreeFolder>(folders: T[]): T[] {
  const byId = new Map<string, T>();
  for (const f of folders) {
    byId.set(f.id, { ...f, children: [] } as T);
  }
  const roots: T[] = [];
  for (const f of byId.values()) {
    if (f.parent_id && byId.has(f.parent_id)) {
      (byId.get(f.parent_id)!.children as T[]).push(f);
    } else {
      roots.push(f);
    }
  }
  const sortRec = (nodes: T[]) => {
    nodes.sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    for (const n of nodes) {
      if (n.children?.length) sortRec(n.children as T[]);
    }
  };
  sortRec(roots);
  return roots;
}

export function collectDescendantIds<T extends TreeFolder>(
  folders: T[],
  rootId: string
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const f of folders) {
    if (f.parent_id) {
      const list = childrenByParent.get(f.parent_id) ?? [];
      list.push(f.id);
      childrenByParent.set(f.parent_id, list);
    }
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    result.push(id);
    const kids = childrenByParent.get(id);
    if (kids) stack.push(...kids);
  }
  return result;
}

export function getFolderPath<T extends TreeFolder>(
  folders: T[],
  id: string | null | undefined
): T[] {
  if (!id) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: T[] = [];
  let cursor: T | undefined = byId.get(id);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return path;
}

export function isDescendant<T extends TreeFolder>(
  folders: T[],
  ancestorId: string,
  candidateId: string
): boolean {
  if (ancestorId === candidateId) return true;
  const descendants = new Set(collectDescendantIds(folders, ancestorId));
  return descendants.has(candidateId);
}

export interface FlatFolder<T extends TreeFolder> {
  folder: T;
  depth: number;
}

export function flattenFolderTree<T extends TreeFolder>(
  tree: T[],
  depth = 0
): FlatFolder<T>[] {
  const out: FlatFolder<T>[] = [];
  for (const f of tree) {
    out.push({ folder: f, depth });
    if (f.children?.length) {
      out.push(...flattenFolderTree(f.children as T[], depth + 1));
    }
  }
  return out;
}

/**
 * Given item -> folder_id map and the folder list, returns
 * total descendant item counts keyed by folder id.
 */
export function computeDescendantCounts<T extends TreeFolder>(
  folders: T[],
  itemFolderIds: (string | null | undefined)[]
): Record<string, number> {
  const parentOf = new Map<string, string | null>();
  for (const f of folders) parentOf.set(f.id, f.parent_id);

  const counts: Record<string, number> = {};
  for (const id of itemFolderIds) {
    if (!id) continue;
    let cursor: string | null | undefined = id;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      counts[cursor] = (counts[cursor] ?? 0) + 1;
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return counts;
}
