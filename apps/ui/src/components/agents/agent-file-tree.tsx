"use client";

import { useState } from "react";
import type { FileTreeNode } from "@/lib/agent-repo/types";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  FileText,
  FolderClosed,
  FolderOpen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgentFileTreeProps {
  tree: FileTreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => void;
  loading?: boolean;
}

export function AgentFileTree({
  tree,
  selectedPath,
  onSelectFile,
  onCreateFile,
  loading,
}: AgentFileTreeProps) {
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");

  function handleCreate() {
    let p = newPath.trim();
    if (!p) return;
    if (!p.endsWith(".md")) p += ".md";
    onCreateFile(p);
    setNewPath("");
    setCreating(false);
  }

  if (loading) {
    const widths = [75, 60, 90, 65, 80];
    return (
      <div className="space-y-1.5 p-2">
        {widths.map((w, i) => (
          <div
            key={i}
            className="h-6 rounded bg-muted/30 animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Files
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={() => setCreating(true)}
          title="New file"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* New file input */}
      {creating && (
        <div className="px-2 py-1.5 border-b border-border/50">
          <input
            autoFocus
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewPath("");
              }
            }}
            onBlur={() => {
              if (!newPath.trim()) {
                setCreating(false);
                setNewPath("");
              }
            }}
            placeholder="path/to/file.md"
            className="w-full bg-muted/50 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/50 border border-border/50 focus:outline-none focus:border-ring"
          />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-auto py-1">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <FileText className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">No files yet</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Create file
            </Button>
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = node.path === selectedPath;

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full text-left py-1 px-2 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground transition-colors"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform duration-150",
              expanded && "rotate-90"
            )}
          />
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          ) : (
            <FolderClosed className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "flex items-center gap-1.5 w-full text-left py-1 px-2 text-xs transition-colors",
        isSelected
          ? "bg-accent/40 text-foreground border-l-2 border-primary"
          : "text-muted-foreground hover:bg-accent/30 hover:text-foreground border-l-2 border-transparent"
      )}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
