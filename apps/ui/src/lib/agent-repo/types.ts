// Shared tree-node shape for the agent file browser. Flat {path, type, sha}
// entries come from the gateway files-API; `buildFileTree` nests them into
// a UI-friendly tree. Names still carry the "GitHub" prefix for historical
// reasons — the shape is the same one GitHub's tree API returns.

export interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  sha?: string;
  children?: FileTreeNode[];
}

export interface GitHubFileContent {
  content: string;
  sha: string;
  path: string;
}

/**
 * Convert a flat list of tree entries (from GitHub or the gateway's
 * files-API) into a nested file tree. Folders are materialized either
 * from explicit `type: "tree"` entries or inferred from blob parent
 * paths so backends that only enumerate blobs still produce a correct
 * tree.
 */
export function buildFileTree(entries: GitHubTreeEntry[]): FileTreeNode[] {
  const folderMap = new Map<string, FileTreeNode>();

  const ensureFolder = (path: string): FileTreeNode => {
    const existing = folderMap.get(path);
    if (existing) return existing;
    const parts = path.split("/");
    const node: FileTreeNode = {
      name: parts[parts.length - 1],
      path,
      type: "folder",
      children: [],
    };
    folderMap.set(path, node);
    const parentPath = parts.slice(0, -1).join("/");
    if (parentPath) {
      ensureFolder(parentPath).children!.push(node);
    } else {
      // Defer root insertion; we collect roots at the end.
    }
    return node;
  };

  const root: FileTreeNode[] = [];
  const roots = new Set<FileTreeNode>();

  for (const entry of entries) {
    const parts = entry.path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const parent = parentPath ? ensureFolder(parentPath) : null;

    if (entry.type === "tree") {
      const folder = ensureFolder(entry.path);
      if (!parent) roots.add(folder);
    } else {
      const node: FileTreeNode = {
        name: parts[parts.length - 1],
        path: entry.path,
        type: "file",
        sha: entry.sha,
      };
      if (parent) {
        parent.children!.push(node);
      } else {
        roots.add(node);
      }
    }
  }

  // Root-level folders we inferred from blob paths.
  for (const node of folderMap.values()) {
    const parentPath = node.path.split("/").slice(0, -1).join("/");
    if (!parentPath) roots.add(node);
  }

  root.push(...roots);

  // Sort: folders first, then files, alphabetically within each group
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
    return nodes;
  };

  return sortNodes(root);
}
