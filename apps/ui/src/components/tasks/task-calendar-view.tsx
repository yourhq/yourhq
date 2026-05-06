"use client";

import { useMemo, useState } from "react";
import type { Task, TaskStatus } from "@/lib/tasks/types";
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
} from "date-fns";

interface TaskCalendarViewProps {
  tasks: Task[];
  loading: boolean;
  onSelect: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onCreateForDate?: (date: string) => void;
}

const STATUS_DOT: Record<TaskStatus, string> = {
  todo: "bg-gray-400",
  in_progress: "bg-blue-400",
  blocked: "bg-red-400",
  done: "bg-green-400",
  cancelled: "bg-zinc-400",
  missed: "bg-amber-400",
};

export function TaskCalendarView({
  tasks,
  onSelect,
  onCreateForDate,
}: TaskCalendarViewProps) {
  const mobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const start = startOfWeek(monthStart);
    const end = endOfWeek(monthEnd);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const dateStr = task.due_date ?? task.series_occurrence_at;
      if (!dateStr) continue;
      const key = dateStr.slice(0, 10);
      const existing = map.get(key) ?? [];
      existing.push(task);
      map.set(key, existing);
    }
    return map;
  }, [tasks]);

  if (mobile) {
    const monthDays = eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
    const daysWithTasks = monthDays.filter((day) => {
      const key = format(day, "yyyy-MM-dd");
      return (tasksByDate.get(key)?.length ?? 0) > 0 || isToday(day);
    });

    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold min-w-[140px] text-center">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
        </div>

        {daysWithTasks.length === 0 ? (
          <p className="py-8 text-center text-[11px] text-muted-foreground/60">
            No tasks this month
          </p>
        ) : (
          <div className="space-y-4">
            {daysWithTasks.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDate.get(key) ?? [];
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
                    {onCreateForDate && (
                      <button
                        onClick={() => onCreateForDate(key)}
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent"
                      >
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  {dayTasks.length > 0 ? (
                    <div className="space-y-1">
                      {dayTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onSelect(task)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-left transition-colors active:bg-accent/50",
                            task.status === "done" && "opacity-60",
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              STATUS_DOT[task.status],
                            )}
                          />
                          <span
                            className={cn(
                              "text-sm truncate",
                              task.status === "done" && "line-through",
                            )}
                          >
                            {task.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-[11px] text-muted-foreground/40">
                      No tasks
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
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-semibold min-w-[140px] text-center">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setCurrentMonth(new Date())}
        >
          Today
        </Button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-medium text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-t border-l border-border/50">
        {calendarDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDate.get(key) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);

          return (
            <div
              key={key}
              className={cn(
                "border-r border-b border-border/50 min-h-[100px] p-1 relative group",
                !inMonth && "bg-muted/20",
              )}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={cn(
                    "text-[11px] leading-none",
                    today &&
                      "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-medium",
                    !today && !inMonth && "text-muted-foreground/40",
                    !today && inMonth && "text-muted-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                {onCreateForDate && inMonth && (
                  <button
                    onClick={() => onCreateForDate(key)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-4 w-4 flex items-center justify-center rounded hover:bg-accent"
                  >
                    <Plus className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>

              {/* Task pills */}
              <div className="space-y-0.5 overflow-hidden">
                {dayTasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onSelect(task)}
                    className={cn(
                      "w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate flex items-center gap-1 transition-colors hover:ring-1 hover:ring-border",
                      task.status === "done" && "opacity-60 line-through",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        STATUS_DOT[task.status],
                      )}
                    />
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[9px] text-muted-foreground/60 px-1">
                    +{dayTasks.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
