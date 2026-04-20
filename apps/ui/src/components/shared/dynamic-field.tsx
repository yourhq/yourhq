"use client";

import * as React from "react";
import type { FieldDefinition } from "@/lib/fields/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { DatePickerButton } from "@/components/ui/date-picker-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DynamicFieldProps {
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Render inside a Dialog? If true, Select/Popover skip portaling. */
  inDialog?: boolean;
  className?: string;
}

/**
 * Renders the right input component for a FieldDefinition, based on
 * `field_type`. Reads/writes raw values — parent owns the `extended` map.
 */
export function DynamicField({
  field,
  value,
  onChange,
  inDialog = false,
  className,
}: DynamicFieldProps) {
  const portal = !inDialog;

  switch (field.field_type) {
    case "text":
    case "url": {
      return (
        <Input
          type={field.field_type === "url" ? "url" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={field.description ?? undefined}
          className={cn("h-9 text-sm", className)}
        />
      );
    }

    case "number": {
      const num = typeof value === "number" ? value : value ? Number(value) : "";
      return (
        <Input
          type="number"
          value={num}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : Number(v));
          }}
          placeholder={field.description ?? undefined}
          className={cn("h-9 text-sm", className)}
        />
      );
    }

    case "textarea": {
      return (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={field.description ?? undefined}
          className={cn("min-h-[80px] text-sm", className)}
        />
      );
    }

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
      const options = field.options ?? [];
      const current = typeof value === "string" ? value : "";
      return (
        <Select
          value={current || undefined}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger className={cn("h-9 text-sm", className)}>
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}...`} />
          </SelectTrigger>
          <SelectContent portal={portal}>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "multiselect": {
      // Use TagInput for free-form tag-style multiselect.
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <TagInput
          value={arr}
          onChange={(v) => onChange(v.length > 0 ? v : null)}
          suggestions={field.options ?? undefined}
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
  inDialog?: boolean;
}

/**
 * A label + input pair for a FieldDefinition. The standard "one field per row"
 * layout used in forms.
 */
export function DynamicFieldRow({
  field,
  value,
  onChange,
  inDialog,
}: DynamicFieldRowProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {field.label}
        {field.required && <span className="ml-0.5 text-red-400">*</span>}
      </Label>
      <DynamicField
        field={field}
        value={value}
        onChange={onChange}
        inDialog={inDialog}
      />
      {field.description && field.field_type !== "text" && field.field_type !== "textarea" && (
        <p className="text-[11px] text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
}
