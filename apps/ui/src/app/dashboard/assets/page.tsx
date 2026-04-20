"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SharedFolderTree } from "@/components/shared/folder-tree";
import { computeDescendantCounts } from "@/lib/shared/folder-tree";
import type { AssetFolder } from "@/lib/assets/types";
import { AssetGrid } from "@/components/assets/asset-grid";
import { AssetList } from "@/components/assets/asset-list";
import { AssetForm } from "@/components/assets/asset-form";
import { AssetUpload } from "@/components/assets/asset-upload";
import { useAssets } from "@/hooks/use-assets";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { FileDropZone } from "@/components/shared/file-drop-zone";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Upload, FolderOpen, Archive, LayoutList, LayoutGrid } from "lucide-react";
import { toast } from "sonner";

type AssetViewMode = "list" | "grid";
const ASSETS_VIEW_KEY = "assets-view-mode";

function AssetsContent() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const assets = useAssets();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const targetFolder =
        assets.filters.folderId !== "all" ? assets.filters.folderId : null;
      const count = await assets.actions.importFiles(files, targetFolder);
      if (count > 0) {
        toast.success(`Imported ${count} file${count > 1 ? "s" : ""}`);
      } else {
        toast.error("Failed to import files");
      }
    },
    [assets.filters.folderId, assets.actions]
  );
  const [viewMode, setViewMode] = useState<AssetViewMode>("grid");

  useEffect(() => {
    const saved = localStorage.getItem(ASSETS_VIEW_KEY) as AssetViewMode | null;
    if (saved && saved !== viewMode) setViewMode(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  const changeViewMode = (mode: AssetViewMode) => {
    setViewMode(mode);
    localStorage.setItem(ASSETS_VIEW_KEY, mode);
  };

  const folderCounts = useMemo(
    () =>
      computeDescendantCounts(
        assets.folders,
        assets.assets.map((a) => a.folder_id)
      ),
    [assets.folders, assets.assets]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as
      | { type: "folder"; folderId: string }
      | { type: "asset"; assetId: string }
      | undefined;
    const overData = over.data.current as
      | { type: "folder"; folderId: string | null }
      | undefined;
    if (!activeData || !overData || overData.type !== "folder") return;

    if (activeData.type === "folder") {
      if (activeData.folderId === overData.folderId) return;
      assets.actions.moveFolder(activeData.folderId, overData.folderId);
    } else if (activeData.type === "asset") {
      assets.actions.moveAsset(activeData.assetId, overData.folderId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<FolderOpen className="h-4 w-4" />}
        title="Assets"
        description="Uploads, references, and generated artifacts."
        secondaryActions={
          !assets.filters.showArchived && (
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
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleImportFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={assets.form.openUploadForm}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload
              </Button>
            </>
          )
        }
        primaryAction={
          !assets.filters.showArchived && (
            <Button size="sm" onClick={assets.form.openCreateForm}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New asset
            </Button>
          )
        }
      />

      <FileDropZone
        onDrop={handleImportFiles}
        disabled={assets.filters.showArchived}
        label="Drop files to import"
        description="Files will be uploaded and added as assets"
      >
        {/* Folder sidebar */}
        <aside className="hidden w-[200px] shrink-0 border-r border-border/60 px-3 py-4 lg:block">
          <SharedFolderTree<AssetFolder>
            folders={assets.folders}
            loading={assets.loading}
            selectedId={assets.filters.folderId}
            onSelect={assets.filters.setFolderId}
            onCreateFolder={assets.actions.createFolder}
            onRenameFolder={assets.actions.renameFolder}
            onDeleteFolder={(id) => setDeleteFolderId(id)}
            counts={folderCounts}
            getColor={(f) => f.color}
            allLabel="All Assets"
            allIcon={<FolderOpen className="h-3.5 w-3.5" />}
            expandedStorageKey="assets.expandedFolders"
            dndNamespace="assets"
          />
        </aside>

        {/* Main asset area */}
        <div className="flex flex-1 flex-col min-w-0">
          <div className="shrink-0 border-b border-border/60 px-5 py-3">
            <TooltipProvider>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {assets.assets.length}{" "}
                  {assets.assets.length === 1 ? "asset" : "assets"}
                </span>

                <div className="flex-1" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={
                        assets.filters.showArchived ? "secondary" : "outline"
                      }
                      size="icon-sm"
                      onClick={() =>
                        assets.filters.setShowArchived(
                          !assets.filters.showArchived
                        )
                      }
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {assets.filters.showArchived
                      ? "Hide archived"
                      : "Show archived"}
                  </TooltipContent>
                </Tooltip>

                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(v) => v && changeViewMode(v as AssetViewMode)}
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

          <div className="flex-1 overflow-auto p-5">
            {viewMode === "grid" ? (
              <AssetGrid
                assets={assets.assets}
                loading={assets.loading}
                onSelect={assets.selection.setSelectedAsset}
                onArchive={assets.actions.archiveAsset}
                onRestore={assets.actions.restoreAsset}
                onDelete={setDeleteId}
                showArchived={assets.filters.showArchived}
              />
            ) : (
              <AssetList
                assets={assets.assets}
                loading={assets.loading}
                onSelect={assets.selection.setSelectedAsset}
                onArchive={assets.actions.archiveAsset}
                onRestore={assets.actions.restoreAsset}
                onDelete={setDeleteId}
                showArchived={assets.filters.showArchived}
              />
            )}
          </div>
        </div>
      </FileDropZone>

      {assets.form.showUpload && (
        <AssetUpload
          folders={assets.folders}
          folderId={assets.filters.folderId}
          onSave={assets.form.onFormSaved}
          onCancel={assets.form.closeForm}
        />
      )}
      {assets.form.showForm && (
        <AssetForm
          editingAsset={assets.form.editingAsset}
          folderId={assets.filters.folderId}
          onSave={assets.form.onFormSaved}
          onCancel={assets.form.closeForm}
        />
      )}
      <ConfirmDeleteDialog
        open={!!deleteId}
        onConfirm={() => {
          if (deleteId) assets.actions.deleteAsset(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
        title="Delete asset permanently?"
        description="This action cannot be undone. This asset and its associated file will be permanently removed."
      />

      <ConfirmDeleteDialog
        open={!!deleteFolderId}
        onConfirm={() => {
          if (deleteFolderId) assets.actions.deleteFolder(deleteFolderId);
          setDeleteFolderId(null);
        }}
        onCancel={() => setDeleteFolderId(null)}
        title="Delete folder?"
        description="Subfolders will also be deleted. Assets inside will be moved to the root (not deleted)."
      />
    </div>
    </DndContext>
  );
}

export default function AssetsPage() {
  return (
    <Suspense>
      <AssetsContent />
    </Suspense>
  );
}
