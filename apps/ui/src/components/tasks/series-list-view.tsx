"use client";

import type { TaskSeries } from "@/lib/tasks/types";
import { shortCadenceLabel } from "@/lib/tasks/cadence";
import { formatInTimezone } from "@/lib/workspace/timezone";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Repeat,
  Bot,
  User,
  Pause,
  Play,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SeriesListViewProps {
  seriesList: TaskSeries[];
  loading: boolean;
  onOpen: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate?: () => void;
}

export function SeriesListView({
  seriesList,
  loading,
  onOpen,
  onPause,
  onResume,
  onDelete,
  onCreate,
}: SeriesListViewProps) {
  if (loading) {
    return (
      <div className="p-5">
        <LoadingSkeleton variant="list" count={5} />
      </div>
    );
  }

  if (seriesList.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title="No recurring tasks yet"
        description="Create a task with a repeat schedule to have it auto-appear on cadence."
        action={onCreate ? { label: "New task", onClick: onCreate } : undefined}
      />
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {seriesList.map((s) => {
        const isPaused = s.is_paused;
        const nextLabel = s.next_occurrence_at
          ? formatInTimezone(s.next_occurrence_at, s.timezone, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          : "—";
        const lastRelative = s.last_spawned_at
          ? formatDistanceToNow(new Date(s.last_spawned_at), { addSuffix: true })
          : null;

        return (
          <div
            key={s.id}
            onClick={() => onOpen(s.id)}
            className={cn(
              "group/row relative flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent/60 active:bg-accent",
              isPaused && "opacity-60"
            )}
          >
            {/* Status dot */}
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                isPaused ? "bg-muted-foreground/50" : "bg-[var(--status-success)]"
              )}
              aria-hidden
            />

            {/* Title + stream */}
            <div className="flex flex-1 min-w-0 items-center gap-2">
              <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate text-[13px] text-foreground">
                {s.title}
              </span>
              {s.stream && (
                <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: s.stream.color }}
                  />
                  {s.stream.name}
                </span>
              )}
            </div>

            {/* Cadence pill */}
            <span className="hidden shrink-0 rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
              {shortCadenceLabel(s)}
            </span>

            {/* Assignee */}
            {s.assignee_agent ? (
              <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
                {(s.assignee_agent.meta?.emoji as string) ? <span>{s.assignee_agent.meta!.emoji as string}</span> : <Bot className="h-3 w-3" />}
                {s.assignee_agent.name}
              </span>
            ) : s.assignee_type === "human" ? (
              <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
                <User className="h-3 w-3" />
                Me
              </span>
            ) : null}

            {/* Next run */}
            <span
              className={cn(
                "hidden shrink-0 text-[11px] tabular-nums md:inline",
                isPaused
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground"
              )}
            >
              {isPaused ? "Paused" : `Next: ${nextLabel}`}
            </span>

            {/* Spawn count */}
            <span className="hidden shrink-0 text-[11px] text-muted-foreground/60 tabular-nums lg:inline">
              {s.spawned_count} run{s.spawned_count === 1 ? "" : "s"}
              {lastRelative && !isPaused && ` · last ${lastRelative}`}
            </span>

            {/* Row actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 data-[state=open]:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Row actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {isPaused ? (
                  <DropdownMenuItem onClick={() => onResume(s.id)}>
                    <Play className="mr-2 h-3.5 w-3.5" />
                    Resume
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onPause(s.id)}>
                    <Pause className="mr-2 h-3.5 w-3.5" />
                    Pause
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(s.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete series
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
