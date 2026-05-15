"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import {
  FieldDefinition,
  FieldType,
  FIELD_TYPES,
  FIELD_TYPE_ICONS,
} from "@/lib/fields/types";
import { slugify, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { TagInput } from "@/components/ui/tag-input";
import { Plus, Trash2, GripVertical, LayoutGrid, MoreHorizontal, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";

const ENTITY_TYPES = [
  { value: "contact", label: "Contacts" },
  { value: "organization", label: "Organizations" },
];

function SortableFieldRow({
  field,
  onEdit,
  onDelete,
}: {
  field: FieldDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const TypeIcon = FIELD_TYPE_ICONS[field.field_type];
  const typeDef = FIELD_TYPES.find((t) => t.value === field.field_type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-accent/50 transition-colors",
        isDragging && "opacity-50 bg-accent/30"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <TypeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <span className="flex-1 text-sm truncate">{field.label}</span>

      {field.field_group && (
        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
          {field.field_group}
        </span>
      )}

      <span className="text-[10px] text-muted-foreground uppercase">
        {typeDef?.label ?? field.field_type}
      </span>

      {field.required && (
        <span className="h-1.5 w-1.5 rounded-full bg-status-error shrink-0" />
      )}

      {!field.is_active && (
        <span className="text-[10px] text-muted-foreground/60 italic">
          Inactive
        </span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EditFieldDialog({
  field,
  onClose,
  onSave,
}: {
  field: FieldDefinition;
  onClose: () => void;
  onSave: (patch: Partial<FieldDefinition>) => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [fieldType, setFieldType] = useState<FieldType>(field.field_type);
  const [group, setGroup] = useState(field.field_group ?? "");
  const [description, setDescription] = useState(field.description ?? "");
  const [required, setRequired] = useState(field.required);
  const [active, setActive] = useState(field.is_active);
  const [options, setOptions] = useState<string[]>(field.options ?? []);

  function handleSubmit() {
    onSave({
      label: label.trim() || field.label,
      field_type: fieldType,
      field_group: group.trim() || null,
      description: description.trim() || null,
      required,
      is_active: active,
      options:
        fieldType === "select" || fieldType === "multiselect" ? options : null,
    });
    onClose();
  }

  return (
    <ResponsiveDialog open onOpenChange={(v) => !v && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
        <ResponsiveDialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <ResponsiveDialogTitle>Edit field</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Key</Label>
            <Input
              value={field.field_key}
              disabled
              className="h-9 text-sm font-mono bg-muted/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select
                value={fieldType}
                onValueChange={(v) => setFieldType(v as FieldType)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3 w-3 text-muted-foreground" />
                          {t.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Group</Label>
              <Input
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="e.g. Audience, Profile"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Help text shown below the field"
              className="h-9 text-sm"
            />
          </div>

          {(fieldType === "select" || fieldType === "multiselect") && (
            <div className="space-y-1.5">
              <Label className="text-xs">Options</Label>
              <TagInput
                value={options}
                onChange={setOptions}
                placeholder="Add option..."
                className="min-h-[32px]"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch checked={required} onCheckedChange={setRequired} />
              Required
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Switch checked={active} onCheckedChange={setActive} />
              Active
            </label>
          </div>
        </div>

        <ResponsiveDialogFooter className="shrink-0 border-t border-border/60 px-6 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            Save
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function FieldEditor({ entityType }: { entityType: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newGroup, setNewGroup] = useState("");
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const fetchFields = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("field_definitions")
      .select("*")
      .eq("entity_type", entityType)
      .order("sort_order", { ascending: true });
    if (data) setFields(data as FieldDefinition[]);
    setLoading(false);
  }, [supabase, entityType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFields();
  }, [fetchFields]);

  async function updateField(id: string, patch: Partial<FieldDefinition>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    const { error } = await supabase
      .from("field_definitions")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update field");
      fetchFields();
      return;
    }
    logAudit(supabase, {
      module: "settings",
      entity_type: "field_definition",
      entity_id: id,
      action: "updated",
      summary: `Updated field definition`,
    });
  }

  async function deleteField(id: string) {
    await supabase.from("field_definitions").delete().eq("id", id);
    logAudit(supabase, {
      module: "settings",
      entity_type: "field_definition",
      entity_id: id,
      action: "deleted",
      summary: `Deleted field definition`,
    });
    fetchFields();
  }

  async function createField() {
    if (!newLabel.trim()) return;
    const field_key = slugify(newLabel);
    if (!field_key) {
      toast.error("Invalid label");
      return;
    }
    const nextOrder = fields.length > 0 ? Math.max(...fields.map((f) => f.sort_order)) + 10 : 10;
    const { data, error } = await supabase
      .from("field_definitions")
      .insert({
        entity_type: entityType,
        field_key,
        field_type: newType,
        label: newLabel.trim(),
        field_group: newGroup.trim() || null,
        sort_order: nextOrder,
        required: false,
        options: newType === "select" || newType === "multiselect" ? [] : null,
        is_active: true,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message ?? "Failed to create field");
      return;
    }
    if (data) {
      logAudit(supabase, {
        module: "settings",
        entity_type: "field_definition",
        entity_id: data.id,
        action: "created",
        summary: `Created field '${newLabel}'`,
      });
    }
    setNewLabel("");
    setNewType("text");
    setNewGroup("");
    setAdding(false);
    fetchFields();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...fields];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setFields(reordered);

    await Promise.all(
      reordered.map((f, i) =>
        supabase
          .from("field_definitions")
          .update({ sort_order: (i + 1) * 10 })
          .eq("id", f.id)
      )
    );
  }

  const grouped = useMemo(() => {
    const map = new Map<string, FieldDefinition[]>();
    for (const f of fields) {
      const group = f.field_group ?? "Other";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(f);
    }
    return Array.from(map.entries());
  }, [fields]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic">
          No custom fields yet. Add your first field below.
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          {grouped.map(([group, groupFields]) => (
            <div key={group} className="space-y-0.5">
              <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground px-1.5 pb-1 pt-2">
                {group}
              </h3>
              {groupFields.map((field) => (
                <SortableFieldRow
                  key={field.id}
                  field={field}
                  onEdit={() => setEditingField(field)}
                  onDelete={() => setConfirmDeleteId(field.id)}
                />
              ))}
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {adding ? (
        <div className="rounded-md border border-border/50 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createField();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewLabel("");
                }
              }}
              placeholder="Field label"
              autoFocus
              className="h-7 text-xs flex-1"
            />
            <Select value={newType} onValueChange={(v) => setNewType(v as FieldType)}>
              <SelectTrigger className="h-7 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        {t.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Input
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Group"
              className="h-7 text-xs w-32"
            />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setAdding(false);
                setNewLabel("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={createField}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add field
        </Button>
      )}

      {editingField && (
        <EditFieldDialog
          field={editingField}
          onClose={() => setEditingField(null)}
          onSave={(patch) => updateField(editingField.id, patch)}
        />
      )}

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => {
          if (confirmDeleteId) deleteField(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
        title="Delete custom field?"
        description="Existing data on records will remain in the database but stop showing on forms and detail views."
      />
    </div>
  );
}

export default function FieldsSettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<LayoutGrid className="h-4 w-4" />}
        title="Custom fields"
        description="Define properties that appear on records. Drag to reorder, click to edit."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-4xl p-5">
          <Tabs defaultValue="contact">
            <TabsList variant="line" className="h-10">
              {ENTITY_TYPES.map((e) => (
                <TabsTrigger key={e.value} value={e.value} className="text-[13px]">
                  {e.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {ENTITY_TYPES.map((e) => (
              <TabsContent key={e.value} value={e.value} className="pt-5">
                <FieldEditor entityType={e.value} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
