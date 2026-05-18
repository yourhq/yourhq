"use client";

import { useMemo } from "react";
import type { CadenceType } from "@/lib/tasks/types";
import { DAY_OF_WEEK_LABELS } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Repeat, Clock } from "lucide-react";
import { formatTimeOfDay } from "@/lib/workspace/timezone";

export interface RecurrenceValue {
  enabled: boolean;
  cadenceType: CadenceType;
  intervalN: number;
  daysOfWeek: number[]; // 0..6
  dayOfMonth: number | null; // 1..31 or -1
  timeOfDay: string; // "HH:MM"
}

export const DEFAULT_RECURRENCE: RecurrenceValue = {
  enabled: false,
  cadenceType: "daily",
  intervalN: 1,
  daysOfWeek: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  timeOfDay: "09:00",
};

const OPTIONS: { value: CadenceType | "none"; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "every_n_days", label: "Every N days" },
];

interface RecurrencePickerProps {
  value: RecurrenceValue;
  onChange: (next: RecurrenceValue) => void;
  timezone: string;
}

export function RecurrencePicker({ value, onChange, timezone }: RecurrencePickerProps) {
  const currentLabel = useMemo(() => {
    if (!value.enabled) return "Does not repeat";
    if (value.cadenceType === "every_n_days") {
      return `Every ${value.intervalN}d`;
    }
    if (value.cadenceType === "weekly" && value.daysOfWeek.length > 0) {
      const days = value.daysOfWeek
        .map((d) => DAY_OF_WEEK_LABELS.find((l) => l.value === d)?.short)
        .filter(Boolean)
        .join("");
      return `Weekly · ${days}`;
    }
    if (value.cadenceType === "monthly") {
      const dom =
        value.dayOfMonth === -1 ? "last" : String(value.dayOfMonth ?? 1);
      return `Monthly · ${dom}`;
    }
    return OPTIONS.find((o) => o.value === value.cadenceType)?.label ?? "Recurring";
  }, [value]);

  function setCadence(choice: string) {
    if (choice === "none") {
      onChange({ ...value, enabled: false });
      return;
    }
    onChange({ ...value, enabled: true, cadenceType: choice as CadenceType });
  }

  function toggleDay(day: number) {
    const has = value.daysOfWeek.includes(day);
    const next = has
      ? value.daysOfWeek.filter((d) => d !== day)
      : [...value.daysOfWeek, day].sort();
    onChange({ ...value, daysOfWeek: next });
  }

  const needsSubPicker =
    value.enabled &&
    (value.cadenceType === "weekly" ||
      value.cadenceType === "monthly" ||
      value.cadenceType === "every_n_days");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1.5">
        {/* Cadence chip */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-transparent px-2 text-xs font-normal transition-colors hover:bg-accent"
                >
                  <Repeat
                    className={cn(
                      "h-3 w-3",
                      value.enabled
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  />
                  <span>{currentLabel}</span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            {value.enabled && (
              <TooltipContent side="top" className="text-[11px]">
                Times in {timezone}
              </TooltipContent>
            )}
          </Tooltip>

          <PopoverContent
            portal={false}
            align="start"
            className="w-56 p-1.5 space-y-0.5"
          >
            {OPTIONS.map((o) => {
              const active =
                (o.value === "none" && !value.enabled) ||
                (value.enabled && o.value === value.cadenceType);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setCadence(o.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span>{o.label}</span>
                  {active && <span className="text-[10px]">●</span>}
                </button>
              );
            })}

            {/* Sub-controls, inline in the same popover */}
            {needsSubPicker && (
              <div className="mt-1 border-t border-border/50 pt-2 pb-0.5 px-1.5 space-y-2">
                {value.cadenceType === "weekly" && (
                  <div className="flex items-center gap-1">
                    {DAY_OF_WEEK_LABELS.map((d) => {
                      const active = value.daysOfWeek.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleDay(d.value)}
                          className={cn(
                            "h-6 w-6 rounded text-[11px] transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "bg-transparent text-muted-foreground border border-border/50 hover:bg-accent"
                          )}
                          aria-label={d.label}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                )}

                {value.cadenceType === "every_n_days" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>Every</span>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={value.intervalN}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          intervalN: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="h-6 w-14 border-border/50 bg-transparent px-1.5 text-[11px]"
                    />
                    <span>day{value.intervalN === 1 ? "" : "s"}</span>
                  </div>
                )}

                {value.cadenceType === "monthly" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>Day</span>
                    <Select
                      value={String(value.dayOfMonth ?? 1)}
                      onValueChange={(v) =>
                        onChange({ ...value, dayOfMonth: Number(v) })
                      }
                    >
                      <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-[11px] font-normal hover:bg-accent">
                        <span>
                          {value.dayOfMonth === -1
                            ? "Last day"
                            : value.dayOfMonth}
                        </span>
                      </SelectTrigger>
                      <SelectContent portal={false}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                        <SelectItem value="-1">Last day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Time chip */}
        {value.enabled && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1.5 rounded-md bg-transparent px-2 text-xs font-normal transition-colors hover:bg-accent"
              >
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span>{formatTimeOfDay(value.timeOfDay)}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              portal={false}
              align="start"
              className="w-auto p-2"
            >
              <Input
                type="time"
                value={value.timeOfDay.slice(0, 5)}
                onChange={(e) =>
                  onChange({ ...value, timeOfDay: e.target.value || "09:00" })
                }
                className="h-7 w-[110px] text-xs"
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TooltipProvider>
  );
}
