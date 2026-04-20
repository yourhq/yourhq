import { FieldDefinition } from "@/lib/fields/types";
import { ColumnConfig } from "./types";
import { formatDistanceToNow } from "date-fns";

export function buildExtendedColumnConfigs<
  T extends { extended: Record<string, unknown> },
>(fields: FieldDefinition[]): ColumnConfig<T>[] {
  return fields
    .filter((f) => f.is_active)
    .map((field) => ({
      id: `ext_${field.field_key}`,
      label: field.label,
      defaultVisible: false,
      group: "custom" as const,
      columnDef: {
        id: `ext_${field.field_key}`,
        accessorFn: (row: T) => row.extended?.[field.field_key],
        header: () => (
          <span className="text-label">{field.label}</span>
        ),
        cell: ({ getValue }: { getValue: () => unknown }) =>
          renderFieldCell(field, getValue()),
        enableSorting: false,
      },
    }));
}

function renderFieldCell(field: FieldDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  switch (field.field_type) {
    case "boolean":
      return (
        <span className="text-[12px] text-muted-foreground">
          {value ? "Yes" : "No"}
        </span>
      );

    case "number":
      return (
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {String(value)}
        </span>
      );

    case "date": {
      const d = typeof value === "string" ? new Date(value) : null;
      if (!d || isNaN(d.getTime())) return null;
      return (
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {formatDistanceToNow(d, { addSuffix: true })}
        </span>
      );
    }

    case "url":
      return (
        <span className="truncate text-[12px] text-muted-foreground">
          {String(value).replace(/^https?:\/\//, "")}
        </span>
      );

    case "multiselect": {
      const items = Array.isArray(value) ? value : [];
      if (items.length === 0) return null;
      return (
        <div className="flex flex-wrap items-center gap-1">
          {items.slice(0, 2).map((t: string) => (
            <span
              key={t}
              className="inline-flex h-5 items-center rounded bg-muted/60 px-1.5 text-[11px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
          {items.length > 2 && (
            <span className="text-[11px] text-muted-foreground">
              +{items.length - 2}
            </span>
          )}
        </div>
      );
    }

    default:
      return (
        <span className="truncate text-[12px] text-muted-foreground">
          {String(value)}
        </span>
      );
  }
}
