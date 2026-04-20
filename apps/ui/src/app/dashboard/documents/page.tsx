"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SharedFolderTree } from "@/components/shared/folder-tree";
import { computeDescendantCounts } from "@/lib/shared/folder-tree";
import type { DocumentFolder } from "@/lib/documents/types";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentCreateDialog } from "@/components/documents/document-create-dialog";
import { useDocuments } from "@/hooks/use-documents";
import { useAgentsList } from "@/hooks/use-agents-list";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DocumentGrid } from "@/components/documents/document-grid";
import { Plus, Search, FileText, Archive, Upload, LayoutList, LayoutGrid } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { MarkdownDropZone } from "@/components/documents/markdown-drop-zone";
import { markdownToTiptap } from "@/lib/documents/markdown-to-tiptap";
import { filenameToTitle } from "@/lib/documents/import-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DocViewMode = "list" | "grid";
const DOCS_VIEW_KEY = "documents-view-mode";

function DocumentsContent() {
  const docs = useDocuments();
  const { agents, agentMap } = useAgentsList();
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<DocViewMode>("list");

  useEffect(() => {
    const saved = localStorage.getItem(DOCS_VIEW_KEY) as DocViewMode | null;
    if (saved && saved !== viewMode) setViewMode(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const changeViewMode = (mode: DocViewMode) => {
    setViewMode(mode);
    localStorage.setItem(DOCS_VIEW_KEY, mode);
  };

  const handleImportFiles = useCallback(
    async (files: File[]) => {
      const mdFiles = files.filter((f) => /\.(md|markdown)$/i.test(f.name));
      if (mdFiles.length === 0) {
        toast.error("No .md files found");
        return;
      }

      const items = await Promise.all(
        mdFiles.map(async (file) => {
          const markdown = await file.text();
          const tiptapJson = markdownToTiptap(markdown);
          return {
            title: filenameToTitle(file.name),
            content: JSON.stringify(tiptapJson),
          };
        })
      );

      const targetFolder =
        docs.filters.folderId !== "all" ? docs.filters.folderId : null;
      const count = await docs.actions.importDocuments(items, targetFolder);

      if (count > 0) {
        toast.success(`Imported ${count} document${count > 1 ? "s" : ""}`);
      } else {
        toast.error("Failed to import documents");
      }
    },
    [docs.filters.folderId, docs.actions]
  );

  const folderCounts = useMemo(
    () =>
      computeDescendantCounts(
        docs.folders,
        docs.documents.map((d) => d.folder_id)
      ),
    [docs.folders, docs.documents]
  );

  async function handleCreate(title: string, folderId?: string | null) {
    const doc = await docs.actions.createDocument(title, folderId);
    if (doc) {
      router.push(`/dashboard/documents/${doc.id}`);
      return doc;
    }
    return null;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as
      | { type: "folder"; folderId: string }
      | { type: "document"; documentId: string }
      | undefined;
    const overData = over.data.current as
      | { type: "folder"; folderId: string | null }
      | undefined;
    if (!activeData || !overData || overData.type !== "folder") return;

    if (activeData.type === "folder") {
      if (activeData.folderId === overData.folderId) return;
      docs.actions.moveFolder(activeData.folderId, overData.folderId);
    } else if (activeData.type === "document") {
      docs.actions.moveDocument(activeData.documentId, overData.folderId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<FileText className="h-4 w-4" />}
        title="Documents"
        description="Knowledge base, SOPs, and context for agents."
        secondaryActions={
          !docs.filters.showArchived && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleImportFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }
                }}
              />
            </>
          )
        }
        primaryAction={
          !docs.filters.showArchived && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New document
            </Button>
          )
        }
      />

      <MarkdownDropZone
        onImport={handleImportFiles}
        disabled={docs.filters.showArchived}
      >
        {/* Folder sidebar */}
        <aside className="hidden w-[200px] shrink-0 border-r border-border/60 px-3 py-4 lg:block">
          <SharedFolderTree<DocumentFolder>
            folders={docs.folders}
            loading={docs.loading}
            selectedId={docs.filters.folderId}
            onSelect={docs.filters.setFolderId}
            onCreateFolder={docs.actions.createFolder}
            onRenameFolder={docs.actions.renameFolder}
            onDeleteFolder={(id) => setDeleteFolderId(id)}
            onUpdateIcon={docs.actions.updateFolderIcon}
            counts={folderCounts}
            getIcon={(f) => f.icon}
            allLabel="All Documents"
            allIcon={<FileText className="h-3.5 w-3.5" />}
            expandedStorageKey="documents.expandedFolders"
            dndNamespace="documents"
          />
        </aside>

        {/* Main document area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Toolbar */}
          <div className="shrink-0 border-b border-border/60 px-5 py-3">
            <TooltipProvider>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-[320px]">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={docs.filters.search}
                    onChange={(e) => docs.filters.setSearch(e.target.value)}
                    placeholder="Search documents…"
                    className="h-8 pl-8 text-[13px]"
                  />
                </div>

                <Select
                  value={docs.filters.bootFilter}
                  onValueChange={docs.filters.setBootFilter}
                >
                  <SelectTrigger
                    size="sm"
                    className={cn(
                      "min-w-[160px] text-[12px]",
                      docs.filters.bootFilter !== "all" &&
                        "border-foreground/30 bg-accent/50"
                    )}
                  >
                    <SelectValue placeholder="Context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All documents</SelectItem>
                    <SelectItem value="boot:all">Context: all agents</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.slug} value={`boot:${a.slug}`}>
                        Context: {a.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="boot:none">No context tags</SelectItem>
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={
                        docs.filters.showArchived ? "secondary" : "outline"
                      }
                      size="icon-sm"
                      onClick={() =>
                        docs.filters.setShowArchived(!docs.filters.showArchived)
                      }
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {docs.filters.showArchived
                      ? "Hide archived"
                      : "Show archived"}
                  </TooltipContent>
                </Tooltip>

                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(v) => v && changeViewMode(v as DocViewMode)}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem
                    value="list"
                    title="List view"
                    className="h-8 w-8 p-0"
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="grid"
                    title="Grid view"
                    className="h-8 w-8 p-0"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </TooltipProvider>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-5">
            {viewMode === "list" ? (
              <DocumentList
                documents={docs.documents}
                loading={docs.loading}
                hasFilters={
                  docs.filters.folderId !== "all" ||
                  !!docs.filters.search ||
                  docs.filters.bootFilter !== "all"
                }
                onArchive={docs.actions.archiveDocument}
                onRestore={docs.actions.restoreDocument}
                onDelete={setDeleteId}
                showArchived={docs.filters.showArchived}
                agentMap={agentMap}
              />
            ) : (
              <DocumentGrid
                documents={docs.documents}
                loading={docs.loading}
                hasFilters={
                  docs.filters.folderId !== "all" ||
                  !!docs.filters.search ||
                  docs.filters.bootFilter !== "all"
                }
                onArchive={docs.actions.archiveDocument}
                onRestore={docs.actions.restoreDocument}
                onDelete={setDeleteId}
                showArchived={docs.filters.showArchived}
                agentMap={agentMap}
              />
            )}
          </div>
        </div>
      </MarkdownDropZone>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onConfirm={() => {
          if (deleteId) docs.actions.deleteDocument(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
        title="Delete document permanently?"
        description="This action cannot be undone. This document will be permanently removed."
      />

      <ConfirmDeleteDialog
        open={!!deleteFolderId}
        onConfirm={() => {
          if (deleteFolderId) docs.actions.deleteFolder(deleteFolderId);
          setDeleteFolderId(null);
        }}
        onCancel={() => setDeleteFolderId(null)}
        title="Delete folder?"
        description="Subfolders will also be deleted. Documents inside will be moved to the root (not deleted)."
      />

      <DocumentCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        folders={docs.folders}
        defaultFolderId={
          docs.filters.folderId !== "all" ? docs.filters.folderId : null
        }
        onCreate={handleCreate}
      />
    </div>
    </DndContext>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsContent />
    </Suspense>
  );
}
