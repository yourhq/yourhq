// GitHub file system types for agent file management

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
 * Convert a flat list of GitHub tree entries into a nested file tree.
 * Sorts folders first, then files, alphabetically within each group.
 */
export function buildFileTree(entries: GitHubTreeEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const folderMap = new Map<string, FileTreeNode>();

  // Sort entries so parent folders are processed before children
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of sorted) {
    const parts = entry.path.split("/");
    const name = parts[parts.length - 1];

    const node: FileTreeNode = {
      name,
      path: entry.path,
      type: entry.type === "tree" ? "folder" : "file",
      ...(entry.type === "blob" ? { sha: entry.sha } : {}),
      ...(entry.type === "tree" ? { children: [] } : {}),
    };

    if (entry.type === "tree") {
      folderMap.set(entry.path, node);
    }

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = folderMap.get(parentPath);
      if (parent?.children) {
        parent.children.push(node);
      }
    }
  }

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
