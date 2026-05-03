"use client";

import { useMemo, useState } from "react";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";

interface CollectionCalendarViewProps {
  records: CollectionRecord[];
  fields: CollectionField[];
  dateFieldKey: string;
  titleField: CollectionField | undefined;
  onAddRecord: (defaults?: Record<string, unknown>) => void;
  onArchiveRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
  onRecordClick?: (recordId: string) => void;
}

export function CollectionCalendarView({
  records,
  dateFieldKey,
  titleField,
  onAddRecord,
  onRecordClick,
}: CollectionCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const calendarStartTime = calendarStart.getTime();
  const calendarEndTime = calendarEnd.getTime();

  const days = useMemo(
    () => eachDayOfInterval({ start: new Date(calendarStartTime), end: new Date(calendarEndTime) }),
    [calendarStartTime, calendarEndTime],
  );

  const recordsByDate = useMemo(() => {
    const map = new Map<string, CollectionRecord[]>();
    for (const record of records) {
      const raw = record.values[dateFieldKey];
      if (!raw) continue;
      const dateStr = typeof raw === "string" ? raw : String(raw);
      try {
        const date = parseISO(dateStr);
        const key = format(date, "yyyy-MM-dd");
        const existing = map.get(key) ?? [];
        existing.push(record);
        map.set(key, existing);
      } catch {
        continue;
      }
    }
    return map;
  }, [records, dateFieldKey]);

  const getTitle = (record: CollectionRecord) => {
    if (!titleField) return "Untitled";
    const val = record.values[titleField.field_key];
    return typeof val === "string" && val ? val : "Untitled";
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-heading text-base font-medium">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border/30 bg-muted/30">
          {weekDays.map((day) => (
            <div
              key={day}
              className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayRecords = recordsByDate.get(key) ?? [];
            const inCurrentMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <div
                key={key}
                className={cn(
                  "group relative min-h-[100px] border-b border-r border-border/30 p-1 transition-colors hover:bg-muted/20",
                  !inCurrentMonth && "bg-muted/10",
                )}
              >
                <div className="flex items-center justify-between px-1">
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      !inCurrentMonth && "text-muted-foreground/50",
                      inCurrentMonth && "text-muted-foreground",
                      today &&
                        "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onAddRecord({ [dateFieldKey]: format(day, "yyyy-MM-dd") })
                    }
                    className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
                  >
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>

                <div className="mt-0.5 space-y-0.5">
                  {dayRecords.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => onRecordClick?.(record.id)}
                      className={cn(
                        "w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-tight",
                        "bg-primary/10 text-primary hover:bg-primary/20 transition-colors",
                        onRecordClick && "cursor-pointer",
                      )}
                    >
                      {getTitle(record)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
