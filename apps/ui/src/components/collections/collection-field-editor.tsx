"use client";

import { useState } from "react";
import type { CollectionField, CollectionFieldType, FieldOptions, SelectOption } from "@/lib/collections/types";
import { FIELD_TYPE_LABELS } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
}: CollectionFieldEditorProps) {
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

      <div className="space-y-0.5">
        {fields.map((f) => (
          <div
            key={f.id}
            className="group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-accent/50"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            <span className="flex-1 text-body truncate">{f.label}</span>
            <span className="text-[10px] text-muted-foreground uppercase">
              {FIELD_TYPE_LABELS[f.field_type]}
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
                <DropdownMenuItem onClick={() => setEditField(f)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    onUpdateField(f.id, { is_title_field: !f.is_title_field })
                  }
                >
                  {f.is_title_field ? "Unset as title" : "Set as title"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteFieldId(f.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {/* Add field dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Field</DialogTitle>
          </DialogHeader>
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
                  {(Object.keys(FIELD_TYPE_LABELS) as CollectionFieldType[]).map((t) => (
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
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); setShowAdd(false); }}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!newLabel.trim() || !newKey.trim()}>
              Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Field: {field.label}</DialogTitle>
        </DialogHeader>
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
        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
