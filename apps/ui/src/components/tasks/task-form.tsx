"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import { completeItem } from "@/lib/onboarding/progress";
import { MicroTip } from "@/components/onboarding/micro-tip";
import type { Task, TaskStatus, TaskPriority, Stream, Label } from "@/lib/tasks/types";
import type { Agent } from "@/lib/agents/types";
import { TASK_STATUSES, TASK_PRIORITIES } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerButton } from "@/components/ui/date-picker-button";
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
import { cn } from "@/lib/utils";
import { EntityLinkList } from "@/components/shared/entity-link-list";
import { useBufferedEntityLinks } from "@/hooks/use-buffered-entity-links";
import { useLabels } from "@/hooks/use-labels";
import {
  Archive,
  AlertTriangle,
  Tag,
  Check,
} from "lucide-react";
import { TaskRelations } from "./task-relations";
import { TaskLabelsPicker } from "./task-labels-picker";
import { TaskDeliverables } from "./task-deliverables";
import { TaskTimeline } from "./task-timeline";
import {
  RecurrencePicker,
  DEFAULT_RECURRENCE,
  type RecurrenceValue,
} from "./recurrence-picker";
import {
  RecurrenceScopeDialog,
  type EditScope,
} from "./recurrence-scope-dialog";
import { TaskModelOverride } from "./task-model-override";
import { useTaskSeries } from "@/hooks/use-task-series";
import { browserTimezone, getWorkspaceTimezone } from "@/lib/workspace/timezone";
import { shortCadenceLabel } from "@/lib/tasks/cadence";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const PROP_TRIGGER =
  "h-7 w-auto gap-1.5 border-transparent bg-transparent shadow-none dark:bg-transparent px-2 text-xs font-normal hover:bg-accent rounded-md justify-start";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-priority-urgent",
  high: "bg-priority-high",
  medium: "bg-priority-medium",
  low: "bg-priority-low",
};

const STATUS_ICONS: Record<string, string> = {
  todo: "○",
  in_progress: "◐",
  blocked: "◍",
  done: "●",
  cancelled: "⊘",
};

interface TaskFormProps {
  streams: Stream[];
  editingTask: Task | null;
  onSave: (createdTaskId?: string) => void;
  onCancel: () => void;
  onArchive?: (id: string) => void;
  defaultTitle?: string;
  defaultAssignee?: string;
}

export function TaskForm({ streams, editingTask, onSave, onCancel, onArchive, defaultTitle, defaultAssignee }: TaskFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditing = !!editingTask;

  const [title, setTitleRaw] = useState(editingTask?.title ?? defaultTitle ?? "");
  const [description, setDescriptionRaw] = useState(editingTask?.description ?? "");
  const [status, setStatusRaw] = useState<TaskStatus>(editingTask?.status ?? "todo");
  const [priority, setPriorityRaw] = useState<TaskPriority>(editingTask?.priority ?? "medium");
  const [streamId, setStreamIdRaw] = useState(editingTask?.stream_id ?? "none");
  const [assignee, setAssigneeRaw] = useState(() => {
    if (editingTask?.assignee_type === "human") return "me";
    if (editingTask?.assignee_agent_id) return editingTask.assignee_agent_id;
    if (defaultAssignee) return defaultAssignee;
    return "none";
  });
  const [dueDate, setDueDateRaw] = useState<string | null>(editingTask?.due_date ?? null);
  const [savedTaskId, setSavedTaskId] = useState<string | null>(editingTask?.id ?? null);
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(DEFAULT_RECURRENCE);
  const [tz, setTz] = useState<string>(browserTimezone());
  const [modelOverride, setModelOverrideRaw] = useState<string | null>(editingTask?.model_override ?? null);
  const [thinkingOverride, setThinkingOverrideRaw] = useState<string | null>(editingTask?.thinking_override ?? null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const { actions: seriesActions } = useTaskSeries();
  const editingSeriesId = editingTask?.series_id ?? null;

  // Sync local state when editingTask prop receives a fresh version from the DB
  // (e.g. openTaskById fetches after initial render with cached data)
  const lastSyncedIdRef = useRef<string | null>(editingTask?.id ?? null);
  const lastSyncedAtRef = useRef<string | null>(editingTask?.updated_at ?? null);
  useEffect(() => {
    if (!editingTask) return;
    const sameId = editingTask.id === lastSyncedIdRef.current;
    const sameVersion = editingTask.updated_at === lastSyncedAtRef.current;
    if (sameId && sameVersion) return;
    lastSyncedIdRef.current = editingTask.id;
    lastSyncedAtRef.current = editingTask.updated_at ?? null;
    if (!sameId || !sameVersion) {
      setTitleRaw(editingTask.title ?? "");
      setDescriptionRaw(editingTask.description ?? "");
      setStatusRaw(editingTask.status ?? "todo");
      setPriorityRaw(editingTask.priority ?? "medium");
      setStreamIdRaw(editingTask.stream_id ?? "none");
      setAssigneeRaw(
        editingTask.assignee_type === "human"
          ? "me"
          : editingTask.assignee_agent_id ?? "none"
      );
      setDueDateRaw(editingTask.due_date ?? null);
      setSavedTaskId(editingTask.id);
      setModelOverrideRaw(editingTask.model_override ?? null);
      setThinkingOverrideRaw(editingTask.thinking_override ?? null);
    }
  }, [editingTask]);

  // --- Auto-save infrastructure (only for existing tasks) ---

  const pendingFieldsRef = useRef<Record<string, unknown>>({});

  const flushSave = useCallback(async () => {
    const taskId = savedTaskId;
    if (!taskId) return;
    const fields = { ...pendingFieldsRef.current };
    if (Object.keys(fields).length === 0) return;
    pendingFieldsRef.current = {};

    setSaveStatus("saving");
    const { error } = await supabase.from("tasks").update(fields).eq("id", taskId);
    if (error) {
      toast.error("Auto-save failed", { description: error.message });
      setSaveStatus("idle");
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: taskId,
      action: "updated",
      summary: `Updated task fields: ${Object.keys(fields).join(", ")}`,
    });
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 2000);
  }, [savedTaskId, supabase]);

  const queueSave = useCallback(
    (fields: Record<string, unknown>, debounce: boolean) => {
      if (!savedTaskId) return;
      Object.assign(pendingFieldsRef.current, fields);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (debounce) {
        debounceRef.current = setTimeout(flushSave, 800);
      } else {
        flushSave();
      }
    },
    [savedTaskId, flushSave]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Flush any pending debounced text saves on close
  const handleClose = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      flushSave();
    }
    onCancel();
  }, [flushSave, onCancel]);

  // Wrapped setters: update local state and queue a save for existing tasks
  function setTitle(v: string) {
    setTitleRaw(v);
    if (isEditing) queueSave({ title: v.trim() }, true);
  }
  function setDescription(v: string) {
    setDescriptionRaw(v);
    if (isEditing) queueSave({ description: v.trim() || null }, true);
  }
  function setStatus(v: TaskStatus) {
    setStatusRaw(v);
    if (isEditing) queueSave({ status: v }, false);
  }
  function setPriority(v: TaskPriority) {
    setPriorityRaw(v);
    if (isEditing) queueSave({ priority: v }, false);
  }
  function setStreamId(v: string) {
    setStreamIdRaw(v);
    if (isEditing) queueSave({ stream_id: v !== "none" ? v : null }, false);
  }
  function setAssignee(v: string) {
    setAssigneeRaw(v);
    if (isEditing) {
      queueSave({
        assignee_type: v === "me" ? "human" : v !== "none" ? "agent" : null,
        assignee_agent_id: v !== "me" && v !== "none" ? v : null,
      }, false);
    }
  }
  function setDueDate(v: string | null) {
    setDueDateRaw(v);
    if (isEditing) queueSave({ due_date: v || null }, false);
  }
  function setModelOverride(v: SetStateAction<string | null>) {
    setModelOverrideRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (isEditing) queueSave({ model_override: next }, false);
      return next;
    });
  }
  function setThinkingOverride(v: SetStateAction<string | null>) {
    setThinkingOverrideRaw((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      if (isEditing) queueSave({ thinking_override: next }, false);
      return next;
    });
  }

  // Buffered entity links — works before and after save
  const entityLinks = useBufferedEntityLinks("task", savedTaskId);

  // Labels state
  const [taskLabels, setTaskLabels] = useState<Label[]>(editingTask?.labels ?? []);
  const { actions: labelActions } = useLabels();

  // Load task labels when editing
  useEffect(() => {
    if (!savedTaskId) return;
    labelActions.getTaskLabels(savedTaskId).then(setTaskLabels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTaskId]);

  // Load workspace timezone
  useEffect(() => {
    getWorkspaceTimezone().then(setTz);
  }, []);

  // If editing an instance of a series, load the series to prefill recurrence.
  useEffect(() => {
    if (!editingSeriesId) return;
    supabase
      .from("task_series")
      .select("*")
      .eq("id", editingSeriesId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setRecurrence({
          enabled: true,
          cadenceType: data.cadence_type,
          intervalN: data.interval_n ?? 1,
          daysOfWeek: data.days_of_week ?? [],
          dayOfMonth: data.day_of_month ?? null,
          timeOfDay: (data.time_of_day ?? "09:00").slice(0, 5),
        });
        if (data.timezone) setTz(data.timezone);
      });
  }, [editingSeriesId, supabase]);

  useEffect(() => {
    supabase.from("agents").select("*").order("name").then(({ data }) => {
      if (data) setAgents(data as Agent[]);
    });
  }, [supabase]);

  // Auto-resize title
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = "auto";
      titleRef.current.style.height = titleRef.current.scrollHeight + "px";
    }
  }, [title]);

  function buildTaskPayload() {
    return {
      title: title.trim(),
      description: description.trim() || null,
      status,
      priority,
      stream_id: streamId !== "none" ? streamId : null,
      assignee_type:
        assignee === "me"
          ? ("human" as const)
          : assignee !== "none"
            ? ("agent" as const)
            : null,
      assignee_agent_id:
        assignee !== "me" && assignee !== "none" ? assignee : null,
      due_date: dueDate || null,
      model_override: modelOverride,
      thinking_override: thinkingOverride,
    };
  }

  function buildSeriesPayload() {
    return {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      stream_id: streamId !== "none" ? streamId : null,
      assignee_type:
        assignee === "me"
          ? ("human" as const)
          : assignee !== "none"
            ? ("agent" as const)
            : null,
      assignee_agent_id:
        assignee !== "me" && assignee !== "none" ? assignee : null,
      tags: [] as string[],
      linked_entity_type: null,
      linked_entity_id: null,
      meta: {},
      cadence_type: recurrence.cadenceType,
      interval_n: recurrence.intervalN,
      days_of_week: recurrence.daysOfWeek,
      day_of_month:
        recurrence.cadenceType === "monthly" ? recurrence.dayOfMonth : null,
      time_of_day: recurrence.timeOfDay.length === 5
        ? recurrence.timeOfDay + ":00"
        : recurrence.timeOfDay,
      timezone: tz,
      is_paused: false,
      starts_on: new Date().toISOString().slice(0, 10),
      ends_on: null,
      ends_after_count: null,
      missed_policy: "auto_skip" as const,
      model_override: modelOverride,
      thinking_override: thinkingOverride,
    };
  }

  const handleSubmit = useCallback(async (opts?: { autoSave?: boolean }) => {
    if (!title.trim()) return;

    // Series recurrence scope dialog — still uses explicit save
    if (savedTaskId && editingSeriesId && recurrence.enabled && !opts?.autoSave) {
      setScopeDialogOpen(true);
      return;
    }

    setSaving(true);

    const payload = buildTaskPayload();

    if (recurrence.enabled && !editingSeriesId) {
      const seriesPayload = buildSeriesPayload();
      const series = await seriesActions.createSeries(seriesPayload);
      if (series && savedTaskId) {
        await supabase.from("tasks").delete().eq("id", savedTaskId);
        setSavedTaskId(null);
      }
      setSaving(false);
      if (series) {
        const cadenceLabel = shortCadenceLabel(seriesPayload);
        toast.success(`${cadenceLabel} task scheduled`, {
          description: `'${payload.title}' will spawn on cadence.`,
          action: {
            label: "View series",
            onClick: () =>
              router.push(`/dashboard/tasks?series=${series.id}`),
          },
        });
        if (!opts?.autoSave) onSave();
      }
      return;
    }

    if (savedTaskId) {
      // Existing task — auto-save handles field updates; just close
      setSaving(false);
      if (!opts?.autoSave) onSave();
      return;
    }

    // New task — insert
    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select("id")
      .single();
    if (error || !inserted) {
      toast.error("Failed to create task", { description: error?.message });
      setSaving(false);
      return;
    }
    setSavedTaskId(inserted.id);
    if (entityLinks.dirty) {
      await entityLinks.actions.flush(inserted.id);
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: inserted.id,
      action: "created",
      summary: `Created task '${payload.title}'`,
    });
    if (payload.assignee_agent_id) {
      completeItem("taskAssigned");
    }

    setSaving(false);
    if (!opts?.autoSave) onSave(inserted.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, status, priority, streamId, assignee, dueDate, modelOverride, thinkingOverride, savedTaskId, editingSeriesId, recurrence]);

  async function handleScopeConfirm(scope: EditScope) {
    setScopeDialogOpen(false);
    if (!savedTaskId) return;
    setSaving(true);

    if (scope === "instance") {
      const { error } = await supabase.from("tasks").update(buildTaskPayload()).eq("id", savedTaskId);
      if (error) {
        toast.error("Failed to update task", { description: error.message });
        setSaving(false);
        return;
      }
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task",
        entity_id: savedTaskId,
        action: "updated",
        summary: `Updated task occurrence`,
      });
    } else if (scope === "series" && editingSeriesId) {
      await seriesActions.updateSeries(editingSeriesId, buildSeriesPayload());
      const { error } = await supabase.from("tasks").update(buildTaskPayload()).eq("id", savedTaskId);
      if (error) {
        toast.error("Failed to update task", { description: error.message });
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSave();
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isEditing) {
        (e.target as HTMLElement).blur();
      } else if (title.trim()) {
        handleSubmit();
      }
    }
  }

  const selectedStream = streams.find((s) => s.id === streamId);
  const selectedPriority = TASK_PRIORITIES.find((p) => p.value === priority);
  const isMissed = status === "missed";
  const isAgentAssigned = assignee !== "none" && assignee !== "me";
  const deliverableCount = editingTask?.deliverable_count ?? 0;

  const assigneeAgent = assignee !== "none" && assignee !== "me"
    ? agents.find((a) => a.id === assignee)
    : undefined;
  const assigneeLabel = assignee === "none"
    ? "Unassigned"
    : assignee === "me"
      ? "Me"
      : assigneeAgent
        ? `${assigneeAgent.meta?.emoji ? `${assigneeAgent.meta.emoji} ` : ""}${assigneeAgent.name}`
        : "Agent";

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && handleClose()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-2xl p-0 gap-0 max-h-[95dvh] sm:max-h-[85dvh] flex flex-col">
        <ResponsiveDialogTitle className="sr-only">
          {editingTask ? "Edit task" : "New task"}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          Create or edit a task with title, description, status, priority, stream, assignee, and due date.
        </ResponsiveDialogDescription>

        {/* Missed task banner */}
        {isMissed && editingTask?.due_date && (
          <div className="flex items-center gap-2 bg-status-warning/10 border-b border-status-warning/20 px-4 sm:px-5 py-2 text-xs text-status-warning shrink-0">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>This task missed its deadline on {editingTask.due_date}.</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-5 text-[11px] text-status-warning hover:text-status-warning px-1.5"
              onClick={() => setStatus("todo")}
            >
              Reopen
            </Button>
          </div>
        )}

        {/* Title + description + save status */}
        <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-1 shrink-0">
          <div className="flex items-start gap-2">
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder={editingTask ? "Task title" : "What needs to be done?"}
              autoFocus
              rows={1}
              className="flex-1 resize-none overflow-hidden border-0 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
            />
            {isEditing && saveStatus !== "idle" && (
              <span className="shrink-0 mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/50">
                {saveStatus === "saving" && <><Spinner className="h-2.5 w-2.5" /> Saving</>}
                {saveStatus === "saved" && <><Check className="h-2.5 w-2.5" /> Saved</>}
              </span>
            )}
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            rows={2}
            className="mt-1 min-h-[2.5rem] border-0 bg-transparent dark:bg-transparent px-0 text-sm text-foreground/70 shadow-none resize-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
          />
        </div>

        {/* Scrollable body: properties + sections + timeline */}
        <div className="flex-1 overflow-y-auto min-h-0 border-t border-border/40">
          {/* Property grid */}
          <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_1fr] items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-3">
            {/* ── Status ── */}
            <span className="text-xs text-muted-foreground/70 py-1">Status</span>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger className={PROP_TRIGGER}>
                <span className="text-muted-foreground">{STATUS_ICONS[status]}</span>
                <span>{TASK_STATUSES.find((s) => s.value === status)?.label}</span>
              </SelectTrigger>
              <SelectContent portal={false}>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="mr-1.5 text-muted-foreground">{STATUS_ICONS[s.value]}</span>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* ── Priority ── */}
            <span className="text-xs text-muted-foreground/70 py-1">Priority</span>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className={PROP_TRIGGER}>
                <span className={cn("h-2 w-2 rounded-full", PRIORITY_COLORS[priority])} />
                <span>{selectedPriority?.label}</span>
              </SelectTrigger>
              <SelectContent portal={false}>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", PRIORITY_COLORS[p.value])} />
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* ── Assignee ── */}
            <span className="text-xs text-muted-foreground/70 py-1">Assignee</span>
            <MicroTip tipKey="task-assignee" content="Assign to an agent and it starts working immediately." position="bottom">
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className={PROP_TRIGGER}>
                  <span>{assigneeLabel}</span>
                </SelectTrigger>
                <SelectContent portal={false}>
                  <SelectItem value="none">Unassigned</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.meta?.emoji ? `${a.meta.emoji} ` : ""}{a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MicroTip>

            {/* ── Thinking level — next to Assignee since it's agent-related ── */}
            {isAgentAssigned && (
              <>
                <span className="text-xs text-muted-foreground/70 py-1">Thinking</span>
                <div>
                  <TaskModelOverride
                    modelOverride={modelOverride}
                    thinkingOverride={thinkingOverride}
                    onModelChange={setModelOverride}
                    onThinkingChange={setThinkingOverride}
                    agentId={assignee}
                    agents={agents}
                  />
                </div>
              </>
            )}

            {/* ── Due date ── */}
            <span className="text-xs text-muted-foreground/70 py-1">Due date</span>
            <DatePickerButton
              value={dueDate}
              onChange={setDueDate}
              placeholder="None"
              portal={false}
              className="h-7 !w-auto !border-0 bg-transparent shadow-none dark:!bg-transparent px-2 text-xs font-normal hover:bg-accent rounded-md justify-start"
            />

            {/* ── Recurrence — next to Due date since they're related ── */}
            <span className="text-xs text-muted-foreground/70 py-1">Repeat</span>
            <div>
              <RecurrencePicker value={recurrence} onChange={setRecurrence} timezone={tz} />
            </div>

            {/* ── Divider ── */}
            <div className="col-span-full border-t border-border/20 -my-0.5" />

            {/* ── Stream ── */}
            <span className="text-xs text-muted-foreground/70 py-1">Stream</span>
            <Select value={streamId} onValueChange={setStreamId}>
              <SelectTrigger className={PROP_TRIGGER}>
                {selectedStream ? (
                  <>
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: selectedStream.color }} />
                    <span>{selectedStream.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground/60">None</span>
                )}
              </SelectTrigger>
              <SelectContent portal={false}>
                <SelectItem value="none">None</SelectItem>
                {streams.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* ── Labels ── */}
            <span className="text-xs text-muted-foreground/70 py-1">Labels</span>
            <div>
              {savedTaskId ? (
                <TaskLabelsPicker
                  taskId={savedTaskId}
                  selectedLabels={taskLabels}
                  onLabelsChange={setTaskLabels}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => { if (title.trim()) handleSubmit({ autoSave: true }); }}
                  disabled={!title.trim() || saving}
                  className="h-7 flex items-center gap-1.5 bg-transparent px-2 text-xs font-normal hover:bg-accent rounded-md transition-colors text-muted-foreground/60 disabled:opacity-50"
                >
                  <Tag className="h-3 w-3" />
                  Add labels
                </button>
              )}
            </div>
          </div>

          {/* ── Content sections ── */}
          {savedTaskId ? (
            <>
              <div className="border-t border-border/40 px-4 sm:px-5 py-2.5">
                <TaskRelations taskId={savedTaskId} />
              </div>

              <div className="border-t border-border/40 px-4 sm:px-5 py-2.5">
                <EntityLinkList ownerType="task" ownerId={savedTaskId} />
              </div>

              {deliverableCount > 0 && (
                <div className="border-t border-border/40 px-4 sm:px-5 py-2.5">
                  <TaskDeliverables taskId={savedTaskId} />
                </div>
              )}

              <div className="border-t border-border/40 px-4 sm:px-5 py-3">
                <TaskTimeline taskId={savedTaskId} />
              </div>
            </>
          ) : (
            <div className="border-t border-border/40 px-4 sm:px-5 py-2.5">
              <EntityLinkList
                links={entityLinks.links}
                onAddLink={entityLinks.actions.addLink}
                onRemoveLink={entityLinks.actions.removeLink}
                searchTargets={entityLinks.actions.searchTargets}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 sm:px-5 py-2 shrink-0 bg-card/50">
          <div className="flex items-center gap-2">
            {isEditing && editingTask && onArchive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground/60 hover:text-foreground"
                onClick={() => { onArchive(editingTask.id); handleClose(); }}
              >
                <Archive className="h-3 w-3 mr-1" />
                Archive
              </Button>
            )}
            {!isEditing && (
              <p className="text-[10px] text-muted-foreground/40">
                ⏎ to create
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClose}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
                  Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs px-4" onClick={() => handleSubmit()} disabled={saving || !title.trim()}>
                  {saving && <Spinner className="mr-1.5 h-3 w-3" />}
                  {saving ? "Creating..." : "Create"}
                </Button>
              </>
            )}
          </div>
        </div>
      </ResponsiveDialogContent>
      <RecurrenceScopeDialog
        open={scopeDialogOpen}
        onCancel={() => setScopeDialogOpen(false)}
        onConfirm={handleScopeConfirm}
      />
    </ResponsiveDialog>
  );
}
