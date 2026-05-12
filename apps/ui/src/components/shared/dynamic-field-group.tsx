"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FieldDefinition } from "@/lib/fields/types";
import { DynamicFieldRow } from "./dynamic-field";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface DynamicFieldGroupProps {
  group: string;
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  defaultOpen?: boolean;
  inDialog?: boolean;
}

export function DynamicFieldGroup({
  group,
  fields,
  values,
  onChange,
  defaultOpen = false,
  inDialog = false,
}: DynamicFieldGroupProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const supabase = React.useMemo(() => createClient(), []);

  if (fields.length === 0) return null;

  function handleFieldChange(fieldKey: string, value: unknown) {
    const next = { ...values };
    if (value === null || value === undefined || value === "") {
      delete next[fieldKey];
    } else {
      next[fieldKey] = value;
    }
    onChange(next);
  }

  function handlePersistOptions(fieldId: string, options: string[]) {
    supabase
      .from("field_definitions")
      .update({ options })
      .eq("id", fieldId)
      .then();
  }

  const filledCount = fields.filter(
    (f) => values[f.field_key] !== undefined && values[f.field_key] !== null
  ).length;

  return (
    <div className="rounded-md border border-border/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent/40",
          open && "border-b border-border/50"
        )}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="flex-1 text-left capitalize">{group}</span>
        {filledCount > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {filledCount}/{fields.length}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 p-3">
          {fields.map((field) => (
            <DynamicFieldRow
              key={field.id}
              field={field}
              value={values[field.field_key]}
              onChange={(v) => handleFieldChange(field.field_key, v)}
              onPersistOptions={handlePersistOptions}
              inDialog={inDialog}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DynamicFieldGroupsProps {
  groupedFields: { group: string; fields: FieldDefinition[] }[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  inDialog?: boolean;
  openByDefault?: string[];
}

export function DynamicFieldGroups({
  groupedFields,
  values,
  onChange,
  inDialog,
  openByDefault = [],
}: DynamicFieldGroupsProps) {
  if (groupedFields.length === 0) return null;

  return (
    <div className="space-y-2">
      {groupedFields.map(({ group, fields }) => (
        <DynamicFieldGroup
          key={group}
          group={group}
          fields={fields}
          values={values}
          onChange={onChange}
          defaultOpen={openByDefault.includes(group)}
          inDialog={inDialog}
        />
      ))}
    </div>
  );
}
