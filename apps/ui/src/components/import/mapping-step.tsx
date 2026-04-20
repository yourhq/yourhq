"use client";

import { useMemo } from "react";
import { ArrowRight, SkipForward } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ColumnMapping, ImportEntityType } from "@/lib/import/types";
import type { FieldDefinition } from "@/lib/fields/types";
import { getDestinationFields } from "@/lib/import/mapping";

interface MappingStepProps {
  headers: string[];
  rawRows: Record<string, string>[];
  mappings: ColumnMapping[];
  entityType: ImportEntityType;
  fieldDefinitions: FieldDefinition[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
}

export function MappingStep({
  headers,
  rawRows,
  mappings,
  entityType,
  fieldDefinitions,
  onMappingsChange,
}: MappingStepProps) {
  const destinationFields = useMemo(
    () => getDestinationFields(entityType, fieldDefinitions),
    [entityType, fieldDefinitions]
  );

  // Group destination fields
  const grouped = useMemo(() => {
    const groups = new Map<string, { key: string; label: string }[]>();
    for (const f of destinationFields) {
      const list = groups.get(f.group) ?? [];
      list.push({ key: f.key, label: f.label });
      groups.set(f.group, list);
    }
    return groups;
  }, [destinationFields]);

  // Fields already mapped (exclude from other dropdowns)
  const usedDestinations = useMemo(
    () => new Set(mappings.map((m) => m.destinationField).filter(Boolean)),
    [mappings]
  );

  const nameIsMapped = mappings.some((m) => m.destinationField === "name");
  const mappedCount = mappings.filter((m) => m.destinationField !== null).length;

  function updateMapping(index: number, destinationField: string | null) {
    const updated = mappings.map((m, i) => {
      if (i !== index) return m;
      return {
        ...m,
        destinationField,
        isCustomField: destinationField?.startsWith("extended.") ?? false,
      };
    });
    onMappingsChange(updated);
  }

  // Get sample values for a source column
  function getSamples(column: string): string[] {
    return rawRows
      .slice(0, 3)
      .map((r) => r[column] ?? "")
      .filter(Boolean);
  }

  return (
    <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-muted-foreground">
            Map source columns to fields.{" "}
            <span className="font-medium text-foreground">Name</span> is required.
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {mappedCount} / {headers.length} mapped
          </p>
        </div>

        {!nameIsMapped && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            The &quot;Name&quot; field must be mapped to continue.
          </div>
        )}

        <div className="max-h-[380px] overflow-y-auto rounded-md border border-border/60">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
                  Source column
                </th>
                <th className="w-8" />
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
                  Maps to
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">
                  Sample values
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => {
                const samples = getSamples(mapping.sourceColumn);
                const isSkipped = mapping.destinationField === null;

                return (
                  <tr
                    key={mapping.sourceColumn}
                    className={cn(
                      "border-b border-border/40 last:border-b-0",
                      isSkipped && "opacity-50"
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-[12px]">
                        {mapping.sourceColumn}
                      </span>
                    </td>
                    <td className="px-1">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={mapping.destinationField ?? "__skip__"}
                          onValueChange={(v) =>
                            updateMapping(index, v === "__skip__" ? null : v)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className={cn(
                              "min-w-[180px] text-[12px]",
                              mapping.destinationField === "name" &&
                                "border-primary/40 bg-primary/5"
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <SkipForward className="h-3 w-3" />
                                Skip
                              </span>
                            </SelectItem>
                            {Array.from(grouped.entries()).map(
                              ([group, fields]) => (
                                <SelectGroup key={group}>
                                  <SelectLabel>{group}</SelectLabel>
                                  {fields.map((f) => (
                                    <SelectItem
                                      key={f.key}
                                      value={f.key}
                                      disabled={
                                        usedDestinations.has(f.key) &&
                                        mapping.destinationField !== f.key
                                      }
                                    >
                                      {f.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {samples.map((s, i) => (
                          <span
                            key={i}
                            className="max-w-[120px] truncate rounded bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </div>
  );
}
