"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task, TaskStatus, TaskPriority, Stream } from "@/lib/tasks/types";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/tasks/types";
import type { Agent } from "@/lib/agents/types";
import { useTaskSeries } from "@/hooks/use-task-series";
import { formatInTimezone } from "@/lib/workspace/timezone";
import { shortCadenceLabel, longCadenceLabel } from "@/lib/tasks/cadence";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  RecurrencePicker,
  type RecurrenceValue,
} from "./recurrence-picker";
import Link from "next/link";
import {
  Repeat,
  Pause,
  Play,
  Trash2,
  Bot,
  User,
  CheckCircle2,
  Circle,
  Loader,
  AlertCircle,
  XCircle,
  ClockAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const statusIcons: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  in_progress: Loader,
  blocked: AlertCircle,
  done: CheckCircle2,
  cancelled: XCircle,
  missed: ClockAlert,
};

const statusDotColors: Record<TaskStatus, string> = {
  todo: "#6b7280",
  in_progress: "#3b82f6",
  blocked: "#ef4444",
  done: "#22c55e",
  cancelled: "#71717a",
  missed: "#f59e0b",
};

const priorityDotColors: Record<TaskPriority, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

interface SeriesFormProps {
  seriesId: string;
  onClose: () => void;
}

/**
 * Modal editor for a task_series. Mirrors TaskForm structure:
 * Dialog → title/description → property bar → status strip → actions → history.
 * Inline edits autosave on blur/change.
 */
export function SeriesForm({ seriesId, onClose }: SeriesFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const { series, actions, loading } = useTaskSeries({ seriesId });

  const [agents, setAgents] = useState<Agent[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [instances, setInstances] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingRecurrenceOff, setPendingRecurrenceOff] =
    useState<RecurrenceValue | null>(null);

  // Fetch adjacent data on mount / series change
  useEffect(() => {
    supabase.from("agents").select("*").order("name").then(({ data }) => {
      if (data) setAgents(data as Agent[]);
    });
    supabase
      .from("streams")
      .select("*")
      .eq("is_archived", false)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setStreams(data as Stream[]);
      });
  }, [supabase]);

  useEffect(() => {
    if (!seriesId) return;
    supabase
      .from("tasks")
      .select("*, assignee_agent:agents!tasks_assignee_agent_id_fkey(id, name, slug, avatar_url)")
      .eq("series_id", seriesId)
      .order("series_occurrence_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setInstances(data as unknown as Task[]);
      });
  }, [seriesId, supabase, series?.spawned_count, series?.last_spawned_at]);

  // Sync local title/description from server row
  useEffect(() => {
    if (!series) return;
    setTitle(series.title);
    setDescription(series.description ?? "");
    setShowDescription(!!series.description);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncing only on identity/field changes
  }, [series?.id, series?.title, series?.description]);

  const recurrenceValue: RecurrenceValue = useMemo(() => {
    if (!series) {
      return {
        enabled: true,
        cadenceType: "daily",
        intervalN: 1,
        daysOfWeek: [],
        dayOfMonth: null,
        timeOfDay: "09:00",
      };
    }
    return {
      enabled: true,
      cadenceType: series.cadence_type,
      intervalN: series.interval_n,
      daysOfWeek: series.days_of_week ?? [],
      dayOfMonth: series.day_of_month ?? null,
      timeOfDay: (series.time_of_day ?? "09:00").slice(0, 5),
    };
  }, [series]);

  const stats = useMemo(() => {
    const done = instances.filter((i) => i.status === "done").length;
    const missed = instances.filter((i) => i.status === "missed").length;
    const open = instances.filter(
      (i) => !["done", "cancelled", "missed"].includes(i.status)
    ).length;
    return { done, missed, open, total: instances.length };
  }, [instances]);

  if (loading || !series) {
    return (
      <ResponsiveDialog open onOpenChange={(o) => !o && onClose()}>
        <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-xl p-6">
          <ResponsiveDialogTitle className="sr-only">Loading recurring task</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">Loading</ResponsiveDialogDescription>
          <p className="text-xs text-muted-foreground">Loading…</p>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
  }

  async function save(updates: Parameters<typeof actions.updateSeries>[1], summary?: string) {
    await actions.updateSeries(series!.id, updates, summary);
  }

  async function handleTitleCommit() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === series!.title) {
      setTitle(series!.title);
      return;
    }
    await save({ title: trimmed }, `Renamed recurring task to '${trimmed}'`);
  }

  async function handleDescriptionCommit() {
    const trimmed = description.trim();
    if (trimmed === (series!.description ?? "")) return;
    await save({ description: trimmed || null }, `Updated description`);
  }

  async function handleRecurrenceChange(next: RecurrenceValue) {
    if (!next.enabled) {
      setPendingRecurrenceOff(next);
      return;
    }
    const timeOfDay =
      next.timeOfDay.length === 5 ? next.timeOfDay + ":00" : next.timeOfDay;
    await save(
      {
        cadence_type: next.cadenceType,
        interval_n: next.intervalN,
        days_of_week: next.daysOfWeek,
        day_of_month:
          next.cadenceType === "monthly" ? next.dayOfMonth : null,
        time_of_day: timeOfDay,
      },
      `Changed cadence to ${shortCadenceLabel({
        cadence_type: next.cadenceType,
        interval_n: next.intervalN,
        days_of_week: next.daysOfWeek,
        day_of_month: next.dayOfMonth,
        time_of_day: timeOfDay,
      })}`
    );
  }

  async function handlePriorityChange(next: TaskPriority) {
    if (next === series!.priority) return;
    await save({ priority: next }, `Priority set to ${next}`);
  }

  async function handleStreamChange(next: string) {
    const newStreamId = next === "none" ? null : next;
    if (newStreamId === (series!.stream_id ?? null)) return;
    await save({ stream_id: newStreamId }, `Updated stream`);
  }

  async function handleAssigneeChange(next: string) {
    const updates: {
      assignee_type: "human" | "agent" | null;
      assignee_agent_id: string | null;
    } =
      next === "me"
        ? { assignee_type: "human", assignee_agent_id: null }
        : next === "none"
          ? { assignee_type: null, assignee_agent_id: null }
          : { assignee_type: "agent", assignee_agent_id: next };

    if (
      updates.assignee_type === series!.assignee_type &&
      updates.assignee_agent_id === series!.assignee_agent_id
    ) {
      return;
    }
    await save(updates, `Updated assignee`);
  }

  async function handlePauseResume() {
    if (series!.is_paused) {
      await actions.resumeSeries(series!.id);
    } else {
      await actions.pauseSeries(series!.id);
    }
  }

  async function handleDelete() {
    await actions.deleteSeries(series!.id);
    onClose();
  }

  async function handleSpawnNow() {
    const ok = await actions.spawnNow();
    if (ok) {
      toast.success("Spawn triggered", {
        description: "If an occurrence was due, a new task was created.",
      });
    }
  }

  const selectedStream = streams.find((s) => s.id === series.stream_id);
  const assigneeValue: string =
    series.assignee_type === "human"
      ? "me"
      : series.assignee_agent_id ?? "none";
  const selectedPriority = TASK_PRIORITIES.find((p) => p.value === series.priority);

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <ResponsiveDialogTitle className="sr-only">Recurring task: {series.title}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          Edit the recurring task cadence, assignee, and other properties.
        </ResponsiveDialogDescription>

        {/* Title + description */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-start gap-2">
            <Repeat className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setTitle(series.title);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="flex-1 border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {showDescription ? (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionCommit}
              placeholder="Add description..."
              rows={2}
              className="mt-1 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none resize-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="mt-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Add description...
            </button>
          )}
        </div>

        {/* Scrollable middle */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Property bar */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-4 py-2.5">
            {/* Priority */}
            <Select value={series.priority} onValueChange={(v) => handlePriorityChange(v as TaskPriority)}>
              <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: priorityDotColors[series.priority] }}
                />
                <span>{selectedPriority?.label}</span>
              </SelectTrigger>
              <SelectContent portal={false}>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: priorityDotColors[p.value] }}
                    />
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stream */}
            <Select
              value={series.stream_id ?? "none"}
              onValueChange={handleStreamChange}
            >
              <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
                {selectedStream ? (
                  <>
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: selectedStream.color }}
                    />
                    <span>{selectedStream.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No stream</span>
                )}
              </SelectTrigger>
              <SelectContent portal={false}>
                <SelectItem value="none">No stream</SelectItem>
                {streams.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Assignee */}
            <Select value={assigneeValue} onValueChange={handleAssigneeChange}>
              <SelectTrigger className="h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent">
                <span className="flex items-center gap-1">
                  {assigneeValue === "me" ? (
                    <>
                      <User className="h-3 w-3" />
                      Me
                    </>
                  ) : assigneeValue !== "none" ? (
                    <>
                      <Bot className="h-3 w-3" />
                      {agents.find((a) => a.id === assigneeValue)?.name ?? "Agent"}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </span>
              </SelectTrigger>
              <SelectContent portal={false}>
                <SelectItem value="none">Unassigned</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Recurrence */}
            <RecurrencePicker
              value={recurrenceValue}
              onChange={handleRecurrenceChange}
              timezone={series.timezone}
            />
          </div>

          {/* Status + next-run strip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 px-4 py-2.5 text-[11px]">
            <StatusDot
              color={series.is_paused ? "#71717a" : "#22c55e"}
              label={series.is_paused ? "Paused" : "Active"}
            />
            <span className="text-muted-foreground">{longCadenceLabel(series)}</span>
            {series.next_occurrence_at && !series.is_paused && (
              <span className="text-muted-foreground">
                Next:{" "}
                <span className="text-foreground tabular-nums">
                  {formatInTimezone(series.next_occurrence_at, series.timezone)}
                </span>
              </span>
            )}
            <span className="text-muted-foreground tabular-nums">
              {series.spawned_count} run{series.spawned_count === 1 ? "" : "s"}
            </span>
          </div>

          {/* History */}
          <div className="border-t border-border/50 px-4 py-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium text-muted-foreground">History</h2>
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                {stats.done} done · {stats.missed} missed · {stats.open} open · {stats.total} total
              </span>
            </div>

            {instances.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No occurrences yet.</p>
            ) : (
              <div className="divide-y divide-border/40 rounded-md border border-border/50">
                {instances.slice(0, 20).map((task) => {
                  const StatusIcon = statusIcons[task.status];
                  const occurredAt = task.series_occurrence_at
                    ? formatInTimezone(task.series_occurrence_at, series.timezone)
                    : "—";
                  const completedAt = task.completed_at
                    ? format(new Date(task.completed_at), "MMM d HH:mm")
                    : null;
                  return (
                    <Link
                      key={task.id}
                      href={`/dashboard/tasks?task=${task.id}`}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 px-3 py-1.5 text-[11px] hover:bg-accent/60"
                      )}
                    >
                      <StatusIcon
                        className="h-3 w-3 shrink-0"
                        style={{ color: statusDotColors[task.status] }}
                      />
                      <span className="flex-1 truncate">{occurredAt}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {TASK_STATUSES.find((s) => s.value === task.status)?.label}
                      </span>
                      {completedAt && (
                        <span className="hidden shrink-0 text-muted-foreground/70 tabular-nums md:inline">
                          ✓ {completedAt}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handlePauseResume}
            >
              {series.is_paused ? (
                <>
                  <Play className="mr-1 h-3 w-3" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="mr-1 h-3 w-3" />
                  Pause
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSpawnNow}
              title="Run the spawner now — useful for testing"
            >
              <Zap className="mr-1 h-3 w-3" />
              Spawn now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </ResponsiveDialogContent>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete recurring task?"
        description="Future occurrences will stop being created. Past occurrences will stay in your task history."
        confirmLabel="Delete series"
        onConfirm={async () => {
          await handleDelete();
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={pendingRecurrenceOff !== null}
        title="Pause this recurring series?"
        description="No new occurrences will be generated until you re-enable recurrence. You can resume it at any time."
        confirmLabel="Pause series"
        tone="warning"
        onConfirm={async () => {
          if (series) {
            await actions.pauseSeries(series.id);
          }
          setPendingRecurrenceOff(null);
        }}
        onCancel={() => setPendingRecurrenceOff(null)}
      />
    </ResponsiveDialog>
  );
}
