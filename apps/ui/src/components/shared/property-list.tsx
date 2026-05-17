"use client";

import * as React from "react";
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
import type { FieldDefinition, FieldType } from "@/lib/fields/types";
import { FIELD_TYPES, FIELD_TYPE_ICONS } from "@/lib/fields/types";
import type { AddFieldInput } from "@/hooks/use-field-definitions";
import { DynamicField } from "./dynamic-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ResponsivePopover,
  ResponsivePopoverTrigger,
  ResponsivePopoverContent,
} from "@/components/ui/responsive-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { cn, slugify } from "@/lib/utils";
import {
  Plus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  EyeOff,
  Asterisk,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ── Quick suggestions by entity type ──────────────────────────────────

const PROPERTY_SUGGESTIONS: Record<string, { label: string; type: FieldType; group?: string; options?: string[] }[]> = {
  contact: [
    { label: "Company Size", type: "select", group: "Work", options: ["1-10", "11-50", "51-200", "201-1000", "1000+"] },
    { label: "Deal Value", type: "number", group: "Sales" },
    { label: "Birthday", type: "date", group: "Personal" },
    { label: "Timezone", type: "text", group: "Info" },
    { label: "LinkedIn", type: "url", group: "Social" },
    { label: "Referral Source", type: "select", group: "Acquisition", options: ["Organic", "Referral", "Cold Outreach", "Event", "Ad"] },
  ],
  organization: [
    { label: "Revenue", type: "number", group: "Financials" },
    { label: "Founded", type: "date", group: "Info" },
    { label: "Employees", type: "number", group: "Info" },
    { label: "Stage", type: "select", group: "Sales", options: ["Lead", "Prospect", "Customer", "Churned"] },
    { label: "Contract End", type: "date", group: "Sales" },
    { label: "Account Owner", type: "text", group: "Internal" },
  ],
};

// ── Types ─────────────────────────────────────────────────────────────

interface PropertyListProps {
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onValueChange: (key: string, value: unknown) => void;
  onAddField: (input: AddFieldInput) => Promise<FieldDefinition | null>;
  onUpdateField: (id: string, updates: Partial<Pick<FieldDefinition, "label" | "field_group" | "sort_order" | "required" | "options" | "description" | "is_active">>) => Promise<boolean>;
  onDeleteField: (id: string) => Promise<boolean>;
  onReorderFields: (orderedIds: string[]) => Promise<void>;
  entityType: string;
  readOnly?: boolean;
}

// ── Sortable property row ─────────────────────────────────────────────

function SortablePropertyRow({
  field,
  value,
  onValueChange,
  onUpdateField,
  onRequestDelete,
  readOnly,
}: {
  field: FieldDefinition;
  value: unknown;
  onValueChange: (value: unknown) => void;
  onUpdateField: (id: string, updates: Partial<Pick<FieldDefinition, "label" | "field_group" | "sort_order" | "required" | "options" | "description" | "is_active">>) => Promise<boolean>;
  onRequestDelete: (id: string) => void;
  readOnly?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, disabled: readOnly });
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(field.label);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const supabase = React.useMemo(() => createClient(), []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function startRename() {
    setDraft(field.label);
    setRenaming(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== field.label) {
      onUpdateField(field.id, { label: trimmed });
    }
    setRenaming(false);
  }

  function handlePersistOptions(fieldId: string, options: string[]) {
    supabase
      .from("field_definitions")
      .update({ options })
      .eq("id", fieldId)
      .then();
  }

  const Icon = FIELD_TYPE_ICONS[field.field_type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group grid grid-cols-[140px_1fr_28px] items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40",
        isDragging && "opacity-50 z-50"
      )}
    >
      {/* Label column */}
      <div className="flex items-center gap-1 min-h-[36px]">
        {!readOnly && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        )}
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 min-w-0 bg-transparent text-xs font-medium text-foreground outline-none border-b border-primary"
          />
        ) : (
          <span
            className={cn(
              "text-xs text-muted-foreground flex items-center gap-1 truncate",
              !readOnly && "cursor-default"
            )}
            title={field.label}
          >
            {Icon && <Icon className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
            <span className="truncate">{field.label}</span>
            {field.required && <Asterisk className="h-2.5 w-2.5 text-status-error shrink-0" />}
          </span>
        )}
      </div>

      {/* Value column */}
      <div className="min-h-[36px] flex items-center">
        <DynamicField
          field={field}
          value={value}
          onChange={onValueChange}
          onPersistOptions={handlePersistOptions}
          className="w-full"
        />
      </div>

      {/* Actions column */}
      {!readOnly ? (
        <div className="min-h-[36px] flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-7 w-7 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={startRename}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdateField(field.id, { required: !field.required })}>
                <Asterisk className="h-3.5 w-3.5 mr-2" />
                {field.required ? "Make optional" : "Make required"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdateField(field.id, { is_active: false })}>
                <EyeOff className="h-3.5 w-3.5 mr-2" />
                Hide property
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onRequestDelete(field.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}

// ── Add property popover ──────────────────────────────────────────────

function AddPropertyPopover({
  entityType,
  existingKeys,
  onAdd,
}: {
  entityType: string;
  existingKeys: Set<string>;
  onAdd: (input: AddFieldInput) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<FieldType>("text");
  const [required, setRequired] = React.useState(false);

  const suggestions = (PROPERTY_SUGGESTIONS[entityType] ?? []).filter(
    (s) => !existingKeys.has(slugify(s.label))
  );

  function reset() {
    setLabel("");
    setType("text");
    setRequired(false);
  }

  function handleAdd() {
    if (!label.trim()) return;
    onAdd({ label: label.trim(), field_type: type, required });
    reset();
    setOpen(false);
  }

  function handlePreset(s: (typeof suggestions)[number]) {
    onAdd({
      label: s.label,
      field_type: s.type,
      field_group: s.group,
      options: s.options,
    });
    reset();
    setOpen(false);
  }

  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <ResponsivePopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent/40 w-full"
        >
          <Plus className="h-3.5 w-3.5" />
          Add property
        </button>
      </ResponsivePopoverTrigger>
      <ResponsivePopoverContent className="w-80 p-0" align="start">
        <div className="p-3 space-y-3">
          {suggestions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Suggestions
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => {
                  const Icon = FIELD_TYPE_ICONS[s.type];
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => handlePreset(s)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground"
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[10px] text-muted-foreground/60">or custom</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
          )}

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-[11px]">Name</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                placeholder="e.g. Account Owner"
                className="h-8 text-sm"
                autoFocus={suggestions.length === 0}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          {t.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Switch checked={required} onCheckedChange={setRequired} />
                Required
              </label>
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                onClick={handleAdd}
                disabled={!label.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyPropertyState({
  entityType,
  onAdd,
}: {
  entityType: string;
  existingKeys: Set<string>;
  onAdd: (input: AddFieldInput) => void;
}) {
  const suggestions = (PROPERTY_SUGGESTIONS[entityType] ?? []).slice(0, 4);

  return (
    <div className="py-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        No properties yet. Add one to track custom data.
      </p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => {
            const Icon = FIELD_TYPE_ICONS[s.type];
            return (
              <button
                key={s.label}
                type="button"
                onClick={() =>
                  onAdd({
                    label: s.label,
                    field_type: s.type,
                    field_group: s.group,
                    options: s.options,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground"
              >
                {Icon && <Icon className="h-3 w-3" />}
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function PropertyList({
  fields,
  values,
  onValueChange,
  onAddField,
  onUpdateField,
  onDeleteField,
  onReorderFields,
  entityType,
  readOnly = false,
}: PropertyListProps) {
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const existingKeys = React.useMemo(
    () => new Set(fields.map((f) => f.field_key)),
    [fields]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...fields];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorderFields(reordered.map((f) => f.id));
  }

  async function handleDelete() {
    if (!deleteId) return;
    await onDeleteField(deleteId);
    setDeleteId(null);
  }

  if (fields.length === 0 && !readOnly) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Properties
        </h3>
        <EmptyPropertyState
          entityType={entityType}
          existingKeys={existingKeys}
          onAdd={onAddField}
        />
      </div>
    );
  }

  if (fields.length === 0 && readOnly) {
    return null;
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        Properties
      </h3>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="-mx-2">
            {fields.map((field) => (
              <SortablePropertyRow
                key={field.id}
                field={field}
                value={values[field.field_key]}
                onValueChange={(v) => onValueChange(field.field_key, v)}
                onUpdateField={onUpdateField}
                onRequestDelete={setDeleteId}
                readOnly={readOnly}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!readOnly && (
        <div className="-mx-2 mt-0.5">
          <AddPropertyPopover
            entityType={entityType}
            existingKeys={existingKeys}
            onAdd={onAddField}
          />
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteId}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        title="Delete property"
        description="This will permanently remove this property definition. Existing data in records will be preserved but no longer visible."
      />
    </div>
  );
}
