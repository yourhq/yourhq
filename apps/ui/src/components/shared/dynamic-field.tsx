"use client";

import * as React from "react";
import type { FieldDefinition } from "@/lib/fields/types";
import { FIELD_TYPE_ICONS } from "@/lib/fields/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { DatePickerButton } from "@/components/ui/date-picker-button";
import { SelectFieldPicker } from "@/components/shared/select-field-picker";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DynamicFieldProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onPersistOptions?: (fieldId: string, options: string[]) => void;
  inDialog?: boolean;
  className?: string;
}

function TextFieldInput({
  field,
  value,
  onChange,
  type = "text",
  className,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  type?: "text" | "url";
  className?: string;
}) {
  const [draft, setDraft] = React.useState(typeof value === "string" ? value : "");

  React.useEffect(() => {
    setDraft(typeof value === "string" ? value : "");
  }, [value]);

  return (
    <Input
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onChange(draft || null)}
      placeholder={field.description ?? undefined}
      className={cn("h-9 text-sm", className)}
    />
  );
}

function NumberFieldInput({
  field,
  value,
  onChange,
  className,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  className?: string;
}) {
  const initial = typeof value === "number" ? String(value) : value ? String(value) : "";
  const [draft, setDraft] = React.useState(initial);

  React.useEffect(() => {
    const next = typeof value === "number" ? String(value) : value ? String(value) : "";
    setDraft(next);
  }, [value]);

  return (
    <Input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onChange(draft === "" ? null : Number(draft))}
      placeholder={field.description ?? undefined}
      className={cn("h-9 text-sm", className)}
    />
  );
}

function TextareaFieldInput({
  field,
  value,
  onChange,
  className,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(typeof value === "string" ? value : "");

  React.useEffect(() => {
    setDraft(typeof value === "string" ? value : "");
  }, [value]);

  return (
    <Textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onChange(draft || null)}
      placeholder={field.description ?? undefined}
      className={cn("min-h-[80px] text-sm", className)}
    />
  );
}

export function DynamicField({
  field,
  value,
  onChange,
  onPersistOptions,
  inDialog = false,
  className,
}: DynamicFieldProps) {
  const portal = !inDialog;

  switch (field.field_type) {
    case "text":
      return <TextFieldInput field={field} value={value} onChange={onChange} className={className} />;

    case "url":
      return <TextFieldInput field={field} value={value} onChange={onChange} type="url" className={className} />;

    case "number":
      return <NumberFieldInput field={field} value={value} onChange={onChange} className={className} />;

    case "textarea":
      return <TextareaFieldInput field={field} value={value} onChange={onChange} className={className} />;

    case "boolean": {
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={value === true}
            onCheckedChange={(v) => onChange(v)}
          />
          <span className="text-xs text-muted-foreground">
            {value === true ? "Yes" : "No"}
          </span>
        </div>
      );
    }

    case "select": {
      const current = typeof value === "string" ? value : null;
      return (
        <SelectFieldPicker
          field={field}
          value={current}
          onValueChange={(v) => onChange(v)}
          className={className}
        />
      );
    }

    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const knownOptions = field.options ?? [];

      function handleMultiselectChange(newValues: string[]) {
        onChange(newValues.length > 0 ? newValues : null);
        if (onPersistOptions) {
          const novel = newValues.filter((v) => !knownOptions.includes(v));
          if (novel.length > 0) {
            onPersistOptions(field.id, [...knownOptions, ...novel]);
          }
        }
      }

      return (
        <TagInput
          value={arr}
          onChange={handleMultiselectChange}
          suggestions={knownOptions}
          placeholder={field.description ?? "Add..."}
          className={className}
        />
      );
    }

    case "date": {
      return (
        <DatePickerButton
          value={typeof value === "string" ? value : null}
          onChange={(v) => onChange(v)}
          placeholder={field.description ?? "Pick a date"}
          portal={portal}
          className={className}
        />
      );
    }

    default:
      return null;
  }
}

interface DynamicFieldRowProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  onPersistOptions?: (fieldId: string, options: string[]) => void;
  inDialog?: boolean;
}

export function DynamicFieldRow({
  field,
  value,
  onChange,
  onPersistOptions,
  inDialog,
}: DynamicFieldRowProps) {
  const Icon = FIELD_TYPE_ICONS[field.field_type];

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        {field.label}
        {field.required && <span className="ml-0.5 text-status-error">*</span>}
      </Label>
      <DynamicField
        field={field}
        value={value}
        onChange={onChange}
        onPersistOptions={onPersistOptions}
        inDialog={inDialog}
      />
      {field.description && field.field_type !== "text" && field.field_type !== "textarea" && (
        <p className="text-[11px] text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
}
