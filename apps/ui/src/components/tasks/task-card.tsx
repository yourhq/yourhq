"use client";

import type { Task } from "@/lib/tasks/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  User,
  MessageSquare,
  Calendar,
  Paperclip,
  MoreHorizontal,
  Archive,
  Pencil,
  Repeat,
} from "lucide-react";
import { AgentStatusChip } from "./agent-status-chip";
import { TaskLabelPills } from "./task-labels-picker";
import { format, isPast, isToday, parseISO } from "date-fns";
import { shortCadenceLabel } from "@/lib/tasks/cadence";

const priorityDot: Record<string, string> = {
  urgent: "var(--priority-urgent)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  onArchive?: (id: string) => void;
}

export function TaskCard({ task, onClick, onArchive }: TaskCardProps) {
  const overdue =
    task.due_date &&
    isPast(parseISO(task.due_date)) &&
    !isToday(parseISO(task.due_date)) &&
    task.status !== "done";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer rounded-md border border-border/60 bg-card p-2.5 transition-all hover:border-border-strong hover:shadow-sm active:scale-[0.98]",
        overdue && "border-[var(--status-error)]/30"
      )}
    >
      {/* Priority stripe */}
      {task.priority && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
          style={{ backgroundColor: priorityDot[task.priority] }}
          aria-hidden
        />
      )}

      <div className="flex items-start gap-2">
        <span className="flex-1 truncate text-[13px] font-medium text-foreground flex items-center gap-1.5">
          {task.series_id && (
            <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Recurring" />
          )}
          <span className="truncate">{task.title}</span>
        </span>
        {onArchive && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="-mt-0.5 -mr-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
                aria-label="Card actions"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => onClick?.()}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Open
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onArchive(task.id)}>
                <Archive className="mr-2 h-3.5 w-3.5" />
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {(task.stream || task.series || (task.labels && task.labels.length > 0)) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {task.stream && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: task.stream.color }}
              />
              <span className="text-[11px] text-muted-foreground">
                {task.stream.name}
              </span>
            </span>
          )}
          {task.series && (
            <span className="rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {shortCadenceLabel(task.series)}
            </span>
          )}
          {task.labels && task.labels.length > 0 && (
            <TaskLabelPills labels={task.labels} max={2} />
          )}
        </div>
      )}

      {(task.assignee_type ||
        task.due_date ||
        task.attachment_count ||
        task.comment_count) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            {task.assignee_type === "agent" && task.assignee_agent ? (
              <AgentStatusChip task={task} />
            ) : task.assignee_type === "human" ? (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Me
              </span>
            ) : null}
            {task.due_date && (
              <span
                className={cn(
                  "flex items-center gap-1 tabular-nums",
                  overdue && "text-[var(--status-error)]"
                )}
              >
                <Calendar className="h-3 w-3" />
                {format(parseISO(task.due_date), "MMM d")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 tabular-nums">
            {!!task.attachment_count && task.attachment_count > 0 && (
              <span className="flex items-center gap-0.5">
                <Paperclip className="h-3 w-3" />
                {task.attachment_count}
              </span>
            )}
            {!!task.comment_count && task.comment_count > 0 && (
              <span className="flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                {task.comment_count}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
