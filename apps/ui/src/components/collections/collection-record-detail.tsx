"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { FIELD_TYPE_LABELS, CREATABLE_FIELD_TYPES } from "@/lib/collections/types";
import type { CollectionFieldType, FieldOptions, SelectOption } from "@/lib/collections/types";
import { CollectionCell } from "./collection-cell";
import { formatDistanceToNow } from "date-fns";
import { Plus, Settings2, Type, Hash, Calendar, CheckSquare, List, Link2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";

interface CollectionRecordDetailProps {
  record: CollectionRecord;
  fields: CollectionField[];
  onCellChange: (fieldKey: string, value: unknown) => void;
  onAddField?: (input: {
    field_key: string;
    field_type: CollectionFieldType;
    label: string;
    required?: boolean;
    options?: FieldOptions;
    is_title_field?: boolean;
  }) => void;
  onNavigateToFields?: () => void;
}

const FIELD_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  text: Type,
  number: Hash,
  date: Calendar,
  datetime: Calendar,
  boolean: CheckSquare,
  select: List,
  multi_select: List,
  url: Link2,
  email: Mail,
  phone: Phone,
};

function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export function CollectionRecordDetail({
  record,
  fields,
  onCellChange,
  onAddField,
  onNavigateToFields,
}: CollectionRecordDetailProps) {
  const activeFields = useMemo(
    () => fields.filter((f) => f.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [fields],
  );

  const titleField = activeFields.find((f) => f.is_title_field);
  const nonTitleFields = activeFields.filter((f) => !f.is_title_field);
  const titleValue = titleField
    ? (record.values[titleField.field_key] as string) ?? ""
    : "";
  const [titleDraft, setTitleDraft] = useState(titleValue);
  const titleRef = useRef<HTMLInputElement>(null);
  const [showAddField, setShowAddField] = useState(false);
  const didAutoFocus = useRef(false);

  const existingKeys = useMemo(
    () => new Set(activeFields.map((f) => f.field_key)),
    [activeFields],
  );

  useEffect(() => {
    setTitleDraft(titleValue);
  }, [titleValue]);

  useEffect(() => {
    if (!didAutoFocus.current && !titleValue && titleRef.current) {
      titleRef.current.focus();
      didAutoFocus.current = true;
    }
  }, [titleValue]);

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (titleField && trimmed !== titleValue) {
      onCellChange(titleField.field_key, trimmed);
    }
  }

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <input
          ref={titleRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTitle();
              titleRef.current?.blur();
            }
          }}
          placeholder="Untitled"
          className="w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground/30 outline-none border-none focus:ring-0"
        />
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground/60">
          <span>
            Created {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
          </span>
          {record.updated_at !== record.created_at && (
            <>
              <span className="text-muted-foreground/20">·</span>
              <span>
                Updated {formatDistanceToNow(new Date(record.updated_at), { addSuffix: true })}
              </span>
            </>
          )}
          {record.archived_at && (
            <>
              <span className="text-muted-foreground/20">·</span>
              <span className="text-status-warning/80">Archived</span>
            </>
          )}
        </div>
      </div>

      {/* Fields */}
      {nonTitleFields.length > 0 ? (
        <div className="space-y-0.5">
          {nonTitleFields.map((field) => (
            <div
              key={field.id}
              className="group grid grid-cols-1 sm:grid-cols-[160px_1fr] items-start gap-1 sm:gap-3 rounded-md px-2 py-1.5 -mx-1 hover:bg-accent/30 transition-colors"
            >
              <span className="text-[13px] text-muted-foreground/70 group-hover:text-muted-foreground truncate py-1 transition-colors">
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </span>
              <div className="min-w-0">
                <CollectionCell
                  field={field}
                  value={record.values[field.field_key]}
                  onChange={(value) => onCellChange(field.field_key, value)}
                />
              </div>
            </div>
          ))}

          {/* Add field row */}
          {onAddField && (
            <button
              type="button"
              onClick={() => setShowAddField(true)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 -mx-1 text-[12px] text-muted-foreground/40 transition-colors hover:text-muted-foreground hover:bg-accent/30"
            >
              <Plus className="h-3 w-3" />
              <span>Add field</span>
            </button>
          )}
        </div>
      ) : (
        /* Empty state — no fields beyond title */
        <div className="rounded-lg border border-dashed border-border/60 px-5 py-6">
          <div className="text-[13px] font-medium text-foreground">Add fields to this collection</div>
          <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed max-w-md">
            Fields define what data each record holds — text, dates, status dropdowns, URLs, and more.
            You can also create board and calendar views once you have fields set up.
          </p>

          {onAddField ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {QUICK_FIELD_SUGGESTIONS.filter((s) => !existingKeys.has(slugifyKey(s.label))).map((s) => {
                const Icon = FIELD_TYPE_ICONS[s.type] ?? Type;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() =>
                      onAddField({
                        field_key: slugifyKey(s.label),
                        field_type: s.type,
                        label: s.label,
                        required: false,
                        options: s.options,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground"
                  >
                    <Icon className="h-3 w-3" />
                    {s.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowAddField(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border/60 px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                Custom field
              </button>
            </div>
          ) : onNavigateToFields ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 h-8 gap-1.5 text-xs"
              onClick={onNavigateToFields}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage Fields
            </Button>
          ) : null}
        </div>
      )}

      {/* Inline add field dialog */}
      {onAddField && (
        <InlineAddFieldDialog
          open={showAddField}
          onClose={() => setShowAddField(false)}
          onAdd={(input) => {
            onAddField(input);
            setShowAddField(false);
          }}
          existingKeys={existingKeys}
        />
      )}
    </div>
  );
}

const QUICK_FIELD_SUGGESTIONS: { label: string; type: CollectionFieldType; options?: FieldOptions }[] = [
  { label: "Status", type: "select", options: { choices: [
    { value: "todo", label: "To Do", color: "#6b7280" },
    { value: "in_progress", label: "In Progress", color: "#3b82f6" },
    { value: "done", label: "Done", color: "#22c55e" },
  ]}},
  { label: "Due Date", type: "date" },
  { label: "Description", type: "text" },
  { label: "URL", type: "url" },
  { label: "Email", type: "email" },
  { label: "Notes", type: "text" },
];

function InlineAddFieldDialog({
  open,
  onClose,
  onAdd,
  existingKeys,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (input: {
    field_key: string;
    field_type: CollectionFieldType;
    label: string;
    required?: boolean;
    options?: FieldOptions;
  }) => void;
  existingKeys: Set<string>;
}) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CollectionFieldType>("text");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState<SelectOption[]>([]);

  const needsOptions = type === "select" || type === "multi_select";
  const availablePresets = QUICK_FIELD_SUGGESTIONS.filter(
    (s) => !existingKeys.has(slugifyKey(s.label)),
  );

  function reset() {
    setLabel("");
    setType("text");
    setRequired(false);
    setOptions([]);
  }

  function handleAdd() {
    if (!label.trim()) return;
    const fieldOptions: FieldOptions | undefined =
      needsOptions && options.length > 0
        ? {
            choices: options
              .filter((o) => o.label)
              .map((o) => ({
                value: o.value || slugifyKey(o.label),
                label: o.label,
                color: o.color,
              })),
          }
        : undefined;

    onAdd({
      field_key: slugifyKey(label),
      field_type: type,
      label: label.trim(),
      required,
      options: fieldOptions,
    });
    reset();
  }

  function handlePreset(s: (typeof QUICK_FIELD_SUGGESTIONS)[number]) {
    onAdd({
      field_key: slugifyKey(s.label),
      field_type: s.type,
      label: s.label,
      required: false,
      options: s.options,
    });
    reset();
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Add Field</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          {availablePresets.length > 0 && (
            <div className="space-y-2">
              <span className="text-[12px] text-muted-foreground">Quick add</span>
              <div className="flex flex-wrap gap-1.5">
                {availablePresets.map((s) => {
                  const Icon = FIELD_TYPE_ICONS[s.type] ?? Type;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => handlePreset(s)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-accent/40 hover:text-foreground"
                    >
                      <Icon className="h-3 w-3" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {availablePresets.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[11px] text-muted-foreground/60">or create custom</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Priority" autoFocus={availablePresets.length === 0} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CollectionFieldType)}>
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
                              idx === i ? { ...o, label: e.target.value, value: slugifyKey(e.target.value) } : o,
                            ),
                          )
                        }
                        placeholder="Label"
                        className="h-7 flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                      >
                        <Plus className="h-3 w-3 rotate-45" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setOptions([...options, { value: "", label: "", color: "#6b7280" }])}
                >
                  <Plus className="h-3 w-3" />
                  Add option
                </Button>
              </div>
            )}
            <label className="flex items-center gap-2 text-[13px]">
              <Switch checked={required} onCheckedChange={setRequired} />
              Required
            </label>
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!label.trim()}>Add Field</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
