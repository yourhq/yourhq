"use client";

import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
} from "@tanstack/react-table";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  ColumnMapping,
  DuplicateStrategy,
  ValidatedRow,
} from "@/lib/import/types";

interface PreviewStepProps {
  rows: ValidatedRow[];
  mappings: ColumnMapping[];
  duplicateCount: number;
  duplicateStrategy: DuplicateStrategy;
  onDuplicateStrategyChange: (strategy: DuplicateStrategy) => void;
}

const MAX_PREVIEW_ROWS = 50;

export function PreviewStep({
  rows,
  mappings,
  duplicateCount,
  duplicateStrategy,
  onDuplicateStrategyChange,
}: PreviewStepProps) {
  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);

  const validCount = rows.filter((r) => r.isValid).length;
  const errorCount = rows.filter((r) => !r.isValid).length;
  const warningCount = rows.filter(
    (r) => r.isValid && r.errors.length > 0
  ).length;

  const activeMappings = mappings.filter((m) => m.destinationField !== null);

  // Build columns from active mappings
  const columns = useMemo<ColumnDef<ValidatedRow, unknown>[]>(() => {
    const cols: ColumnDef<ValidatedRow, unknown>[] = [
      {
        id: "__row__",
        header: "#",
        size: 48,
        cell: ({ row }) => (
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {row.original.index + 1}
          </span>
        ),
      },
    ];

    for (const mapping of activeMappings) {
      const dest = mapping.destinationField!;
      const label = mapping.isCustomField
        ? dest.replace("extended.", "")
        : dest;

      cols.push({
        id: dest,
        header: label,
        cell: ({ row }) => {
          const vr = row.original;
          let value: unknown;
          if (mapping.isCustomField) {
            const extKey = dest.replace("extended.", "");
            const ext = vr.data.extended as Record<string, unknown> | undefined;
            value = ext?.[extKey];
          } else {
            value = vr.data[dest];
          }

          const cellErrors = vr.errors.filter((e) => {
            if (mapping.isCustomField) {
              return e.field === dest.replace("extended.", "");
            }
            return e.field === dest;
          });

          const hasError = cellErrors.some((e) => e.severity === "error");
          const hasWarning =
            !hasError && cellErrors.some((e) => e.severity === "warning");

          const displayValue =
            value === null || value === undefined
              ? ""
              : Array.isArray(value)
                ? value.join(", ")
                : String(value);

          if (cellErrors.length > 0) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "block max-w-[200px] truncate rounded px-1 text-[12px]",
                      hasError && "bg-destructive/10 text-destructive",
                      hasWarning && "bg-status-warning/10 text-status-warning"
                    )}
                  >
                    {displayValue || "—"}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[250px]">
                  {cellErrors.map((e, i) => (
                    <p key={i} className="text-[11px]">
                      {e.message}
                    </p>
                  ))}
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <span className="block max-w-[200px] truncate text-[12px]">
              {displayValue || (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          );
        },
      });
    }

    return cols;
  }, [activeMappings]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: previewRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-3">
        {/* Summary bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-[12px]">
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
            <span>
              <span className="font-medium text-foreground">{validCount}</span>{" "}
              <span className="text-muted-foreground">ready</span>
            </span>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-1.5 text-[12px]">
              <XCircle className="h-3.5 w-3.5 text-destructive" />
              <span>
                <span className="font-medium text-destructive">
                  {errorCount}
                </span>{" "}
                <span className="text-muted-foreground">
                  {errorCount === 1 ? "error" : "errors"} (will be skipped)
                </span>
              </span>
            </div>
          )}
          {warningCount > 0 && (
            <div className="flex items-center gap-1.5 text-[12px]">
              <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
              <span>
                <span className="font-medium text-status-warning">
                  {warningCount}
                </span>{" "}
                <span className="text-muted-foreground">
                  {warningCount === 1 ? "warning" : "warnings"}
                </span>
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Duplicate strategy */}
          {duplicateCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">
                {duplicateCount} potential{" "}
                {duplicateCount === 1 ? "duplicate" : "duplicates"}
              </span>
              <Select
                value={duplicateStrategy}
                onValueChange={(v) =>
                  onDuplicateStrategyChange(v as DuplicateStrategy)
                }
              >
                <SelectTrigger size="sm" className="min-w-[140px] text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip duplicates</SelectItem>
                  <SelectItem value="overwrite">Overwrite existing</SelectItem>
                  <SelectItem value="create_new">Create as new</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Preview table */}
        <div className="max-h-[340px] overflow-auto rounded-md border border-border/60">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="whitespace-nowrap border-b border-border/60 px-3 py-2 text-left text-[11px] font-medium text-muted-foreground"
                      style={{ width: header.getSize() }}
                    >
                      {typeof header.column.columnDef.header === "string"
                        ? header.column.columnDef.header
                        : header.column.columnDef.header?.(
                            header.getContext()
                          )}
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
                    "border-b border-border/40 last:border-b-0",
                    !row.original.isValid && "bg-destructive/5"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-1.5">
                      {typeof cell.column.columnDef.cell === "function"
                        ? cell.column.columnDef.cell(cell.getContext())
                        : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > MAX_PREVIEW_ROWS && (
          <p className="text-[11px] text-muted-foreground">
            Showing first {MAX_PREVIEW_ROWS} of {rows.length} rows
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
