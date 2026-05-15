"use client";

import { useState, useCallback, useMemo } from "react";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { FIELD_TYPE_LABELS } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Plus, X } from "lucide-react";

export interface FilterCondition {
  id: string;
  fieldKey: string;
  operator: string;
  value: string;
}

const OPERATORS: Record<string, { label: string; types: string[] }[]> = {
  text: [
    { label: "contains", types: ["text", "email", "phone", "url", "rich_text"] },
    { label: "equals", types: ["text", "email", "phone", "url", "rich_text"] },
    { label: "is empty", types: ["text", "email", "phone", "url", "rich_text"] },
    { label: "is not empty", types: ["text", "email", "phone", "url", "rich_text"] },
  ],
  number: [
    { label: "=", types: ["number"] },
    { label: ">", types: ["number"] },
    { label: "<", types: ["number"] },
    { label: "is empty", types: ["number"] },
  ],
  select: [
    { label: "is", types: ["select"] },
    { label: "is not", types: ["select"] },
    { label: "is empty", types: ["select"] },
  ],
  multi_select: [
    { label: "contains", types: ["multi_select"] },
    { label: "is empty", types: ["multi_select"] },
  ],
  boolean: [
    { label: "is true", types: ["boolean"] },
    { label: "is false", types: ["boolean"] },
  ],
  date: [
    { label: "is", types: ["date", "datetime"] },
    { label: "before", types: ["date", "datetime"] },
    { label: "after", types: ["date", "datetime"] },
    { label: "is empty", types: ["date", "datetime"] },
  ],
};

function getOperatorsForType(fieldType: string): { label: string }[] {
  for (const ops of Object.values(OPERATORS)) {
    const matching = ops.filter((o) => o.types.includes(fieldType));
    if (matching.length > 0) return matching;
  }
  return OPERATORS.text;
}

function needsValue(operator: string): boolean {
  return !["is empty", "is not empty", "is true", "is false"].includes(operator);
}

let nextId = 0;

export function useCollectionFilters() {
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const addCondition = useCallback((fieldKey: string, operator: string) => {
    setConditions((prev) => [
      ...prev,
      { id: `f-${++nextId}`, fieldKey, operator, value: "" },
    ]);
  }, []);

  const updateCondition = useCallback((id: string, updates: Partial<FilterCondition>) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  }, []);

  const removeCondition = useCallback((id: string) => {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => setConditions([]), []);

  const applyFilters = useCallback(
    (records: CollectionRecord[], fields: CollectionField[]): CollectionRecord[] => {
      if (conditions.length === 0) return records;

      return records.filter((record) =>
        conditions.every((cond) => {
          const field = fields.find((f) => f.field_key === cond.fieldKey);
          if (!field) return true;
          const val = record.values[cond.fieldKey];

          switch (cond.operator) {
            case "is empty":
              return val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0);
            case "is not empty":
              return val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
            case "is true":
              return val === true;
            case "is false":
              return !val;
            case "contains":
              if (Array.isArray(val)) return val.includes(cond.value);
              return String(val ?? "").toLowerCase().includes(cond.value.toLowerCase());
            case "equals":
              return String(val ?? "").toLowerCase() === cond.value.toLowerCase();
            case "is":
              if (field.field_type === "date" || field.field_type === "datetime") {
                return String(val ?? "").startsWith(cond.value);
              }
              return val === cond.value;
            case "is not":
              return val !== cond.value;
            case "=":
              return Number(val) === Number(cond.value);
            case ">":
              return Number(val) > Number(cond.value);
            case "<":
              return Number(val) < Number(cond.value);
            case "before":
              return val != null && String(val) < cond.value;
            case "after":
              return val != null && String(val) > cond.value;
            default:
              return true;
          }
        }),
      );
    },
    [conditions],
  );

  return { conditions, addCondition, updateCondition, removeCondition, clearAll, applyFilters };
}

interface CollectionFilterBarProps {
  fields: CollectionField[];
  conditions: FilterCondition[];
  onAdd: (fieldKey: string, operator: string) => void;
  onUpdate: (id: string, updates: Partial<FilterCondition>) => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export function CollectionFilterBar({
  fields,
  conditions,
  onAdd,
  onUpdate,
  onRemove,
  onClearAll,
}: CollectionFilterBarProps) {
  const [open, setOpen] = useState(false);
  const filterableFields = useMemo(
    () => fields.filter((f) => f.is_active && !f.is_title_field),
    [fields],
  );

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={conditions.length > 0 ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
          >
            <Filter className="h-3 w-3" />
            Filter
            {conditions.length > 0 && (
              <span className="ml-0.5 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                {conditions.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start">
          <div className="space-y-2">
            {conditions.length === 0 && (
              <p className="text-[12px] text-muted-foreground py-1">
                No filters applied. Add a condition to narrow down records.
              </p>
            )}
            {conditions.map((cond) => {
              const field = fields.find((f) => f.field_key === cond.fieldKey);
              if (!field) return null;
              const operators = getOperatorsForType(field.field_type);
              const showValue = needsValue(cond.operator);
              const isSelect = field.field_type === "select" || field.field_type === "multi_select";
              const choices = field.options?.choices ?? [];

              return (
                <div key={cond.id} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground shrink-0 w-16 truncate" title={field.label}>
                    {field.label}
                  </span>
                  <Select
                    value={cond.operator}
                    onValueChange={(v) => onUpdate(cond.id, { operator: v, value: "" })}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-24 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      {operators.map((op) => (
                        <SelectItem key={op.label} value={op.label}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {showValue && (
                    isSelect ? (
                      <Select
                        value={cond.value || "__pick__"}
                        onValueChange={(v) => onUpdate(cond.id, { value: v === "__pick__" ? "" : v })}
                      >
                        <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0">
                          <SelectValue placeholder="Pick..." />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          <SelectItem value="__pick__" disabled>
                            <span className="text-muted-foreground">Pick...</span>
                          </SelectItem>
                          {choices.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              <span className="flex items-center gap-1.5">
                                {c.color && (
                                  <span
                                    className="inline-block h-2 w-2 rounded-full"
                                    style={{ backgroundColor: c.color }}
                                  />
                                )}
                                {c.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.field_type === "date" || field.field_type === "datetime" ? (
                      <Input
                        type="date"
                        value={cond.value}
                        onChange={(e) => onUpdate(cond.id, { value: e.target.value })}
                        className="h-7 text-[11px] flex-1 min-w-0"
                      />
                    ) : (
                      <Input
                        value={cond.value}
                        onChange={(e) => onUpdate(cond.id, { value: e.target.value })}
                        placeholder="Value..."
                        className="h-7 text-[11px] flex-1 min-w-0"
                      />
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(cond.id)}
                    className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}

            {/* Add filter row */}
            <AddFilterRow fields={filterableFields} onAdd={onAdd} />

            {conditions.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter pills */}
      {conditions.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto">
          {conditions.map((cond) => {
            const field = fields.find((f) => f.field_key === cond.fieldKey);
            if (!field) return null;
            const isSelect = field.field_type === "select" || field.field_type === "multi_select";
            const choice = isSelect ? field.options?.choices?.find((c) => c.value === cond.value) : null;
            const displayValue = choice ? choice.label : cond.value;

            return (
              <button
                key={cond.id}
                type="button"
                onClick={() => onRemove(cond.id)}
                className="group inline-flex items-center gap-1 rounded-md bg-accent/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent transition-colors shrink-0"
              >
                <span className="font-medium text-foreground">{field.label}</span>
                <span>{cond.operator}</span>
                {needsValue(cond.operator) && displayValue && (
                  <span className="text-foreground">{displayValue}</span>
                )}
                <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddFilterRow({
  fields,
  onAdd,
}: {
  fields: CollectionField[];
  onAdd: (fieldKey: string, operator: string) => void;
}) {
  const [pickingField, setPickingField] = useState(false);

  if (!pickingField) {
    return (
      <button
        type="button"
        onClick={() => setPickingField(true)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors pt-1"
      >
        <Plus className="h-3 w-3" />
        Add filter
      </button>
    );
  }

  return (
    <div className="pt-1">
      <Select
        value=""
        onValueChange={(fieldKey) => {
          const field = fields.find((f) => f.field_key === fieldKey);
          if (!field) return;
          const ops = getOperatorsForType(field.field_type);
          onAdd(fieldKey, ops[0]?.label ?? "contains");
          setPickingField(false);
        }}
      >
        <SelectTrigger className="h-7 text-[11px]" autoFocus>
          <SelectValue placeholder="Choose field..." />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4}>
          {fields.map((f) => (
            <SelectItem key={f.field_key} value={f.field_key}>
              <span className="flex items-center gap-2">
                {f.label}
                <span className="text-[10px] text-muted-foreground">{FIELD_TYPE_LABELS[f.field_type]}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
