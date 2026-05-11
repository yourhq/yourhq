"use client";

import { useState } from "react";
import { useLabels } from "@/hooks/use-labels";
import { LABEL_PRESET_COLORS } from "@/lib/tasks/types";
import type { Label } from "@/lib/tasks/types";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Plus, Pencil, Trash2, Check, X, Tag } from "lucide-react";
import { toast } from "sonner";

export default function LabelsSettingsPage() {
  const { labels, loading, actions } = useLabels();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_PRESET_COLORS[0]);
  const [newDescription, setNewDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function startEdit(label: Label) {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
    setEditDescription(label.description ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    const { error } = await actions.updateLabel(editingId, {
      name: editName.trim(),
      color: editColor,
      description: editDescription.trim() || null,
    });
    if (error) {
      toast.error("Failed to update label");
    } else {
      toast.success("Label updated");
      setEditingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await actions.deleteLabel(deleteTarget.id);
    if (error) {
      toast.error("Failed to delete label");
    } else {
      toast.success(`Deleted "${deleteTarget.name}"`);
    }
    setDeleteTarget(null);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const { error } = await actions.createLabel(
      newName.trim(),
      newColor,
      newDescription.trim() || undefined
    );
    if (error) {
      toast.error("Failed to create label");
    } else {
      toast.success("Label created");
      setNewName("");
      setNewDescription("");
      setCreating(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Labels" description="Manage labels for organizing tasks." />
      <PageSection>
        <div className="space-y-1">
          {loading && labels.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          )}

          {!loading && labels.length === 0 && !creating && (
            <div className="flex flex-col items-center py-12 text-center">
              <Tag className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No labels yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setCreating(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create your first label
              </Button>
            </div>
          )}

          {labels.map((label) =>
            editingId === label.id ? (
              <div key={label.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-card p-3">
                <div className="flex flex-wrap gap-1">
                  {LABEL_PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditColor(color)}
                      className={cn(
                        "h-5 w-5 rounded-full transition-all",
                        editColor === color && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-7 text-sm"
                    placeholder="Label name"
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  />
                  <Input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Description (optional)"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={cancelEdit}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={saveEdit}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={label.id}
                className="group flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent/40 transition-colors"
              >
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="flex-1 text-sm font-medium">{label.name}</span>
                {label.description && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {label.description}
                  </span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => startEdit(label)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget({ id: label.id, name: label.name })}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            )
          )}

          {creating ? (
            <div className="rounded-md border border-border/60 bg-card p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex flex-wrap gap-1">
                  {LABEL_PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewColor(color)}
                      className={cn(
                        "h-5 w-5 rounded-full transition-all",
                        newColor === color && "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-7 text-sm"
                    placeholder="Label name"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  />
                  <Input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Description (optional)"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          ) : labels.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              New label
            </Button>
          ) : null}
        </div>
      </PageSection>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This label will be removed from all tasks that use it. This action cannot be undone."
      />
    </div>
  );
}
