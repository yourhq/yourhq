"use client";

import { useCallback, useEffect, useState } from "react";
import type { FileTreeNode, GitHubTreeEntry } from "@/lib/agent-repo/types";
import { buildFileTree } from "@/lib/agent-repo/types";
import { AgentFileTree } from "./agent-file-tree";
import { AgentFileEditor } from "./agent-file-editor";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface AgentFileBrowserProps {
  slug: string;
}

export function AgentFileBrowser({ slug }: AgentFileBrowserProps) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileSha, setFileSha] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // Fetch file tree on mount
  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await fetch(`/api/agents/${slug}/files`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to load files");
        return;
      }
      const entries: GitHubTreeEntry[] = await res.json();
      setTree(buildFileTree(entries));
    } catch {
      toast.error("Failed to load files");
    } finally {
      setTreeLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Load file content when selecting a file
  async function handleSelectFile(path: string) {
    if (dirty) {
      setPendingPath(path);
      return;
    }
    await loadFile(path);
  }

  async function loadFile(path: string) {
    setSelectedPath(path);
    setFileContent(null);
    setFileSha(null);
    setDirty(false);
    setFileLoading(true);

    try {
      const res = await fetch(`/api/agents/${slug}/files/${path}`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to load file");
        return;
      }
      const data = await res.json();
      setFileContent(data.content);
      setFileSha(data.sha);
    } catch {
      toast.error("Failed to load file");
    } finally {
      setFileLoading(false);
    }
  }

  // Create a new file
  async function handleCreateFile(path: string) {
    try {
      const res = await fetch(`/api/agents/${slug}/files/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create file");
        return;
      }

      toast.success(`Created ${path}`);
      await fetchTree();
      handleSelectFile(path);
    } catch {
      toast.error("Failed to create file");
    }
  }

  // Handle save completion — update sha
  function handleSaved(newSha: string) {
    setFileSha(newSha);
    setDirty(false);
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] border border-border/50 rounded-lg overflow-hidden">
      {/* File tree sidebar */}
      <div className="w-[220px] shrink-0 border-r border-border/50 bg-card/30">
        <AgentFileTree
          tree={tree}
          selectedPath={selectedPath}
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateFile}
          loading={treeLoading}
        />
      </div>

      {/* Editor area */}
      <div className="flex-1 min-w-0">
        <AgentFileEditor
          slug={slug}
          path={selectedPath}
          content={fileContent}
          sha={fileSha}
          onSaved={handleSaved}
          loading={fileLoading}
        />
      </div>

      <ConfirmDialog
        open={pendingPath !== null}
        title="Discard unsaved changes?"
        description="You have unsaved edits in the current file. Switching files now will discard them."
        confirmLabel="Discard changes"
        tone="warning"
        onConfirm={async () => {
          if (pendingPath) await loadFile(pendingPath);
          setPendingPath(null);
        }}
        onCancel={() => setPendingPath(null)}
      />
    </div>
  );
}
