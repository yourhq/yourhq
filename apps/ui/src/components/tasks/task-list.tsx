"use client";

import type { Task, TaskStatus } from "@/lib/tasks/types";
import type { SortingState } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  User,
  Calendar,
  CheckCircle2,
  Circle,
  Loader,
  AlertCircle,
  XCircle,
  CheckSquare,
  ClockAlert,
  Pencil,
  Paperclip,
  MessageSquare,
  MoreHorizontal,
  Archive,
  RotateCcw,
  Trash2,
  Repeat,
  Ban,
} from "lucide-react";
import { AgentStatusChip } from "./agent-status-chip";
import { TaskLabelPills } from "./task-labels-picker";
import { format, isPast, isToday } from "date-fns";
import { shortCadenceLabel } from "@/lib/tasks/cadence";

const statusIcons: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Loader,
  blocked: AlertCircle,
  done: CheckCircle2,
  cancelled: XCircle,
  missed: ClockAlert,
};

const statusIconColors: Record<TaskStatus, string> = {
  todo: "text-muted-foreground",
  in_progress: "text-[var(--status-info)]",
  blocked: "text-[var(--status-error)]",
  done: "text-[var(--status-success)]",
  cancelled: "text-muted-foreground/60",
  missed: "text-[var(--status-warning)]",
};

const priorityDot: Record<string, string> = {
  urgent: "var(--priority-urgent)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

interface TaskListProps {
  tasks: Task[];
  loading: boolean;
  sorting: SortingState;
  setSorting: (s: SortingState | ((prev: SortingState) => SortingState)) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onSelect: (task: Task) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
  onCreateTask?: () => void;
}

function DueDate({ iso, isDone }: { iso: string; isDone?: boolean }) {
  const d = new Date(iso);
  const overdue = isPast(d) && !isToday(d) && !isDone;
  const today = isToday(d) && !isDone;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 text-[11px] tabular-nums",
        overdue
          ? "text-[var(--status-error)] font-medium"
          : today
            ? "text-[var(--status-warning)]"
            : "text-muted-foreground"
      )}
    >
      <Calendar className="h-3 w-3" />
      {overdue ? "Overdue" : format(d, "MMM d")}
    </span>
  );
}

export function TaskList({
  tasks,
  loading,
  onStatusChange,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
  onCreateTask,
}: TaskListProps) {
  if (loading) {
    return (
      <div className="p-5">
        <LoadingSkeleton variant="list" count={8} />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={CheckSquare}
        title="No tasks yet"
        description="Create your first task to start tracking work."
        action={
          onCreateTask && !showArchived
            ? { label: "New task", onClick: onCreateTask }
            : undefined
        }
      />
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {tasks.map((task) => {
        const StatusIcon = statusIcons[task.status];
        const isDone = task.status === "done";
        const isOverdue =
          task.due_date && isPast(new Date(task.due_date)) && !isDone;

        return (
          <div
            key={task.id}
            onClick={() => onSelect(task)}
            className={cn(
              "group/row relative flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors hover:bg-accent/60 active:bg-accent",
              isOverdue && "bg-[var(--status-error)]/5"
            )}
          >
            {/* Priority accent stripe */}
            {priorityDot[task.priority] && (
              <span
                className="absolute left-0 top-0 bottom-0 w-0.5"
                style={{ backgroundColor: priorityDot[task.priority] }}
                aria-hidden
              />
            )}

            {/* Status toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = isDone ? "todo" : "done";
                onStatusChange(task.id, next);
              }}
              className={cn(
                "shrink-0 rounded p-0.5 transition-colors hover:bg-accent",
                statusIconColors[task.status]
              )}
              aria-label="Toggle done"
            >
              <StatusIcon className="h-3.5 w-3.5" />
            </button>

            {/* Blocker icon */}
            {!!task.blocker_count && task.blocker_count > 0 && (
              <span title={`Blocked by ${task.blocker_count} task${task.blocker_count > 1 ? "s" : ""}`}>
                <Ban className="h-3 w-3 shrink-0 text-[var(--status-error)]" />
              </span>
            )}

            {/* Title */}
            <span
              className={cn(
                "flex-1 truncate text-[13px] text-foreground flex items-center gap-1.5 min-w-0",
                isDone && "line-through text-muted-foreground"
              )}
            >
              {task.series_id && (
                <Repeat
                  className="h-3 w-3 shrink-0 text-muted-foreground"
                  aria-label="Recurring"
                />
              )}
              <span className="truncate">{task.title}</span>
            </span>

            {/* Labels */}
            {task.labels && task.labels.length > 0 && (
              <TaskLabelPills labels={task.labels} max={2} className="hidden shrink-0 sm:flex" />
            )}

            {/* Stream */}
            {task.stream && (
              <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:inline-flex">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: task.stream.color }}
                />
                {task.stream.name}
              </span>
            )}

            {/* Recurrence pill */}
            {task.series && (
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
                {shortCadenceLabel(task.series)}
              </span>
            )}

            {/* Assignee */}
            {task.assignee_type === "agent" && task.assignee_agent ? (
              <span className="hidden shrink-0 md:inline-flex">
                <AgentStatusChip task={task} />
              </span>
            ) : task.assignee_type === "human" ? (
              <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground md:inline-flex">
                <User className="h-3 w-3" />
                Me
              </span>
            ) : null}

            {/* Due date */}
            {task.due_date && <DueDate iso={task.due_date} isDone={isDone} />}

            {/* Counts */}
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              {!!task.attachment_count && task.attachment_count > 0 && (
                <span className="flex items-center gap-0.5 tabular-nums">
                  <Paperclip className="h-3 w-3" />
                  {task.attachment_count}
                </span>
              )}
              {!!task.comment_count && task.comment_count > 0 && (
                <span className="flex items-center gap-0.5 tabular-nums">
                  <MessageSquare className="h-3 w-3" />
                  {task.comment_count}
                </span>
              )}
            </div>

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
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                {showArchived ? (
                  <>
                    {onRestore && (
                      <DropdownMenuItem onClick={() => onRestore(task.id)}>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Restore
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDelete(task.id)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete permanently
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => onSelect(task)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Open
                    </DropdownMenuItem>
                    {onArchive && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onArchive(task.id)}>
                          <Archive className="mr-2 h-3.5 w-3.5" />
                          Archive
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
