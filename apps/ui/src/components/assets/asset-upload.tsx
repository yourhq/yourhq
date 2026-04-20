"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AssetType, AssetFolder } from "@/lib/assets/types";
import { ASSET_TYPES } from "@/lib/assets/types";
import { uploadAssetFile, inferAssetType, formatFileSize } from "@/lib/assets/storage";
import { buildFolderTree, flattenFolderTree } from "@/lib/shared/folder-tree";
import { logAudit } from "@/lib/audit/log";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { Upload, X, FileIcon } from "lucide-react";

const TYPE_ICONS: Record<string, string> = {
  document: "📄",
  sop: "📋",
  research: "🔬",
  image: "🖼",
  video: "🎬",
  audio: "🎵",
  template: "📝",
  script: "⚡",
  spreadsheet: "📊",
  link: "🔗",
  other: "📎",
};

interface AssetUploadProps {
  folders: AssetFolder[];
  folderId?: string;
  onSave: () => void;
  onCancel: () => void;
}

export function AssetUpload({ folders, folderId, onSave, onCancel }: AssetUploadProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLTextAreaElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [type, setType] = useState<AssetType>("other");
  const [tags, setTags] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState(
    folderId && folderId !== "all" ? folderId : ""
  );
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Auto-resize name textarea
  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.style.height = "auto";
      nameRef.current.style.height = nameRef.current.scrollHeight + "px";
    }
  }, [name]);

  function handleFileSelect(selected: File) {
    setFile(selected);
    // Auto-populate name from filename (without extension)
    const nameWithoutExt = selected.name.replace(/\.[^/.]+$/, "");
    setName(nameWithoutExt);
    // Auto-detect type from MIME
    setType(inferAssetType(selected.type));
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }, []);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) handleFileSelect(selected);
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (name.trim() && file) handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!file || !name.trim()) return;
    setUploading(true);

    try {
      // 1. Insert asset row to get ID
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        type,
        mime_type: file.type || null,
        file_size: file.size,
        folder_id: selectedFolderId || null,
        tags,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("assets")
        .insert(payload)
        .select("id")
        .single();

      if (insertError || !inserted) throw insertError || new Error("Insert failed");

      // 2. Upload file to storage
      try {
        const storagePath = await uploadAssetFile(supabase, file, inserted.id);

        // 3. Update asset with storage path
        await supabase
          .from("assets")
          .update({ file_url: storagePath })
          .eq("id", inserted.id);

        logAudit(supabase, {
          module: "assets",
          entity_type: "asset",
          entity_id: inserted.id,
          action: "created",
          summary: `Uploaded file '${name.trim()}' (${formatFileSize(file.size)})`,
        });
      } catch (uploadError) {
        // Rollback: delete the asset row if upload fails
        await supabase.from("assets").delete().eq("id", inserted.id);
        throw uploadError;
      }

      onSave();
    } catch (err) {
      console.error("Upload failed:", err);
      setUploading(false);
    }
  }

  const selectedType = ASSET_TYPES.find((t) => t.value === type);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <DialogTitle className="sr-only">Upload asset</DialogTitle>
        <DialogDescription className="sr-only">
          Drop a file and tag it with a name, description, type, and folder.
        </DialogDescription>
        {/* Drop zone or file preview */}
        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-2 px-4 py-10 cursor-pointer transition-colors ${
              dragOver
                ? "bg-accent/50 border-accent"
                : "hover:bg-accent/20"
            }`}
          >
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Drop a file here or <span className="text-foreground underline">browse</span>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto min-h-0">
            {/* File info bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/20">
              <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate flex-1">
                {file.name}
              </span>
              <span className="text-xs text-muted-foreground/60 shrink-0">
                {formatFileSize(file.size)}
              </span>
              <button
                onClick={() => {
                  setFile(null);
                  setName("");
                  setType("other");
                }}
                className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Name - hero input */}
            <div className="px-4 pt-3 pb-2">
              <textarea
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                placeholder="Asset name"
                autoFocus
                rows={1}
                className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              {showDescription ? (
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description..."
                  rows={2}
                  className="mt-1 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none resize-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDescription(true)}
                  className="mt-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Add description...
                </button>
              )}
            </div>

            {/* Property bar */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
              {/* Type */}
              <Select value={type} onValueChange={(v) => setType(v as AssetType)}>
                <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
                  <span>{TYPE_ICONS[type]}</span>
                  <span>{selectedType?.label}</span>
                </SelectTrigger>
                <SelectContent portal={false}>
                  {ASSET_TYPES.filter((t) => t.value !== "link").map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="mr-1">{TYPE_ICONS[t.value]}</span>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Folder */}
              <Select
                value={selectedFolderId || "__none__"}
                onValueChange={(v) => setSelectedFolderId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
                  <span>
                    {selectedFolderId
                      ? folders.find((f) => f.id === selectedFolderId)?.name ?? "Folder"
                      : "No folder"}
                  </span>
                </SelectTrigger>
                <SelectContent portal={false}>
                  <SelectItem value="__none__">No folder</SelectItem>
                  {flattenFolderTree(buildFolderTree(folders)).map(
                    ({ folder: f, depth }) => (
                      <SelectItem
                        key={f.id}
                        value={f.id}
                        style={{ paddingLeft: depth * 12 + 8 }}
                      >
                        {f.name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              {/* Tags */}
              <div className="flex-1 min-w-[120px]">
                <TagInput
                  value={tags}
                  onChange={setTags}
                  placeholder="Add tags..."
                  className="min-h-[24px]"
                />
              </div>
            </div>

            </div>{/* end scrollable area */}

            {/* Submit bar */}
            <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 shrink-0">
              <p className="text-[11px] text-muted-foreground/50">
                Press Enter to upload
              </p>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSubmit}
                  disabled={uploading || !name.trim() || !file}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
