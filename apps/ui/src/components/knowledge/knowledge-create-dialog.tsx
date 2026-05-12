"use client";

import { useState } from "react";
import type { KnowledgeKind } from "@/lib/knowledge/types";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";

interface KnowledgeCreateDialogProps {
  kind: KnowledgeKind;
  folderId: string | null;
  onSave: (title: string, kind: KnowledgeKind) => void;
  onCancel: () => void;
}

export function KnowledgeCreateDialog({
  kind,
  folderId: _folderId,
  onSave,
  onCancel,
}: KnowledgeCreateDialogProps) {
  const [title, setTitle] = useState("");

  function handleSubmit() {
    if (!title.trim()) return;
    onSave(title.trim(), kind);
  }

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onCancel()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogTitle>
          New {kind === "skill" ? "Skill" : "Page"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          Create a new {kind}
        </ResponsiveDialogDescription>
        <div className="space-y-4">
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={kind === "skill" ? "Skill title..." : "Page title..."}
            autoFocus
            rows={1}
            className="w-full resize-none border-0 bg-transparent text-lg font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = target.scrollHeight + "px";
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!title.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
