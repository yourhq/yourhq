"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/audit/log";
import { Button } from "@/components/ui/button";
import {
  Circle,
  Loader,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ClockAlert,
  Plus,
  User,
  Bot,
  Calendar,
} from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";
import { toast } from "sonner";

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

interface TaskSubtasksProps {
  taskId: string;
  streamId?: string | null;
  onOpenSubtask?: (task: Task) => void;
}

export function TaskSubtasks({ taskId, streamId, onOpenSubtask }: TaskSubtasksProps) {
  const supabase = useMemo(() => createClient(), []);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("tasks")
      .select("*, assignee_agent:agents!tasks_assignee_agent_id_fkey(id, name, slug, avatar_url, meta)")
      .eq("parent_id", taskId)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setSubtasks(data as unknown as Task[]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [supabase, taskId]);

  const handleStatusToggle = useCallback(
    async (subtask: Task, e: React.MouseEvent) => {
      e.stopPropagation();
      const next: TaskStatus = subtask.status === "done" ? "todo" : "done";
      const updates: Record<string, unknown> = { status: next };
      if (next === "done") updates.completed_at = new Date().toISOString();
      else updates.completed_at = null;
      await supabase.from("tasks").update(updates).eq("id", subtask.id);
      setSubtasks((prev) =>
        prev.map((t) => (t.id === subtask.id ? { ...t, status: next, completed_at: updates.completed_at as string | null } : t))
      );
    },
    [supabase]
  );

  const handleCreate = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        parent_id: taskId,
        stream_id: streamId ?? null,
        status: "todo" as const,
        priority: "medium" as const,
      })
      .select("*, assignee_agent:agents!tasks_assignee_agent_id_fkey(id, name, slug, avatar_url, meta)")
      .single();
    if (error || !data) {
      toast.error("Failed to create subtask", { description: error?.message });
      setCreating(false);
      return;
    }
    const task = data as unknown as Task;
    setSubtasks((prev) => [...prev, task]);
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: task.id,
      action: "created",
      summary: `Created subtask '${title}'`,
    });
    setNewTitle("");
    setCreating(false);
    inputRef.current?.focus();
  }, [supabase, taskId, streamId, newTitle]);

  const doneCount = subtasks.filter((t) => t.status === "done").length;
  const total = subtasks.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Subtasks
            {total > 0 && (
              <span className="ml-1 text-muted-foreground/60">
                {doneCount}/{total}
              </span>
            )}
          </span>
        </div>
        {!adding && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setAdding(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1 rounded-full bg-border/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--status-success)] transition-all duration-300"
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </div>
      )}

      {/* Subtask list */}
      {!loading && subtasks.length > 0 && (
        <div className="space-y-0.5">
          {subtasks.map((subtask) => {
            const StatusIcon = statusIcons[subtask.status];
            const isDone = subtask.status === "done";
            const overdue =
              subtask.due_date &&
              isPast(parseISO(subtask.due_date)) &&
              !isToday(parseISO(subtask.due_date)) &&
              !isDone;

            return (
              <div
                key={subtask.id}
                onClick={() => onOpenSubtask?.(subtask)}
                className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/40 transition-colors cursor-pointer"
              >
                <button
                  type="button"
                  onClick={(e) => handleStatusToggle(subtask, e)}
                  className={cn(
                    "shrink-0 rounded p-0.5 transition-colors hover:bg-accent",
                    statusIconColors[subtask.status]
                  )}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                </button>
                <span
                  className={cn(
                    "flex-1 truncate text-sm",
                    isDone && "line-through text-muted-foreground"
                  )}
                >
                  {subtask.title}
                </span>
                {subtask.assignee_type === "agent" && subtask.assignee_agent ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground/60 flex items-center gap-1">
                    {subtask.assignee_agent.meta?.emoji ? (
                      <span>{subtask.assignee_agent.meta.emoji as string}</span>
                    ) : (
                      <Bot className="h-3 w-3" />
                    )}
                    <span className="hidden sm:inline truncate max-w-[80px]">
                      {subtask.assignee_agent.name}
                    </span>
                  </span>
                ) : subtask.assignee_type === "human" ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground/60 flex items-center gap-1">
                    <User className="h-3 w-3" />
                  </span>
                ) : null}
                {subtask.due_date && (
                  <span
                    className={cn(
                      "shrink-0 text-[11px] tabular-nums flex items-center gap-0.5",
                      overdue ? "text-[var(--status-error)]" : "text-muted-foreground/60"
                    )}
                  >
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(subtask.due_date), "MMM d")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline create */}
      {adding && (
        <div className="flex items-center gap-2 px-2">
          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) handleCreate();
              if (e.key === "Escape") {
                setAdding(false);
                setNewTitle("");
              }
            }}
            placeholder="Add subtask..."
            disabled={creating}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
          />
          {newTitle.trim() && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={handleCreate}
              disabled={creating}
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
