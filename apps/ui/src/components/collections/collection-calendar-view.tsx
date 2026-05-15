"use client";

import { useMemo, useState } from "react";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const mobile = useIsMobile();
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

  if (mobile) {
    const monthDays = eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
    const daysWithRecords = monthDays.filter((day) => {
      const key = format(day, "yyyy-MM-dd");
      return (recordsByDate.get(key)?.length ?? 0) > 0 || isToday(day);
    });

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

        {daysWithRecords.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-body text-muted-foreground">No records this month</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Try a different month or add a record with a date in {format(currentMonth, "MMMM")}.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {daysWithRecords.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayRecords = recordsByDate.get(key) ?? [];
              const today = isToday(day);

              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        today
                          ? "bg-primary text-primary-foreground rounded-full px-2 py-0.5"
                          : "text-muted-foreground",
                      )}
                    >
                      {format(day, "EEE, MMM d")}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onAddRecord({ [dateFieldKey]: format(day, "yyyy-MM-dd") })
                      }
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent"
                    >
                      <Plus className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                  {dayRecords.length > 0 ? (
                    <div className="space-y-1">
                      {dayRecords.map((record) => (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => onRecordClick?.(record.id)}
                          className="flex w-full items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-left transition-colors active:bg-accent/50"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          <span className="text-sm truncate">
                            {getTitle(record)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-[11px] text-muted-foreground/40">
                      No records
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 pt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs font-medium"
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
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border/40 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border/30 bg-muted/20">
          {weekDays.map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70"
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
                  "group relative min-h-[110px] border-b border-r border-border/20 p-1.5 transition-colors",
                  !inCurrentMonth && "bg-muted/5",
                  inCurrentMonth && "hover:bg-accent/20",
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-[11px] tabular-nums leading-none",
                      !inCurrentMonth && "text-muted-foreground/30",
                      inCurrentMonth && "text-muted-foreground/70",
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
                    className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
                  >
                    <Plus className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>
                </div>

                <div className="space-y-0.5">
                  {dayRecords.slice(0, 3).map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => onRecordClick?.(record.id)}
                      className={cn(
                        "w-full truncate rounded-[4px] px-1.5 py-[3px] text-left text-[10px] font-medium leading-tight",
                        "bg-primary/10 text-primary/90 hover:bg-primary/20 transition-colors",
                        onRecordClick && "cursor-pointer",
                      )}
                    >
                      {getTitle(record)}
                    </button>
                  ))}
                  {dayRecords.length > 3 && (
                    <button
                      type="button"
                      onClick={() => onRecordClick?.(dayRecords[3].id)}
                      className="w-full text-left text-[10px] text-muted-foreground/60 px-1.5 hover:text-muted-foreground transition-colors"
                    >
                      +{dayRecords.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
