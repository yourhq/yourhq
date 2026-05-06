"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TASK_STATUSES } from "@/lib/tasks/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { TaskCard } from "./task-card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight, Plus } from "lucide-react";

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
  const mobile = useIsMobile();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [quickAddColumn, setQuickAddColumn] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const targetStatus = over.id as TaskStatus;
    if (!boardColumns.includes(targetStatus)) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== targetStatus) {
      onStatusChange(taskId, targetStatus);
    }
  };

  const commitQuickAdd = (status: TaskStatus) => {
    const title = quickAddTitle.trim();
    if (title && onQuickCreate) {
      onQuickCreate(title, status, currentStreamId ?? null);
    }
    setQuickAddTitle("");
    setQuickAddColumn(null);
  };

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

  const activeTask = activeTaskId
    ? tasks.find((t) => t.id === activeTaskId) ?? null
    : null;

  if (mobile) {
    return (
      <div className="space-y-3 p-4">
        {boardColumns.map((status) => {
          const label =
            TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
          const items = tasksByStatus.get(status) ?? [];

          return (
            <Collapsible key={status} defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center gap-2 py-1.5 text-left">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: statusDotColors[status] }}
                />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 pt-1">
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onSelect(task)}
                    onArchive={onArchive}
                  />
                ))}
                {items.length === 0 && (
                  <div className="py-3 text-center text-[11px] text-muted-foreground/60">
                    Empty
                  </div>
                )}
                {onQuickCreate && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddColumn(status);
                      setQuickAddTitle("");
                    }}
                    className="flex w-full items-center gap-1 rounded-md border border-dashed border-border/60 px-2 py-2 text-[11px] text-muted-foreground/70 transition-colors hover:bg-accent/30"
                  >
                    <Plus className="h-3 w-3" />
                    Add task
                  </button>
                )}
                {quickAddColumn === status && (
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
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-x-auto p-5">
        <div
          className="flex h-full gap-4"
          style={{ minWidth: `${boardColumns.length * 316}px` }}
        >
          {boardColumns.map((status) => {
            const label =
              TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
            const items = tasksByStatus.get(status) ?? [];
            const isAdding = quickAddColumn === status;

            return (
              <BoardColumn
                key={status}
                status={status}
                label={label}
                count={items.length}
                showQuickAddButton={!!onQuickCreate}
                onQuickAddClick={() => {
                  setQuickAddColumn(status);
                  setQuickAddTitle("");
                }}
              >
                {items.map((task) => (
                  <DraggableTaskCard
                    key={task.id}
                    task={task}
                    onSelect={onSelect}
                    onArchive={onArchive}
                  />
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
              </BoardColumn>
            );
          })}
        </div>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-1 cursor-grabbing shadow-lg">
            <TaskCard task={activeTask} onClick={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface BoardColumnProps {
  status: TaskStatus;
  label: string;
  count: number;
  showQuickAddButton: boolean;
  onQuickAddClick: () => void;
  children: React.ReactNode;
}

function BoardColumn({
  status,
  label,
  count,
  showQuickAddButton,
  onQuickAddClick,
  children,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      {/* Column header */}
      <div className="mb-2 flex h-8 items-center gap-2 px-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: statusDotColors[status] }}
        />
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
        <div className="flex-1" />
        {showQuickAddButton && (
          <button
            type="button"
            onClick={onQuickAddClick}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Add task to ${label}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Column body — droppable */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[320px] flex-1 flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-2 transition-colors",
          isOver && "border-foreground/40 bg-surface-selected"
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface DraggableTaskCardProps {
  task: Task;
  onSelect: (task: Task) => void;
  onArchive?: (id: string) => void;
}

function DraggableTaskCard({
  task,
  onSelect,
  onArchive,
}: DraggableTaskCardProps) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(isDragging && "opacity-50")}
    >
      <TaskCard
        task={task}
        onClick={() => onSelect(task)}
        onArchive={onArchive}
      />
    </div>
  );
}
