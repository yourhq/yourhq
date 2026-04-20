"use client";

import { FIELD_TEMPLATES } from "@/lib/setup/templates";
import { cn } from "@/lib/utils";

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Long text",
  number: "Number",
  boolean: "Yes/No",
  url: "URL",
  select: "Select",
  multiselect: "Multi-select",
  date: "Date",
};

interface Props {
  selectedKey: string;
  onSelect: (key: string) => void;
}

export function StepFields({ selectedKey, onSelect }: Props) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-foreground">
          Add custom fields
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Pre-built field sets for your contacts. Add more or edit in settings later.
        </p>
      </div>

      <div className="space-y-1">
        {FIELD_TEMPLATES.map((template) => {
          const isSelected = selectedKey === template.key;
          return (
            <button
              key={template.key}
              type="button"
              onClick={() => onSelect(template.key)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors outline-none",
                isSelected
                  ? "border-foreground/30 bg-muted/40"
                  : "border-border/30 hover:bg-muted/20"
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-base">
                {template.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {template.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {template.description}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {template.fields.map((field) => (
                    <span
                      key={field.field_key}
                      className="rounded border border-border/30 bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {field.label}
                      <span className="ml-1 text-muted-foreground/40">
                        {FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
