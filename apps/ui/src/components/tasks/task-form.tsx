"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EntityLinkList } from "@/components/shared/entity-link-list";
import { CommentThread } from "./comment-thread";
import { useComments } from "@/hooks/use-comments";
import { useLabels } from "@/hooks/use-labels";
import { Paperclip, Archive, AlertTriangle, Tag } from "lucide-react";
import { TaskActivityFeed } from "./task-activity-feed";
import { TaskRelations } from "./task-relations";
import { TaskLabelsPicker } from "./task-labels-picker";
import { TaskDeliverables } from "./task-deliverables";
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

/** Sub-component to avoid conditional useComments hook call */
function TaskFormComments({ taskId }: { taskId: string }) {
  const { comments, loading, actions } = useComments(taskId);
  return (
    <CommentThread
      comments={comments}
      loading={loading}
      onAddComment={actions.addComment}
      onEditComment={actions.editComment}
      onDeleteComment={actions.deleteComment}
      portal={false}
    />
  );
}

interface TaskFormProps {
  streams: Stream[];
  editingTask: Task | null;
  onSave: () => void;
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
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const [title, setTitle] = useState(editingTask?.title ?? defaultTitle ?? "");
  const [description, setDescription] = useState(editingTask?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(editingTask?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(editingTask?.priority ?? "medium");
  const [streamId, setStreamId] = useState(editingTask?.stream_id ?? "none");
  const [assignee, setAssignee] = useState(() => {
    if (editingTask?.assignee_type === "human") return "me";
    if (editingTask?.assignee_agent_id) return editingTask.assignee_agent_id;
    if (defaultAssignee) return defaultAssignee;
    return "none";
  });
  const [dueDate, setDueDate] = useState<string | null>(editingTask?.due_date ?? null);
  const [savedTaskId, setSavedTaskId] = useState<string | null>(editingTask?.id ?? null);
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(DEFAULT_RECURRENCE);
  const [tz, setTz] = useState<string>(browserTimezone());
  const [modelOverride, setModelOverride] = useState<string | null>(editingTask?.model_override ?? null);
  const [thinkingOverride, setThinkingOverride] = useState<string | null>(editingTask?.thinking_override ?? null);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const { actions: seriesActions } = useTaskSeries();
  const editingSeriesId = editingTask?.series_id ?? null;

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
      const { error } = await supabase.from("tasks").update(payload).eq("id", savedTaskId);
      if (error) {
        toast.error("Failed to save task", { description: error.message });
        setSaving(false);
        return;
      }
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task",
        entity_id: savedTaskId,
        action: "updated",
        summary: `Updated task '${payload.title}'`,
      });
    } else {
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
    }

    setSaving(false);
    if (!opts?.autoSave) onSave();
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

  async function handleAttachClick() {
    if (!savedTaskId) {
      await handleSubmit({ autoSave: true });
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (title.trim()) handleSubmit();
    }
  }

  const selectedStream = streams.find((s) => s.id === streamId);
  const selectedPriority = TASK_PRIORITIES.find((p) => p.value === priority);
  const isMissed = status === "missed";
  const isAgentAssigned = assignee !== "none" && assignee !== "me";
  const deliverableCount = editingTask?.deliverable_count ?? 0;

  return (
    <ResponsiveDialog open onOpenChange={(open) => !open && onCancel()}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-xl p-0 gap-0 max-h-[95dvh] sm:max-h-[85dvh] flex flex-col">
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
            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[11px] text-status-warning hover:text-status-warning px-1.5"
                onClick={() => setStatus("todo")}
              >
                Reopen
              </Button>
            </div>
          </div>
        )}

        {/* Title + description — non-scrollable */}
        <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-1 shrink-0">
          <textarea
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder={editingTask ? "Task title" : "What needs to be done?"}
            autoFocus
            rows={1}
            className="w-full resize-none overflow-hidden border-0 bg-transparent text-[15px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            rows={2}
            className="mt-1 min-h-[2.5rem] border-0 bg-transparent px-0 text-[13px] text-muted-foreground shadow-none resize-none focus-visible:ring-0 placeholder:text-muted-foreground/30"
          />
        </div>

        {/* Property bar — non-scrollable, dropdowns can overflow */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-1.5 border-t border-border/40 px-4 sm:px-5 py-2.5 shrink-0">
          {/* Status */}
          <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
            <SelectTrigger className="h-8 sm:h-6 w-auto gap-1 border-border/50 bg-transparent px-2.5 sm:px-2 text-xs font-normal hover:bg-accent rounded-md">
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

          {/* Priority */}
          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
            <SelectTrigger className="h-8 sm:h-6 w-auto gap-1 border-border/50 bg-transparent px-2.5 sm:px-2 text-xs font-normal hover:bg-accent rounded-md">
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

          {/* Stream */}
          <Select value={streamId} onValueChange={setStreamId}>
            <SelectTrigger className="h-8 sm:h-6 w-auto gap-1 border-border/50 bg-transparent px-2.5 sm:px-2 text-xs font-normal hover:bg-accent rounded-md">
              {selectedStream ? (
                <>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: selectedStream.color }} />
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
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Labels */}
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
              className="h-8 sm:h-6 flex items-center gap-1 border border-border/50 bg-transparent px-2.5 sm:px-2 text-xs font-normal hover:bg-accent rounded-md transition-colors text-muted-foreground disabled:opacity-50"
            >
              <Tag className="h-3 w-3" />
              Labels
            </button>
          )}

          {/* Assignee */}
          <MicroTip tipKey="task-assignee" content="Assign to an agent and it starts working immediately." position="bottom">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-8 sm:h-6 w-auto gap-1 border-border/50 bg-transparent px-2.5 sm:px-2 text-xs font-normal hover:bg-accent rounded-md">
                <span className="text-muted-foreground">
                  {assignee === "none" ? "Unassigned" : assignee === "me" ? "Me" : agents.find((a) => a.id === assignee)?.name ?? "Agent"}
                </span>
              </SelectTrigger>
              <SelectContent portal={false}>
                <SelectItem value="none">Unassigned</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </MicroTip>

          {/* Due date */}
          <DatePickerButton
            value={dueDate}
            onChange={setDueDate}
            placeholder="No due date"
            portal={false}
            className="h-8 sm:h-6 w-auto border-border/50 bg-transparent px-2.5 sm:px-2 text-xs font-normal hover:bg-accent rounded-md"
          />

          {/* Recurrence */}
          <RecurrencePicker value={recurrence} onChange={setRecurrence} timezone={tz} />

          {/* Model override — only show when assigned to an agent */}
          {assignee !== "none" && assignee !== "me" && (
            <TaskModelOverride
              modelOverride={modelOverride}
              thinkingOverride={thinkingOverride}
              onModelChange={setModelOverride}
              onThinkingChange={setThinkingOverride}
              agentId={assignee}
              agents={agents}
            />
          )}
        </div>

        {/* Tabbed content area */}
        {savedTaskId ? (
          <Tabs defaultValue="details" className="flex-1 min-h-0 flex flex-col gap-0">
            <TabsList variant="line" className="w-full justify-start border-t border-b border-border/40 px-4 sm:px-5 rounded-none h-9">
              <TabsTrigger value="details" className="text-xs px-3">
                Details
              </TabsTrigger>
              {(isAgentAssigned || deliverableCount > 0) && (
                <TabsTrigger value="deliverables" className="text-xs px-3">
                  Deliverables
                  {deliverableCount > 0 && (
                    <span className="ml-1 text-[10px] text-muted-foreground/60">
                      {deliverableCount}
                    </span>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger value="activity" className="text-xs px-3">
                Activity
              </TabsTrigger>
            </TabsList>

            {/* Details tab */}
            <TabsContent value="details" className="flex-1 overflow-y-auto min-h-0 m-0">
              {/* Relations */}
              <div className="border-b border-border/40 px-4 sm:px-5 py-2.5">
                <TaskRelations taskId={savedTaskId} />
              </div>

              {/* Links */}
              <div className="border-b border-border/40 px-4 sm:px-5 py-2.5">
                <EntityLinkList ownerType="task" ownerId={savedTaskId} />
              </div>

              {/* Comments */}
              <div className="px-4 sm:px-5 py-3">
                <TaskFormComments taskId={savedTaskId} />
              </div>
            </TabsContent>

            {/* Deliverables tab */}
            {(isAgentAssigned || deliverableCount > 0) && (
              <TabsContent value="deliverables" className="flex-1 overflow-y-auto min-h-0 m-0 px-4 sm:px-5 py-3">
                <TaskDeliverables taskId={savedTaskId} />
              </TabsContent>
            )}

            {/* Activity tab */}
            <TabsContent value="activity" className="flex-1 overflow-y-auto min-h-0 m-0 px-4 sm:px-5 py-3">
              <TaskActivityFeed taskId={savedTaskId} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="border-t border-border/40 px-4 sm:px-5 py-2">
              <button
                type="button"
                onClick={handleAttachClick}
                disabled={saving || !title.trim()}
                className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors disabled:opacity-50"
              >
                <Paperclip className="h-3 w-3" />
                Attach link
              </button>
            </div>
          </div>
        )}

        {/* Footer bar */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 sm:px-5 py-2.5 sm:py-2.5 shrink-0 bg-card/50">
          <div className="flex items-center gap-2">
            {editingTask && onArchive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onArchive(editingTask.id);
                  onCancel();
                }}
              >
                <Archive className="h-3 w-3 mr-1" />
                Archive
              </Button>
            )}
            <p className="text-[10px] text-muted-foreground/40">
              {savedTaskId ? "Press Save or ⏎" : "⏎ to create"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => handleSubmit()} disabled={saving || !title.trim()}>
              {saving && <Spinner className="mr-1.5 h-3 w-3" />}
              {saving ? "Saving..." : savedTaskId ? "Save" : "Create"}
            </Button>
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
