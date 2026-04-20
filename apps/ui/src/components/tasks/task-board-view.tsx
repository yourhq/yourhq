"use client";

import { useCallback, useState } from "react";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUSES } from "@/lib/tasks/types";
import { TaskCard } from "./task-card";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface TaskBoardViewProps {
  tasks: Task[];
  loading: boolean;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onSelect: (task: Task) => void;
  onArchive?: (id: string) => void;
  onQuickCreate?: (
    title: string,
    status: TaskStatus,
    streamId: string | null
  ) => void;
  currentStreamId?: string | null;
}

const boardColumns: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

const statusDotColors: Record<TaskStatus, string> = {
  todo: "var(--status-neutral)",
  in_progress: "var(--status-info)",
  blocked: "var(--status-error)",
  done: "var(--status-success)",
  cancelled: "var(--status-neutral)",
  missed: "var(--status-warning)",
};

export function TaskBoardView({
  tasks,
  loading,
  onStatusChange,
  onSelect,
  onArchive,
  onQuickCreate,
  currentStreamId,
}: TaskBoardViewProps) {
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [quickAddColumn, setQuickAddColumn] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  const handleDragStart = useCallback(
    (e: React.DragEvent, taskId: string) => {
      e.dataTransfer.setData("text/plain", taskId);
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, status: TaskStatus) => {
      e.preventDefault();
      setDragOverColumn(null);
      const taskId = e.dataTransfer.getData("text/plain");
      if (!taskId) return;
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== status) {
        onStatusChange(taskId, status);
      }
    },
    [tasks, onStatusChange]
  );

  const commitQuickAdd = useCallback(
    (status: TaskStatus) => {
      const title = quickAddTitle.trim();
      if (title && onQuickCreate) {
        onQuickCreate(title, status, currentStreamId ?? null);
      }
      setQuickAddTitle("");
      setQuickAddColumn(null);
    },
    [quickAddTitle, onQuickCreate, currentStreamId]
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-body text-muted-foreground">
        Loading…
      </div>
    );
  }

  const tasksByStatus = new Map<TaskStatus, Task[]>();
  for (const col of boardColumns) tasksByStatus.set(col, []);
  for (const task of tasks) {
    const col = boardColumns.includes(task.status) ? task.status : "todo";
    tasksByStatus.get(col)!.push(task);
  }

  return (
    <div className="h-full overflow-x-auto p-5">
      <div className="flex h-full gap-4" style={{ minWidth: `${boardColumns.length * 316}px` }}>
        {boardColumns.map((status) => {
          const label = TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
          const items = tasksByStatus.get(status) ?? [];
          const isOver = dragOverColumn === status;
          const isAdding = quickAddColumn === status;

          return (
            <div
              key={status}
              className="flex w-[300px] shrink-0 flex-col"
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Column header */}
              <div className="mb-2 flex h-8 items-center gap-2 px-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: statusDotColors[status] }}
                />
                <span className="text-[13px] font-medium text-foreground">
                  {label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
                <div className="flex-1" />
                {onQuickCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddColumn(status);
                      setQuickAddTitle("");
                    }}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={`Add task to ${label}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Column body */}
              <div
                className={cn(
                  "flex min-h-[320px] flex-1 flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-2 transition-colors",
                  isOver && "border-foreground/40 bg-accent"
                )}
              >
                {items.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                  >
                    <TaskCard
                      task={task}
                      onClick={() => onSelect(task)}
                      onArchive={onArchive}
                    />
                  </div>
                ))}

                {isAdding ? (
                  <div className="rounded-md border border-border/70 bg-card p-2">
                    <input
                      autoFocus
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitQuickAdd(status);
                        } else if (e.key === "Escape") {
                          setQuickAddColumn(null);
                          setQuickAddTitle("");
                        }
                      }}
                      onBlur={() => {
                        if (quickAddTitle.trim()) {
                          commitQuickAdd(status);
                        } else {
                          setQuickAddColumn(null);
                        }
                      }}
                      placeholder="Task title…"
                      className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Enter to save · Esc to cancel
                    </div>
                  </div>
                ) : (
                  onQuickCreate && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddColumn(status);
                        setQuickAddTitle("");
                      }}
                      className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-border/60 text-[11px] text-muted-foreground/70 transition-colors hover:border-border hover:bg-accent/30 hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                      Add task
                    </button>
                  )
                )}

                {items.length === 0 && !isAdding && !onQuickCreate && (
                  <div className="flex h-16 items-center justify-center text-[11px] text-muted-foreground/60">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
