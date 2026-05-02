"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SharedFolderTree } from "@/components/shared/folder-tree";
import { computeDescendantCounts } from "@/lib/shared/folder-tree";
import type { KnowledgeFolder, KnowledgeKind } from "@/lib/knowledge/types";
import { KnowledgeList } from "@/components/knowledge/knowledge-list";
import { KnowledgeGrid } from "@/components/knowledge/knowledge-grid";
import { KnowledgeCreateMenu } from "@/components/knowledge/knowledge-create-menu";
import { KnowledgeCreateDialog } from "@/components/knowledge/knowledge-create-dialog";
import { useKnowledge } from "@/hooks/use-knowledge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, Archive, LayoutList, LayoutGrid, BookOpen, Upload, FolderOpen, FileUp } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "grid";
const VIEW_KEY = "knowledge-view-mode";

function KnowledgeContent() {
  const k = useKnowledge();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState<KnowledgeKind | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY) as ViewMode | null;
    if (saved && saved !== viewMode) setViewMode(saved);
  }, []);

  function handleViewModeChange(value: string) {
    if (!value) return;
    setViewMode(value as ViewMode);
    localStorage.setItem(VIEW_KEY, value);
  }

  async function handleCreateSave(title: string, kind: KnowledgeKind) {
    const folderId = k.filters.folderId !== "all" ? k.filters.folderId : null;
    const item = await k.actions.createItem({ kind, title, folderId });
    setShowCreate(null);
    if (item) {
      router.push(`/dashboard/knowledge/${item.id}`);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    const folderId = k.filters.folderId !== "all" ? k.filters.folderId : null;
    const count = await k.actions.importFiles(Array.from(files), folderId);
    toast.success(`Imported ${count} file${count !== 1 ? "s" : ""}`);
    e.target.value = "";
  }

  const ACCEPTED_EXTENSIONS = ".md,.markdown,.txt,.pdf,.docx,.csv,.xlsx,.pptx,.png,.jpg,.jpeg,.gif,.webp";

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const extensions = ACCEPTED_EXTENSIONS.split(",");
    const accepted = files.filter((f) =>
      extensions.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (!accepted.length) return;

    const folderId = k.filters.folderId !== "all" ? k.filters.folderId : null;
    const count = await k.actions.importFiles(accepted, folderId);
    toast.success(`Imported ${count} file${count !== 1 ? "s" : ""}`);
  }

  const folderCounts = useMemo(
    () => computeDescendantCounts(k.folders, k.items.map((i) => i.folder_id)),
    [k.folders, k.items]
  );

  return (
    <div
      className="relative flex h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5 px-12 py-10">
            <FileUp className="h-10 w-10 text-primary/70" />
            <p className="text-sm font-medium text-primary/90">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Folder sidebar */}
      <div className="hidden lg:block w-[200px] border-r border-border/50 overflow-auto">
        <SharedFolderTree
          folders={k.folders}
          loading={k.loading}
          selectedId={k.filters.folderId}
          onSelect={k.filters.setFolderId}
          onCreateFolder={(name, parentId) => k.actions.createFolder(name, parentId ?? undefined)}
          onRenameFolder={k.actions.renameFolder}
          onDeleteFolder={(id) => setDeleteFolderId(id)}
          counts={folderCounts}
          getIcon={(f) => f.icon}
          getColor={(f) => f.color}
          allLabel="All Items"
          allIcon={<FolderOpen className="h-3.5 w-3.5" />}
          expandedStorageKey="knowledge-folders-expanded"
          dndNamespace="knowledge"
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <PageHeader
          title="Knowledge"
          description="Pages, playbooks, and files"
          primaryAction={
            <KnowledgeCreateMenu
              onCreatePage={() => setShowCreate("page")}
              onCreatePlaybook={() => setShowCreate("playbook")}
              onUploadFiles={() => fileInputRef.current?.click()}
            />
          }
        />

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={k.filters.search}
              onChange={(e) => k.filters.setSearch(e.target.value)}
              placeholder="Search..."
              className="h-7 pl-8 text-xs"
            />
          </div>

          <Select value={k.filters.kindFilter} onValueChange={k.filters.setKindFilter}>
            <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
              <SelectValue placeholder="All kinds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="page">Pages</SelectItem>
              <SelectItem value="playbook">Playbooks</SelectItem>
              <SelectItem value="file">Files</SelectItem>
              <SelectItem value="source">Sources</SelectItem>
            </SelectContent>
          </Select>

          <Select value={k.filters.scopeFilter} onValueChange={k.filters.setScopeFilter}>
            <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs">
              <SelectValue placeholder="All scopes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scopes</SelectItem>
              <SelectItem value="workspace">Workspace</SelectItem>
            </SelectContent>
          </Select>

          <button
            onClick={() => k.filters.setShowArchived(!k.filters.showArchived)}
            className={cn(
              "flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors",
              k.filters.showArchived
                ? "bg-amber-500/20 text-amber-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Archive className="h-3.5 w-3.5" />
            {k.filters.showArchived ? "Archived" : ""}
          </button>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={handleViewModeChange}
            className="ml-auto"
          >
            <ToggleGroupItem value="list" aria-label="List view" className="h-7 w-7 p-0">
              <LayoutList className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label="Grid view" className="h-7 w-7 p-0">
              <LayoutGrid className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Item list/grid */}
        <div className="flex-1 overflow-auto">
          {k.loading ? (
            <LoadingSkeleton variant="list" count={8} />
          ) : k.items.length === 0 && (k.filters.search || k.filters.kindFilter !== "all" || k.filters.folderId !== "all") ? (
            <EmptyState
              icon={BookOpen}
              title="No items match"
              description="Try adjusting your search or filters."
              variant="filtered"
              onClearFilters={() => {
                k.filters.setSearch("");
                k.filters.setKindFilter("all");
                k.filters.setFolderId("all");
              }}
            />
          ) : k.items.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={k.filters.showArchived ? "No archived items" : "No items yet"}
              description={
                k.filters.showArchived
                  ? "Archived items will appear here."
                  : "Create a page, playbook, or upload files to get started."
              }
            />
          ) : viewMode === "list" ? (
            <KnowledgeList
              items={k.items}
              onArchive={k.actions.archiveItem}
              onRestore={k.actions.restoreItem}
              onDelete={(id) => setDeleteId(id)}
              showArchived={k.filters.showArchived}
            />
          ) : (
            <KnowledgeGrid
              items={k.items}
              onArchive={k.actions.archiveItem}
              onRestore={k.actions.restoreItem}
              onDelete={(id) => setDeleteId(id)}
              showArchived={k.filters.showArchived}
            />
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileUpload}
        accept=".md,.markdown,.txt,.pdf,.docx,.csv,.xlsx,.pptx,.png,.jpg,.jpeg,.gif,.webp"
      />

      {/* Create dialog */}
      {showCreate && (
        <KnowledgeCreateDialog
          kind={showCreate}
          folderId={k.filters.folderId !== "all" ? k.filters.folderId : null}
          onSave={handleCreateSave}
          onCancel={() => setShowCreate(null)}
        />
      )}

      {/* Delete item confirmation */}
      <ConfirmDeleteDialog
        open={!!deleteId}
        title="Delete item?"
        description="This item will be permanently deleted."
        onConfirm={() => {
          if (deleteId) k.actions.deleteItem(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmDeleteDialog
        open={!!deleteFolderId}
        title="Delete folder?"
        description="Items in this folder will be moved to the root."
        onConfirm={() => {
          if (deleteFolderId) k.actions.deleteFolder(deleteFolderId);
          setDeleteFolderId(null);
        }}
        onCancel={() => setDeleteFolderId(null)}
      />
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense>
      <KnowledgeContent />
    </Suspense>
  );
}
