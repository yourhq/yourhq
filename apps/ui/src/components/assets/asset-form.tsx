"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Asset, AssetType } from "@/lib/assets/types";
import { ASSET_TYPES } from "@/lib/assets/types";
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

interface AssetFormProps {
  editingAsset: Asset | null;
  folderId?: string;
  onSave: () => void;
  onCancel: () => void;
}

export function AssetForm({ editingAsset, folderId, onSave, onCancel }: AssetFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState(editingAsset?.name ?? "");
  const [description, setDescription] = useState(editingAsset?.description ?? "");
  const [type, setType] = useState<AssetType>(editingAsset?.type ?? "document");
  const [content, setContent] = useState(editingAsset?.content ?? "");
  const [fileUrl, setFileUrl] = useState(editingAsset?.file_url ?? "");
  const [tags, setTags] = useState<string[]>(editingAsset?.tags ?? []);
  const [showDescription, setShowDescription] = useState(!!editingAsset?.description);
  const [showContent, setShowContent] = useState(!!editingAsset?.content || !!editingAsset?.file_url);

  // Auto-resize name
  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.style.height = "auto";
      nameRef.current.style.height = nameRef.current.scrollHeight + "px";
    }
  }, [name]);

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      type,
      content: content.trim() || null,
      file_url: fileUrl.trim() || null,
      folder_id: folderId && folderId !== "all" ? folderId : null,
      tags,
    };

    if (editingAsset) {
      await supabase.from("assets").update(payload).eq("id", editingAsset.id);
      logAudit(supabase, {
        module: "assets",
        entity_type: "asset",
        entity_id: editingAsset.id,
        action: "updated",
        summary: `Updated asset '${payload.name}'`,
      });
    } else {
      const { data: inserted } = await supabase.from("assets").insert(payload).select("id").single();
      if (inserted) {
        logAudit(supabase, {
          module: "assets",
          entity_type: "asset",
          entity_id: inserted.id,
          action: "created",
          summary: `Created asset '${payload.name}'`,
        });
      }
    }

    setSaving(false);
    onSave();
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (name.trim()) handleSubmit();
    }
  }

  const selectedType = ASSET_TYPES.find((t) => t.value === type);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <DialogTitle className="sr-only">
          {editingAsset ? "Edit asset" : "New asset"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Create or edit an asset with a name, description, type, tags, and folder.
        </DialogDescription>
        <div className="flex-1 overflow-y-auto min-h-0">
        {/* Name - hero input */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            placeholder={editingAsset ? "Asset name" : "What are you adding?"}
            autoFocus
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {/* Description - expandable */}
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

        {/* Property bar - type + tags */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
          {/* Type */}
          <Select value={type} onValueChange={(v) => setType(v as AssetType)}>
            <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
              <span>{TYPE_ICONS[type]}</span>
              <span>{selectedType?.label}</span>
            </SelectTrigger>
            <SelectContent portal={false}>
              {ASSET_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <span className="mr-1">{TYPE_ICONS[t.value]}</span>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tags inline */}
          <div className="flex-1 min-w-[120px]">
            <TagInput
              value={tags}
              onChange={setTags}
              placeholder="Add tags..."
              className="min-h-[24px]"
            />
          </div>
        </div>

        {/* Content area - contextual */}
        {showContent ? (
          <div className="border-t border-border/50 px-4 py-2.5">
            {type === "link" ? (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">URL</span>
                <input
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-7 bg-transparent border-0 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:bg-accent/30 rounded px-1.5 -ml-1.5 transition-colors"
                />
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Content (Markdown supported)..."
                rows={8}
                className="font-mono text-xs resize-none border-border/50 bg-transparent shadow-none focus-visible:ring-0"
              />
            )}
          </div>
        ) : (
          <div className="border-t border-border/50 px-4 py-2">
            <button
              type="button"
              onClick={() => setShowContent(true)}
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {type === "link" ? "Add URL..." : "Add content..."}
            </button>
          </div>
        )}

        </div>{/* end scrollable area */}

        {/* Submit bar */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 shrink-0">
          <p className="text-[11px] text-muted-foreground/50">
            Press Enter to {editingAsset ? "save" : "create"}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : editingAsset ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
