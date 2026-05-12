"use client";

import { useState } from "react";
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
import type { CollectionField, CollectionFieldType, FieldOptions, SelectOption } from "@/lib/collections/types";
import { FIELD_TYPE_LABELS, CREATABLE_FIELD_TYPES } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { cn } from "@/lib/utils";
import { Plus, MoreHorizontal, GripVertical, Trash2, Pencil } from "lucide-react";

interface CollectionFieldEditorProps {
  fields: CollectionField[];
  onAddField: (input: {
    field_key: string;
    field_type: CollectionFieldType;
    label: string;
    required?: boolean;
    options?: FieldOptions;
    is_title_field?: boolean;
  }) => void;
  onUpdateField: (fieldId: string, updates: Partial<Pick<CollectionField, "label" | "required" | "options" | "is_title_field" | "is_active">>) => void;
  onDeleteField: (fieldId: string) => void;
  onReorderFields: (orderedIds: string[]) => void;
}

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export function CollectionFieldEditor({
  fields,
  onAddField,
  onUpdateField,
  onDeleteField,
  onReorderFields,
}: CollectionFieldEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...fields];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorderFields(reordered.map((f) => f.id));
  };
  const [showAdd, setShowAdd] = useState(false);
  const [editField, setEditField] = useState<CollectionField | null>(null);
  const [deleteFieldId, setDeleteFieldId] = useState<string | null>(null);

  // Add form state
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<CollectionFieldType>("text");
  const [newRequired, setNewRequired] = useState(false);
  const [newIsTitle, setNewIsTitle] = useState(false);
  const [newOptions, setNewOptions] = useState<SelectOption[]>([]);
  const [keyTouched, setKeyTouched] = useState(false);

  const handleLabelChange = (v: string) => {
    setNewLabel(v);
    if (!keyTouched) setNewKey(slugifyKey(v));
  };

  const addOption = () => {
    setNewOptions([...newOptions, { value: "", label: "", color: "#6b7280" }]);
  };

  const updateOption = (i: number, updates: Partial<SelectOption>) => {
    setNewOptions(newOptions.map((o, idx) => (idx === i ? { ...o, ...updates } : o)));
  };

  const removeOption = (i: number) => {
    setNewOptions(newOptions.filter((_, idx) => idx !== i));
  };

  const reset = () => {
    setNewLabel("");
    setNewKey("");
    setNewType("text");
    setNewRequired(false);
    setNewIsTitle(false);
    setNewOptions([]);
    setKeyTouched(false);
  };

  const handleAdd = () => {
    if (!newLabel.trim() || !newKey.trim()) return;
    const options: FieldOptions | undefined =
      (newType === "select" || newType === "multi_select") && newOptions.length > 0
        ? {
            choices: newOptions
              .filter((o) => o.value && o.label)
              .map((o) => ({
                value: o.value || slugifyKey(o.label),
                label: o.label,
                color: o.color,
              })),
          }
        : undefined;

    onAddField({
      field_key: newKey.trim(),
      field_type: newType,
      label: newLabel.trim(),
      required: newRequired,
      options,
      is_title_field: newIsTitle,
    });
    reset();
    setShowAdd(false);
  };

  const needsOptions = newType === "select" || newType === "multi_select";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-heading text-[13px]">Fields</h3>
        <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {fields.map((f) => (
              <SortableFieldRow
                key={f.id}
                field={f}
                onEdit={() => setEditField(f)}
                onToggleTitle={() => onUpdateField(f.id, { is_title_field: !f.is_title_field })}
                onDelete={() => setDeleteFieldId(f.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add field dialog */}
      <ResponsiveDialog open={showAdd} onOpenChange={setShowAdd}>
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Add Field</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={newLabel} onChange={(e) => handleLabelChange(e.target.value)} placeholder="e.g. Company" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Key</Label>
              <Input
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setKeyTouched(true); }}
                placeholder="company"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as CollectionFieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsOptions && (
              <div className="space-y-1.5">
                <Label>Options</Label>
                <div className="space-y-1">
                  {newOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={opt.color ?? "#6b7280"}
                        onChange={(e) => updateOption(i, { color: e.target.value })}
                        className="h-6 w-6 rounded border-0 p-0"
                      />
                      <Input
                        value={opt.label}
                        onChange={(e) =>
                          updateOption(i, { label: e.target.value, value: slugifyKey(e.target.value) })
                        }
                        placeholder="Label"
                        className="h-7 flex-1"
                      />
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeOption(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addOption}>
                  <Plus className="h-3 w-3" />
                  Add option
                </Button>
              </div>
            )}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-body">
                <Switch checked={newRequired} onCheckedChange={setNewRequired} />
                Required
              </label>
              <label className="flex items-center gap-2 text-body">
                <Switch checked={newIsTitle} onCheckedChange={setNewIsTitle} />
                Title field
              </label>
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => { reset(); setShowAdd(false); }}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!newLabel.trim() || !newKey.trim()}>
              Add Field
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* Edit field dialog */}
      {editField && (
        <EditFieldDialog
          field={editField}
          onClose={() => setEditField(null)}
          onSave={(updates) => {
            onUpdateField(editField.id, updates);
            setEditField(null);
          }}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDeleteDialog
        open={!!deleteFieldId}
        title="Delete field?"
        description="This will remove data from all records. This cannot be undone."
        onConfirm={() => {
          if (deleteFieldId) onDeleteField(deleteFieldId);
          setDeleteFieldId(null);
        }}
        onCancel={() => setDeleteFieldId(null)}
      />
    </div>
  );
}

function SortableFieldRow({
  field,
  onEdit,
  onToggleTitle,
  onDelete,
}: {
  field: CollectionField;
  onEdit: () => void;
  onToggleTitle: () => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-accent/50",
        isDragging && "opacity-50 bg-accent/30",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <span className="flex-1 text-body truncate">{field.label}</span>
      <span className="text-[10px] text-muted-foreground uppercase">
        {FIELD_TYPE_LABELS[field.field_type]}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleTitle}>
            {field.is_title_field ? "Unset as title" : "Set as title"}
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
  field: CollectionField;
  onClose: () => void;
  onSave: (updates: Partial<Pick<CollectionField, "label" | "required" | "options" | "is_title_field">>) => void;
}) {
  const [label, setLabel] = useState(field.label);
  const [required, setRequired] = useState(field.required);
  const [isTitle, setIsTitle] = useState(field.is_title_field);
  const [options, setOptions] = useState<SelectOption[]>(field.options?.choices ?? []);

  const needsOptions = field.field_type === "select" || field.field_type === "multi_select";

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Edit Field: {field.label}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {needsOptions && (
            <div className="space-y-1.5">
              <Label>Options</Label>
              <div className="space-y-1">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={opt.color ?? "#6b7280"}
                      onChange={(e) =>
                        setOptions(options.map((o, idx) => (idx === i ? { ...o, color: e.target.value } : o)))
                      }
                      className="h-6 w-6 rounded border-0 p-0"
                    />
                    <Input
                      value={opt.label}
                      onChange={(e) =>
                        setOptions(
                          options.map((o, idx) =>
                            idx === i ? { ...o, label: e.target.value } : o,
                          ),
                        )
                      }
                      className="h-7 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() =>
                  setOptions([...options, { value: "", label: "", color: "#6b7280" }])
                }
              >
                <Plus className="h-3 w-3" />
                Add option
              </Button>
            </div>
          )}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-body">
              <Switch checked={required} onCheckedChange={setRequired} />
              Required
            </label>
            <label className="flex items-center gap-2 text-body">
              <Switch checked={isTitle} onCheckedChange={setIsTitle} />
              Title field
            </label>
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const updates: Partial<Pick<CollectionField, "label" | "required" | "options" | "is_title_field">> = {};
              if (label !== field.label) updates.label = label;
              if (required !== field.required) updates.required = required;
              if (isTitle !== field.is_title_field) updates.is_title_field = isTitle;
              if (needsOptions) {
                updates.options = {
                  choices: options
                    .filter((o) => o.label)
                    .map((o) => ({
                      value: o.value || o.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                      label: o.label,
                      color: o.color,
                    })),
                };
              }
              onSave(updates);
            }}
          >
            Save
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
