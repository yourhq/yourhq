"use client";

import { useMemo } from "react";
import type { CollectionField, CollectionRecord, SelectOption } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, MoreHorizontal, Archive, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CollectionKanbanViewProps {
  records: CollectionRecord[];
  fields: CollectionField[];
  groupByFieldKey: string;
  titleField: CollectionField | undefined;
  onCellChange: (recordId: string, fieldKey: string, value: unknown) => void;
  onAddRecord: (defaults?: Record<string, unknown>) => void;
  onArchiveRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
  onRecordClick?: (recordId: string) => void;
}

export function CollectionKanbanView({
  records,
  fields,
  groupByFieldKey,
  titleField,
  onCellChange,
  onAddRecord,
  onArchiveRecord,
  onDeleteRecord,
  onRecordClick,
}: CollectionKanbanViewProps) {
  const groupField = useMemo(
    () => fields.find((f) => f.field_key === groupByFieldKey),
    [fields, groupByFieldKey],
  );

  const columns = useMemo(() => {
    const choices = groupField?.options?.choices ?? [];
    const cols: { value: string; label: string; color?: string; records: CollectionRecord[] }[] =
      choices.map((c) => ({
        value: c.value,
        label: c.label,
        color: c.color,
        records: records.filter((r) => r.values[groupByFieldKey] === c.value),
      }));

    const uncategorized = records.filter((r) => {
      const val = r.values[groupByFieldKey];
      return val === undefined || val === null || val === "";
    });
    if (uncategorized.length > 0) {
      cols.push({ value: "__none__", label: "No Status", records: uncategorized });
    }

    return cols;
  }, [records, groupField, groupByFieldKey]);

  const getTitle = (record: CollectionRecord) => {
    if (!titleField) return "Untitled";
    const val = record.values[titleField.field_key];
    return typeof val === "string" && val ? val : "Untitled";
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 px-1">
      {columns.map((col) => (
        <div
          key={col.value}
          className="flex w-[260px] shrink-0 flex-col rounded-lg border border-border/50 bg-muted/20"
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30">
            {col.color && (
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: col.color }}
              />
            )}
            <span className="text-heading text-[13px] flex-1 truncate">{col.label}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {col.records.length}
            </span>
          </div>

          {/* Cards */}
          <div className="flex-1 space-y-1.5 p-2 overflow-y-auto max-h-[calc(100vh-280px)]">
            {col.records.map((record) => (
              <div
                key={record.id}
                className={cn(
                  "group rounded-md border border-border/50 bg-background p-2.5 transition-colors hover:border-border",
                  onRecordClick && "cursor-pointer",
                )}
                onClick={() => onRecordClick?.(record.id)}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-body font-medium leading-snug">
                    {getTitle(record)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onArchiveRecord(record.id)}>
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDeleteRecord(record.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {/* Add card */}
          <button
            type="button"
            onClick={() =>
              onAddRecord(
                col.value !== "__none__" ? { [groupByFieldKey]: col.value } : undefined,
              )
            }
            className="flex items-center gap-1 px-3 py-2 text-body text-muted-foreground transition-colors hover:text-foreground border-t border-border/30"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      ))}
    </div>
  );
}
