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
      cell: ({ row }) => (
        <CollectionCell
          field={field}
          value={row.original.values[field.field_key]}
          onChange={(value) => onCellChange(row.original.id, field.field_key, value)}
        />
      ),
      size: viewConfig.field_widths?.[field.field_key] ?? (field.is_title_field ? 240 : 160),
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
              className={cn(
                "group/row border-b border-border/30 transition-colors hover:bg-accent/30",
                onRecordClick && "cursor-pointer",
              )}
              onDoubleClick={() => onRecordClick?.(row.original.id)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-2 py-0.5">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
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
