"use client";

import { useMemo, useState } from "react";
import type { DocumentFolder } from "@/lib/documents/types";
import { buildFolderTree, flattenFolderTree } from "@/lib/documents/tree";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface DocumentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: DocumentFolder[];
  defaultFolderId?: string | null;
  onCreate: (title: string, folderId?: string | null) => Promise<{ id: string } | null>;
}

export function DocumentCreateDialog({
  open,
  onOpenChange,
  folders,
  defaultFolderId,
  onCreate,
}: DocumentCreateDialogProps) {
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId || "none");
  const [creating, setCreating] = useState(false);

  const flatFolders = useMemo(
    () => flattenFolderTree(buildFolderTree(folders)),
    [folders]
  );

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    const doc = await onCreate(
      title.trim(),
      folderId === "none" ? null : folderId
    );
    setCreating(false);
    if (doc) {
      setTitle("");
      setFolderId("none");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">New Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {/* Title input — hero element */}
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="w-full resize-none border-0 bg-transparent text-lg font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
            rows={1}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCreate();
              }
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = target.scrollHeight + "px";
            }}
          />

          {/* Property bar */}
          <div className="flex items-center gap-2">
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger className="h-6 w-auto min-w-[100px] text-xs border-border/50">
                <SelectValue placeholder="No folder" />
              </SelectTrigger>
              <SelectContent portal={false}>
                <SelectItem value="none">No folder</SelectItem>
                {flatFolders.map(({ folder: f, depth }) => (
                  <SelectItem
                    key={f.id}
                    value={f.id}
                    style={{ paddingLeft: depth * 12 + 8 }}
                  >
                    {f.icon ? `${f.icon} ` : ""}{f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              Press Enter to create
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={handleCreate}
                disabled={!title.trim() || creating}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
