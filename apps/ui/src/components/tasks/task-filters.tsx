"use client";

import type { Stream, Label } from "@/lib/tasks/types";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/tasks/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TaskFiltersProps {
  filters: {
    streamFilter: string;
    setStreamFilter: (v: string) => void;
    statusFilter: string;
    setStatusFilter: (v: string) => void;
    priorityFilter: string;
    setPriorityFilter: (v: string) => void;
    assigneeFilter: string;
    setAssigneeFilter: (v: string) => void;
    labelFilter?: string;
    setLabelFilter?: (v: string) => void;
    hasActiveFilters: boolean;
    clearFilters: () => void;
  };
  streams: Stream[];
  labels?: Label[];
}

export function TaskFilters({ filters, streams, labels }: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Stream filter — mobile only (desktop uses sidebar) */}
      {streams.length > 0 && (
        <div className="lg:hidden">
          <Select value={filters.streamFilter} onValueChange={filters.setStreamFilter}>
            <SelectTrigger
              size="sm"
              className={cn(
                "min-w-[110px] text-[12px]",
                filters.streamFilter !== "all" && "border-foreground/30 bg-accent/50"
              )}
            >
              <SelectValue placeholder="Stream" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All streams</SelectItem>
              {streams.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Select value={filters.statusFilter} onValueChange={filters.setStatusFilter}>
        <SelectTrigger
          size="sm"
          className={cn(
            "min-w-[110px] text-[12px]",
            filters.statusFilter !== "all" && "border-foreground/30 bg-accent/50"
          )}
        >
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {TASK_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.priorityFilter} onValueChange={filters.setPriorityFilter}>
        <SelectTrigger
          size="sm"
          className={cn(
            "min-w-[110px] text-[12px]",
            filters.priorityFilter !== "all" && "border-foreground/30 bg-accent/50"
          )}
        >
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {TASK_PRIORITIES.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.assigneeFilter} onValueChange={filters.setAssigneeFilter}>
        <SelectTrigger
          size="sm"
          className={cn(
            "min-w-[110px] text-[12px]",
            filters.assigneeFilter !== "all" && "border-foreground/30 bg-accent/50"
          )}
        >
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignees</SelectItem>
          <SelectItem value="me">Me</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
        </SelectContent>
      </Select>

      {labels && labels.length > 0 && filters.setLabelFilter && (
        <Select value={filters.labelFilter ?? "all"} onValueChange={filters.setLabelFilter}>
          <SelectTrigger
            size="sm"
            className={cn(
              "min-w-[110px] text-[12px]",
              filters.labelFilter && filters.labelFilter !== "all" && "border-foreground/30 bg-accent/50"
            )}
          >
            <SelectValue placeholder="Label" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All labels</SelectItem>
            {labels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: l.color }}
                  />
                  {l.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {filters.hasActiveFilters && (
        <button
          type="button"
          onClick={filters.clearFilters}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
