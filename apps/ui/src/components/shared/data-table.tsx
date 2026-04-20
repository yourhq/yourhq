"use client";

import * as React from "react";
import {
  flexRender,
  type Table as TanstackTable,
  type Row,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ColumnMeta {
  className?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<TData> {
  table: TanstackTable<TData>;
  onRowClick?: (row: Row<TData>) => void;
  rowClassName?: (row: Row<TData>) => string | undefined;
  isLoading?: boolean;
  loadingRows?: number;
  emptyState?: React.ReactNode;
  stickyHeader?: boolean;
  className?: string;
  rowHeight?: "compact" | "normal" | "comfortable";
}

export function DataTable<TData>({
  table,
  onRowClick,
  rowClassName,
  isLoading,
  loadingRows = 8,
  emptyState,
  stickyHeader = true,
  className,
  rowHeight = "normal",
}: DataTableProps<TData>) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  const rowPadding =
    rowHeight === "compact"
      ? "py-2"
      : rowHeight === "comfortable"
        ? "py-3.5"
        : "py-2.5";

  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-md border border-border/60 bg-card",
        className
      )}
    >
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-b-0 hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as
                  | ColumnMeta
                  | undefined;
                return (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn(
                      "h-9 border-b border-border/70 bg-card/95 px-3 text-label font-medium backdrop-blur",
                      stickyHeader && "sticky top-0 z-10",
                      meta?.align === "right" && "text-right",
                      meta?.align === "center" && "text-center",
                      meta?.className
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: loadingRows }).map((_, i) => (
              <TableRow
                key={`skeleton-${i}`}
                className="border-0 hover:bg-transparent"
              >
                {Array.from({ length: columnCount }).map((__, j) => (
                  <TableCell
                    key={j}
                    className="border-b border-border/40 px-3 py-3"
                  >
                    <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="border-0 hover:bg-transparent">
              <TableCell
                colSpan={columnCount}
                className="border-0 p-0"
              >
                {emptyState ?? (
                  <div className="flex h-40 items-center justify-center text-caption">
                    No results
                  </div>
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const isSelected = row.getIsSelected();
              return (
                <TableRow
                  key={row.id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "group/row border-0 transition-colors",
                    "hover:bg-accent/60",
                    isSelected && "bg-accent",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row)
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as
                      | ColumnMeta
                      | undefined;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "border-b border-border/40 px-3 text-body",
                          rowPadding,
                          meta?.align === "right" && "text-right",
                          meta?.align === "center" && "text-center",
                          meta?.className
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
