"use client";

import type { Stream } from "@/lib/tasks/types";
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
    hasActiveFilters: boolean;
    clearFilters: () => void;
  };
  streams: Stream[];
}

export function TaskFilters({ filters }: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
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
