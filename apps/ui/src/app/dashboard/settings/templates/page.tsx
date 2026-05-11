"use client";

import { useState } from "react";
import { useTaskTemplates } from "@/hooks/use-task-templates";
import type { TaskTemplate, TaskTemplateItem, TaskPriority } from "@/lib/tasks/types";
import { TASK_PRIORITIES } from "@/lib/tasks/types";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Plus, Pencil, Trash2, GripVertical, LayoutTemplate, GitBranch, Check } from "lucide-react";
import { toast } from "sonner";

function TemplateItemRow({
  item,
  allItems,
  onChange,
  onRemove,
}: {
  item: TaskTemplateItem;
  allItems: TaskTemplateItem[];
  onChange: (updated: TaskTemplateItem) => void;
  onRemove: () => void;
}) {
  const otherRefs = allItems.filter((i) => i.ref !== item.ref).map((i) => i.ref);

  return (
    <div className="flex items-start gap-2 rounded border border-border/40 bg-card/50 p-2">
      <GripVertical className="h-4 w-4 text-muted-foreground/40 mt-1.5 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Input
          value={item.title}
          onChange={(e) => onChange({ ...item, title: e.target.value })}
          placeholder="Task title"
          className="h-7 text-sm"
        />
        <div className="flex items-center gap-2">
          <Select
            value={item.priority ?? "medium"}
            onValueChange={(v) => onChange({ ...item, priority: v as TaskPriority })}
          >
            <SelectTrigger className="h-6 w-auto text-[11px] px-2">
              <span>{TASK_PRIORITIES.find((p) => p.value === (item.priority ?? "medium"))?.label}</span>
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={item.assignee_role ?? ""}
            onChange={(e) => onChange({ ...item, assignee_role: e.target.value || undefined })}
            placeholder="Agent slug"
            className="h-6 text-[11px] max-w-[120px]"
          />
          {otherRefs.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-6 flex items-center gap-1 border border-border/50 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-accent transition-colors">
                  <GitBranch className="h-3 w-3 shrink-0" />
                  {item.blocked_by && item.blocked_by.length > 0
                    ? `${item.blocked_by.length} dep${item.blocked_by.length > 1 ? "s" : ""}`
                    : "Deps"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-1" align="start">
                <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Blocked by</p>
                {otherRefs.map((ref) => {
                  const isSelected = item.blocked_by?.includes(ref) ?? false;
                  const refTitle = allItems.find((i) => i.ref === ref)?.title || ref;
                  return (
                    <button
                      key={ref}
                      onClick={() => {
                        const current = item.blocked_by ?? [];
                        const next = isSelected
                          ? current.filter((r) => r !== ref)
                          : [...current, ref];
                        onChange({ ...item, blocked_by: next.length > 0 ? next : undefined });
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/40 transition-colors"
                    >
                      <span className={cn(
                        "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                        isSelected ? "bg-foreground border-foreground" : "border-border"
                      )}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-background" />}
                      </span>
                      <span className="truncate">{refTitle || ref}</span>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onRemove} className="shrink-0 mt-0.5">
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
}

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: Partial<TaskTemplate> | null;
  onSave: (data: { name: string; description?: string; items: TaskTemplateItem[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [items, setItems] = useState<TaskTemplateItem[]>(template?.items ?? []);

  function addItem() {
    const ref = `task-${items.length + 1}`;
    setItems([...items, { ref, title: "" }]);
  }

  function updateItem(index: number, updated: TaskTemplateItem) {
    const next = [...items];
    next[index] = updated;
    setItems(next);
  }

  function removeItem(index: number) {
    const removed = items[index];
    const next = items.filter((_, i) => i !== index);
    for (const item of next) {
      if (item.blocked_by) {
        item.blocked_by = item.blocked_by.filter((ref) => ref !== removed.ref);
        if (item.blocked_by.length === 0) item.blocked_by = undefined;
      }
    }
    setItems(next);
  }

  function handleSave() {
    if (!name.trim() || items.length === 0) return;
    const validItems = items.filter((i) => i.title.trim());
    onSave({ name: name.trim(), description: description.trim() || undefined, items: validItems });
  }

  return (
    <div className="rounded-md border border-border/60 bg-card p-4 space-y-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        className="h-8 text-sm font-medium"
        autoFocus
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="text-xs"
      />

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Tasks</span>
        {items.map((item, i) => (
          <TemplateItemRow
            key={item.ref}
            item={item}
            allItems={items}
            onChange={(updated) => updateItem(i, updated)}
            onRemove={() => removeItem(i)}
          />
        ))}
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
          <Plus className="h-3 w-3 mr-1" />
          Add task
        </Button>
      </div>

      <div className="flex justify-end gap-1.5 pt-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={!name.trim() || items.filter((i) => i.title.trim()).length === 0}
        >
          {template?.id ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  );
}

export default function TemplatesSettingsPage() {
  const { templates, loading, actions } = useTaskTemplates();
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  async function handleCreate(data: { name: string; description?: string; items: TaskTemplateItem[] }) {
    const { error } = await actions.createTemplate(data);
    if (error) {
      toast.error("Failed to create template");
    } else {
      toast.success("Template created");
      setCreating(false);
    }
  }

  async function handleUpdate(data: { name: string; description?: string; items: TaskTemplateItem[] }) {
    if (!editing) return;
    const { error } = await actions.updateTemplate(editing.id, data);
    if (error) {
      toast.error("Failed to update template");
    } else {
      toast.success("Template updated");
      setEditing(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await actions.deleteTemplate(deleteTarget.id);
    if (error) {
      toast.error("Failed to delete template");
    } else {
      toast.success(`Deleted "${deleteTarget.name}"`);
    }
    setDeleteTarget(null);
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Task Templates" description="Reusable task group templates with dependencies." />
      <PageSection>
        <div className="space-y-3">
          {loading && templates.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          )}

          {!loading && templates.length === 0 && !creating && (
            <div className="flex flex-col items-center py-12 text-center">
              <LayoutTemplate className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No templates yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Templates let you quickly spawn a set of related tasks with dependencies.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setCreating(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Create your first template
              </Button>
            </div>
          )}

          {templates.map((tmpl) =>
            editing?.id === tmpl.id ? (
              <TemplateEditor
                key={tmpl.id}
                template={tmpl}
                onSave={handleUpdate}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div
                key={tmpl.id}
                className="group flex items-center gap-3 rounded-md border border-border/40 px-3 py-2.5 hover:bg-accent/30 transition-colors"
              >
                <LayoutTemplate className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{tmpl.name}</div>
                  {tmpl.description && (
                    <div className="text-xs text-muted-foreground truncate">{tmpl.description}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {tmpl.items.length} task{tmpl.items.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(tmpl)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget({ id: tmpl.id, name: tmpl.name })}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            )
          )}

          {creating ? (
            <TemplateEditor
              template={null}
              onSave={handleCreate}
              onCancel={() => setCreating(false)}
            />
          ) : templates.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              New template
            </Button>
          ) : null}
        </div>
      </PageSection>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This template will be permanently deleted. Existing tasks created from this template will not be affected."
      />
    </div>
  );
}
