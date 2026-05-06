"use client";

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionField, CollectionRecord, ViewConfig } from "@/lib/collections/types";
import { CollectionCell } from "./collection-cell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ArrowUpDown, MoreHorizontal, Plus, Trash2, Archive } from "lucide-react";

interface CollectionTableViewProps {
  records: CollectionRecord[];
  fields: CollectionField[];
  viewConfig: ViewConfig;
  onCellChange: (recordId: string, fieldKey: string, value: unknown) => void;
  onAddRecord: () => void;
  onArchiveRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
  onRecordClick?: (recordId: string) => void;
}

export function CollectionTableView({
  records,
  fields,
  viewConfig,
  onCellChange,
  onAddRecord,
  onArchiveRecord,
  onDeleteRecord,
  onRecordClick,
}: CollectionTableViewProps) {
  const mobile = useIsMobile();

  const [sorting, setSorting] = useState<SortingState>(() => {
    if (viewConfig.sort_field) {
      return [{ id: viewConfig.sort_field, desc: viewConfig.sort_direction === "desc" }];
    }
    return [];
  });

  const activeFields = useMemo(
    () =>
      fields
        .filter((f) => f.is_active && !viewConfig.hidden_fields?.includes(f.field_key))
        .sort((a, b) => a.sort_order - b.sort_order),
    [fields, viewConfig.hidden_fields],
  );

  const columns = useMemo<ColumnDef<CollectionRecord>[]>(() => {
    const cols: ColumnDef<CollectionRecord>[] = activeFields.map((field) => ({
      id: field.field_key,
      accessorFn: (row: CollectionRecord) => row.values[field.field_key],
      header: ({ column }) => (
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
          onClick={() => column.toggleSorting()}
        >
          {field.label}
          {column.getIsSorted() && (
            <ArrowUpDown className="h-3 w-3" />
          )}
        </button>
      ),
      cell: ({ row }) =>
        field.is_title_field ? (
          <button
            type="button"
            className="w-full text-left text-body font-medium truncate px-1.5 py-0.5 rounded hover:text-foreground min-h-[28px] flex items-center"
            onClick={() => onRecordClick?.(row.original.id)}
          >
            {(row.original.values[field.field_key] as string) || (
              <span className="text-muted-foreground font-normal">Untitled</span>
            )}
          </button>
        ) : (
          <CollectionCell
            field={field}
            value={row.original.values[field.field_key]}
            onChange={(value) => onCellChange(row.original.id, field.field_key, value)}
          />
        ),
      size: viewConfig.field_widths?.[field.field_key] ?? (field.is_title_field ? 240 : 160),
      meta: { isTitleField: field.is_title_field },
    }));

    cols.push({
      id: "_actions",
      header: () => null,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover/row:opacity-100">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRecordClick && (
              <>
                <DropdownMenuItem onClick={() => onRecordClick(row.original.id)}>
                  Open
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onArchiveRecord(row.original.id)}>
              <Archive className="mr-2 h-3.5 w-3.5" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDeleteRecord(row.original.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 40,
    });

    return cols;
  }, [activeFields, viewConfig.field_widths, onCellChange, onArchiveRecord, onDeleteRecord, onRecordClick]);

  const table = useReactTable({
    data: records,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (mobile) {
    const titleField = activeFields.find((f) => f.is_title_field);
    const detailFields = activeFields.filter((f) => !f.is_title_field).slice(0, 4);

    return (
      <div className="space-y-2">
        {records.map((record) => (
          <button
            key={record.id}
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors active:bg-accent/50"
            onClick={() => onRecordClick?.(record.id)}
          >
            <div className="flex-1 min-w-0 space-y-1.5">
              <span className="text-sm font-medium truncate block">
                {titleField
                  ? (record.values[titleField.field_key] as string) || "Untitled"
                  : "Untitled"}
              </span>
              {detailFields.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {detailFields.map((field) => {
                    const val = record.values[field.field_key];
                    if (val == null || val === "") return null;
                    return (
                      <span key={field.field_key}>
                        <span className="text-muted-foreground/60">{field.label}:</span>{" "}
                        {String(val)}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {onRecordClick && (
                  <>
                    <DropdownMenuItem onClick={() => onRecordClick(record.id)}>
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
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
          </button>
        ))}
        <button
          type="button"
          onClick={onAddRecord}
          className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border/50 px-3 py-2.5 text-body text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          New record
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border/50">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-2 py-1.5 text-left font-normal"
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="group/row border-b border-border/30 transition-colors hover:bg-accent/30"
            >
              {row.getVisibleCells().map((cell) => {
                const isTitleField = (cell.column.columnDef.meta as { isTitleField?: boolean })?.isTitleField;
                return (
                  <td
                    key={cell.id}
                    className={cn("px-2 py-0.5", isTitleField && "cursor-pointer")}
                    onClick={isTitleField ? undefined : (e) => e.stopPropagation()}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add row button */}
      <button
        type="button"
        onClick={onAddRecord}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-body text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        New record
      </button>
    </div>
  );
}
