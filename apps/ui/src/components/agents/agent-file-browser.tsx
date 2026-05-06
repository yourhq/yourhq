"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import type { FileTreeNode, GitHubTreeEntry } from "@/lib/agent-repo/types";
import { buildFileTree } from "@/lib/agent-repo/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgentFileTree } from "./agent-file-tree";
import { AgentFileEditor } from "./agent-file-editor";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";

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
  const [fullscreen, setFullscreen] = useState(false);
  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  const mobile = useIsMobile();

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

  // Esc exits fullscreen. Don't capture when an input/textarea has
  // focus (e.g. user is typing in the editor) — only when focus is
  // outside an editable surface.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable;
      if (isEditable) return;
      setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

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
    if (mobile) setMobileShowEditor(true);

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

  if (mobile) {
    return (
      <div className="relative flex flex-col overflow-hidden border border-border/50 rounded-lg h-[calc(100vh-10rem)]">
        {mobileShowEditor && selectedPath ? (
          <>
            <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2 bg-card/30">
              <button
                type="button"
                onClick={() => setMobileShowEditor(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground truncate">{selectedPath}</span>
            </div>
            <div className="flex-1 min-h-0">
              <AgentFileEditor
                slug={slug}
                path={selectedPath}
                content={fileContent}
                sha={fileSha}
                onSaved={handleSaved}
                loading={fileLoading}
              />
            </div>
          </>
        ) : (
          <AgentFileTree
            tree={tree}
            selectedPath={selectedPath}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            loading={treeLoading}
          />
        )}

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

  return (
    <div
      className={cn(
        "relative flex overflow-hidden border border-border/50",
        fullscreen
          ? "fixed inset-0 z-50 rounded-none bg-background"
          : "h-[calc(100vh-12rem)] rounded-lg",
      )}
    >
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

      {/* Fullscreen toggle */}
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
        aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
      >
        {fullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>

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
