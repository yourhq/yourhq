"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight, Plus, MoreHorizontal, Archive, Trash2 } from "lucide-react";
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

const UNCATEGORIZED = "__none__";

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
  const mobile = useIsMobile();
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

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
      cols.push({ value: UNCATEGORIZED, label: "Not set", records: uncategorized });
    }

    return cols;
  }, [records, groupField, groupByFieldKey]);

  const validColumnValues = useMemo(
    () => new Set(columns.map((c) => c.value)),
    [columns],
  );

  const previewFields = useMemo(
    () =>
      fields
        .filter(
          (f) =>
            f.is_active &&
            f.field_key !== groupByFieldKey &&
            !f.is_title_field &&
            f.field_type !== "boolean" &&
            f.field_type !== "rich_text",
        )
        .sort((a, b) => a.sort_order - b.sort_order)
        .slice(0, 2),
    [fields, groupByFieldKey],
  );

  const getTitle = (record: CollectionRecord) => {
    if (!titleField) return "Untitled";
    const val = record.values[titleField.field_key];
    return typeof val === "string" && val ? val : "Untitled";
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveRecordId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveRecordId(null);
    const { active, over } = event;
    if (!over) return;
    const recordId = String(active.id);
    const targetValue = String(over.id);
    if (!validColumnValues.has(targetValue)) return;
    const record = records.find((r) => r.id === recordId);
    if (!record) return;
    const currentValue = record.values[groupByFieldKey];
    const nextValue = targetValue === UNCATEGORIZED ? null : targetValue;
    if (currentValue === nextValue) return;
    onCellChange(recordId, groupByFieldKey, nextValue);
  };

  const activeRecord = activeRecordId
    ? records.find((r) => r.id === activeRecordId) ?? null
    : null;

  if (mobile) {
    return (
      <div className="space-y-3">
        {columns.map((col) => (
          <Collapsible key={col.value} defaultOpen>
            <CollapsibleTrigger className="flex w-full items-center gap-2 py-1.5 text-left">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
              {col.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
              )}
              <span className="text-sm font-medium">{col.label}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {col.records.length}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 pt-1">
              {col.records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-2 rounded-md border border-border/50 p-2.5 text-left transition-colors active:bg-accent/50"
                  onClick={() => onRecordClick?.(record.id)}
                >
                  <span className="text-body font-medium leading-snug truncate">
                    {getTitle(record)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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
              {col.records.length === 0 && (
                <div className="py-3 text-center text-[11px] text-muted-foreground/60">
                  Empty
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  onAddRecord(
                    col.value !== UNCATEGORIZED
                      ? { [groupByFieldKey]: col.value }
                      : undefined,
                  )
                }
                className="flex w-full items-center gap-1 rounded-md border border-dashed border-border/60 px-2 py-2 text-[11px] text-muted-foreground/70 transition-colors hover:bg-accent/30"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-2.5 overflow-x-auto pb-4 px-3 pt-3">
        {columns.map((col) => (
          <KanbanColumn
            key={col.value}
            value={col.value}
            label={col.label}
            color={col.color}
            count={col.records.length}
            onAdd={() =>
              onAddRecord(
                col.value !== UNCATEGORIZED
                  ? { [groupByFieldKey]: col.value }
                  : undefined,
              )
            }
          >
            {col.records.map((record) => (
              <DraggableRecordCard
                key={record.id}
                record={record}
                title={getTitle(record)}
                previewFields={previewFields}
                groupField={groupField}
                onClick={onRecordClick}
                onArchive={onArchiveRecord}
                onDelete={onDeleteRecord}
              />
            ))}
          </KanbanColumn>
        ))}
      </div>

      <DragOverlay>
        {activeRecord ? (
          <div className="rotate-[2deg] cursor-grabbing rounded-md border border-border/60 bg-background p-2.5 shadow-xl shadow-black/10 w-[260px]">
            <span className="text-[13px] font-medium leading-snug">
              {getTitle(activeRecord)}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface KanbanColumnProps {
  value: string;
  label: string;
  color?: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}

function KanbanColumn({
  value,
  label,
  color,
  count,
  onAdd,
  children,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: value });

  return (
    <div className="flex w-[272px] shrink-0 flex-col rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {color && (
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="text-[13px] font-medium flex-1 truncate">{label}</span>
        <span className="text-[11px] text-muted-foreground/70 tabular-nums rounded-full bg-muted px-1.5 py-0.5 min-w-[20px] text-center">
          {count}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-1.5 px-1.5 pb-1.5 overflow-y-auto max-h-[calc(100vh-280px)] transition-colors min-h-[60px]",
          isOver && "bg-primary/5 rounded-md",
        )}
      >
        {children}
        {count === 0 && (
          <div className="flex items-center justify-center py-6 text-[11px] text-muted-foreground/40">
            No records
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 mx-1.5 mb-1.5 px-2 py-1.5 rounded-md text-[12px] text-muted-foreground/50 transition-colors hover:bg-accent/60 hover:text-muted-foreground"
      >
        <Plus className="h-3 w-3" />
        New
      </button>
    </div>
  );
}

interface DraggableRecordCardProps {
  record: CollectionRecord;
  title: string;
  previewFields: CollectionField[];
  groupField?: CollectionField;
  onClick?: (recordId: string) => void;
  onArchive: (recordId: string) => void;
  onDelete: (recordId: string) => void;
}

function DraggableRecordCard({
  record,
  title,
  previewFields,
  groupField,
  onClick,
  onArchive,
  onDelete,
}: DraggableRecordCardProps) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: record.id,
    data: { record },
  });

  const statusColor = useMemo(() => {
    if (!groupField) return undefined;
    const val = record.values[groupField.field_key];
    return groupField.options?.choices?.find((c) => c.value === val)?.color;
  }, [groupField, record.values]);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group rounded-md border border-border/40 bg-background p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:border-border/60",
        onClick && "cursor-pointer",
        isDragging && "opacity-40 scale-[0.98]",
      )}
      onClick={() => onClick?.(record.id)}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[13px] font-medium leading-snug">{title}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onArchive(record.id)}>
              <Archive className="mr-2 h-3.5 w-3.5" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(record.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {previewFields.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {previewFields.map((f) => {
            const val = record.values[f.field_key];
            if (val == null || val === "") return null;
            if (f.field_type === "select") {
              const choice = f.options?.choices?.find((c) => c.value === val);
              if (choice) {
                return (
                  <span
                    key={f.field_key}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/60"
                  >
                    {choice.color && (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: choice.color }} />
                    )}
                    {choice.label}
                  </span>
                );
              }
            }
            if (f.field_type === "date" || f.field_type === "datetime") {
              const dateStr = String(val);
              try {
                const d = new Date(dateStr);
                return (
                  <span key={f.field_key} className="text-[10px] text-muted-foreground">
                    {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                );
              } catch { /* skip */ }
            }
            return (
              <span key={f.field_key} className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                {Array.isArray(val) ? val.join(", ") : String(val)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
