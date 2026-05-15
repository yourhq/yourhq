"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SortingState } from "@tanstack/react-table";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import { TaskForm } from "@/components/tasks/task-form";
import { logAudit } from "@/lib/audit/log";
import { completeItem } from "@/lib/onboarding/progress";
import { useRealtimeSync } from "./use-realtime-sync";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

export function useTasks() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [streamFilter, setStreamFilterState] = useState(searchParams.get("stream") || "all");
  const [statusFilter, setStatusFilterState] = useState(searchParams.get("status") || "all");
  const [priorityFilter, setPriorityFilterState] = useState(searchParams.get("priority") || "all");
  const [assigneeFilter, setAssigneeFilterState] = useState(searchParams.get("assignee") || "all");
  const [labelFilter, setLabelFilterState] = useState(searchParams.get("label") || "all");
  const [showArchived, setShowArchivedState] = useState(searchParams.get("archived") === "1");
  const [sorting, setSortingState] = useState<SortingState>(() => {
    const sortParam = searchParams.get("sort");
    const dirParam = searchParams.get("dir");
    if (sortParam) {
      return [{ id: sortParam, desc: dirParam === "desc" }];
    }
    return [];
  });

  const supabase = useMemo(() => createClient(), []);

  const updateUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  function setStreamFilter(value: string) {
    setStreamFilterState(value);
    updateUrl({ stream: value === "all" ? null : value });
  }

  function setStatusFilter(value: string) {
    setStatusFilterState(value);
    updateUrl({ status: value === "all" ? null : value });
  }

  function setPriorityFilter(value: string) {
    setPriorityFilterState(value);
    updateUrl({ priority: value === "all" ? null : value });
  }

  function setAssigneeFilter(value: string) {
    setAssigneeFilterState(value);
    updateUrl({ assignee: value === "all" ? null : value });
  }

  function setLabelFilter(value: string) {
    setLabelFilterState(value);
    updateUrl({ label: value === "all" ? null : value });
  }

  function setShowArchived(value: boolean) {
    setShowArchivedState(value);
    updateUrl({ archived: value ? "1" : null });
  }

  function setSorting(updater: SortingState | ((prev: SortingState) => SortingState)) {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    setSortingState(next);
    if (next.length > 0) {
      updateUrl({ sort: next[0].id, dir: next[0].desc ? "desc" : "asc" });
    } else {
      updateUrl({ sort: null, dir: null });
    }
  }

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("tasks")
      .select("*, stream:streams(id, name, color, icon), assignee_agent:agents!tasks_assignee_agent_id_fkey(id, name, slug, avatar_url), series:task_series(id, cadence_type, interval_n, days_of_week, day_of_month, time_of_day, timezone)")
      .is("parent_id", null) // only top-level tasks
      .order("created_at", { ascending: false });

    if (showArchived) {
      query = query.not("archived_at", "is", null);
    } else {
      query = query.is("archived_at", null);
    }

    if (streamFilter !== "all") {
      query = query.eq("stream_id", streamFilter);
    }
    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (priorityFilter !== "all") {
      query = query.eq("priority", priorityFilter);
    }
    if (assigneeFilter === "me") {
      query = query.eq("assignee_type", "human");
    } else if (assigneeFilter === "unassigned") {
      query = query.is("assignee_type", null);
    } else if (assigneeFilter !== "all") {
      query = query.eq("assignee_agent_id", assigneeFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      const taskList = data as unknown as Task[];

      // Batch-fetch link counts, labels, and blocker counts
      if (taskList.length > 0) {
        const taskIds = taskList.map((t) => t.id);

        const [linkResult, labelResult, blockerResult, commentResult] = await Promise.all([
          supabase
            .from("entity_links")
            .select("owner_id, is_deliverable")
            .eq("owner_type", "task")
            .in("owner_id", taskIds),
          supabase
            .from("task_labels")
            .select("task_id, labels(*)")
            .in("task_id", taskIds),
          supabase
            .from("task_relations")
            .select("source_task_id")
            .eq("relation_type", "blocked_by")
            .in("source_task_id", taskIds),
          supabase
            .from("comments")
            .select("entity_id")
            .eq("entity_type", "task")
            .in("entity_id", taskIds),
        ]);

        if (linkResult.data) {
          const attachMap = new Map<string, number>();
          const delivMap = new Map<string, number>();
          for (const row of linkResult.data) {
            if (row.is_deliverable) {
              delivMap.set(row.owner_id, (delivMap.get(row.owner_id) ?? 0) + 1);
            } else {
              attachMap.set(row.owner_id, (attachMap.get(row.owner_id) ?? 0) + 1);
            }
          }
          for (const task of taskList) {
            task.attachment_count = attachMap.get(task.id) ?? 0;
            task.deliverable_count = delivMap.get(task.id) ?? 0;
          }
        }

        if (labelResult.data) {
          type LabelRow = { id: string; name: string; color: string; description: string | null; created_at: string };
          const labelMap = new Map<string, LabelRow[]>();
          for (const row of labelResult.data as unknown as { task_id: string; labels: LabelRow | null }[]) {
            if (!row.labels) continue;
            const existing = labelMap.get(row.task_id) ?? [];
            existing.push(row.labels);
            labelMap.set(row.task_id, existing);
          }
          for (const task of taskList) {
            task.labels = labelMap.get(task.id) ?? [];
          }
        }

        if (blockerResult.data) {
          const blockerMap = new Map<string, number>();
          for (const row of blockerResult.data) {
            blockerMap.set(row.source_task_id, (blockerMap.get(row.source_task_id) ?? 0) + 1);
          }
          for (const task of taskList) {
            task.blocker_count = blockerMap.get(task.id) ?? 0;
          }
        }

        if (commentResult.data) {
          const commentMap = new Map<string, number>();
          for (const row of commentResult.data) {
            commentMap.set(row.entity_id, (commentMap.get(row.entity_id) ?? 0) + 1);
          }
          for (const task of taskList) {
            task.comment_count = commentMap.get(task.id) ?? 0;
          }
        }
      }

      const filtered = labelFilter !== "all"
        ? taskList.filter((t) => t.labels?.some((l) => l.id === labelFilter))
        : taskList;

      setTasks(filtered);
    }
    setLoading(false);
  }, [supabase, streamFilter, statusFilter, priorityFilter, assigneeFilter, labelFilter, showArchived]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTasks();
  }, [fetchTasks]);

  // Real-time: sync tasks via single-row refetch (has stream + agent JOINs)
  const taskPostProcess = useCallback(
    async (task: Task): Promise<Task> => {
      const [linkResult, labelResult, blockerResult, commentResult] = await Promise.all([
        supabase
          .from("entity_links")
          .select("owner_id, is_deliverable")
          .eq("owner_type", "task")
          .eq("owner_id", task.id),
        supabase
          .from("task_labels")
          .select("labels(*)")
          .eq("task_id", task.id),
        supabase
          .from("task_relations")
          .select("id")
          .eq("source_task_id", task.id)
          .eq("relation_type", "blocked_by"),
        supabase
          .from("comments")
          .select("id")
          .eq("entity_type", "task")
          .eq("entity_id", task.id),
      ]);

      const nonDeliverableLinks = (linkResult.data ?? []).filter(
        (r: { is_deliverable: boolean }) => !r.is_deliverable
      );
      task.attachment_count = nonDeliverableLinks.length;
      task.deliverable_count = (linkResult.data ?? []).length - nonDeliverableLinks.length;
      task.blocker_count = blockerResult.data?.length ?? 0;
      task.comment_count = commentResult.data?.length ?? 0;

      if (labelResult.data) {
        task.labels = (labelResult.data as unknown as { labels: { id: string; name: string; color: string; description: string | null; created_at: string } | null }[])
          .map((r) => r.labels)
          .filter((l): l is NonNullable<typeof l> => l !== null);
      }

      return task;
    },
    [supabase]
  );

  const shouldIncludeTask = useCallback(
    (task: Task): boolean => {
      if (showArchived) {
        if (!task.archived_at) return false;
      } else {
        if (task.archived_at) return false;
      }
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (streamFilter !== "all" && task.stream_id !== streamFilter) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (assigneeFilter === "me" && task.assignee_type !== "human") return false;
      if (assigneeFilter === "unassigned" && task.assignee_type !== null) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "me" && assigneeFilter !== "unassigned" && task.assignee_agent_id !== assigneeFilter) return false;
      if (labelFilter !== "all" && !task.labels?.some((l) => l.id === labelFilter)) return false;
      return true;
    },
    [statusFilter, streamFilter, priorityFilter, assigneeFilter, labelFilter, showArchived]
  );

  useRealtimeSync<Task>({
    table: "tasks",
    select: "*, stream:streams(id, name, color, icon), assignee_agent:agents!tasks_assignee_agent_id_fkey(id, name, slug, avatar_url), series:task_series(id, cadence_type, interval_n, days_of_week, day_of_month, time_of_day, timezone)",
    items: tasks,
    setItems: setTasks,
    filter: "parent_id=is.null",
    postProcess: taskPostProcess,
    shouldInclude: shouldIncludeTask,
  });

  // Toast notifications when agent-assigned tasks change status
  useRealtime({
    table: "tasks",
    event: "UPDATE",
    onPayload: (payload) => {
      const oldRow = payload.old as Record<string, unknown>;
      const newRow = payload.new as Record<string, unknown>;
      if (!oldRow || !newRow) return;
      if (oldRow.status === newRow.status) return;
      if (newRow.assignee_type !== "agent") return;

      const title = (newRow.title as string) || "Untitled task";
      const agentTask = tasks.find((t) => t.id === newRow.id);
      const agentName = agentTask?.assignee_agent?.name || "Agent";

      if (newRow.status === "done") {
        toast.success(`${agentName} completed: ${title}`);
        completeItem("agentWorked");
      } else if (newRow.status === "blocked") {
        toast.warning(`${agentName} is blocked on: ${title}`);
      } else if (oldRow.status === "todo" && newRow.status === "in_progress") {
        toast.info(`${agentName} started: ${title}`);
      }
    },
  });

  async function handleStatusChange(id: string, status: TaskStatus) {
    const task = tasks.find((t) => t.id === id);
    const oldStatus = task?.status;

    // Optimistic update: reflect the change immediately in the UI
    if (statusFilter !== "all" && status !== statusFilter) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } else {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status } : t))
      );
    }

    const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
    if (error) {
      toast.error("Failed to update task status", { description: error.message });
      fetchTasks();
      return;
    }
    if (status === "done" && task?.assignee_agent_id) {
      completeItem("agentWorked");
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: id,
      action: "status_changed",
      summary: `Changed task '${task?.title ?? id}' from ${oldStatus} to ${status}`,
      changes: { status: { old: oldStatus, new: status } },
    });
  }

  async function handleArchiveTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    const { error } = await supabase.from("tasks").update({ archived_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast.error("Failed to archive task", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: id,
      action: "archived",
      summary: `Archived task '${task?.title ?? id}'`,
    });
    setSelectedTask(null);
    fetchTasks();
    toast("Task archived", {
      action: { label: "Undo", onClick: () => handleRestoreTask(id) },
    });
  }

  async function handleRestoreTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    const { error } = await supabase.from("tasks").update({ archived_at: null }).eq("id", id);
    if (error) {
      toast.error("Failed to restore task", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: id,
      action: "restored",
      summary: `Restored task '${task?.title ?? id}'`,
    });
    fetchTasks();
    toast.success("Task restored");
  }

  async function handleQuickCreateTask(
    title: string,
    status: TaskStatus,
    streamId?: string | null
  ) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: trimmed,
        status,
        priority: "medium",
        stream_id: streamId ?? null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error("Failed to create task");
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: data?.id ?? "unknown",
      action: "created",
      summary: `Created task '${trimmed}'`,
    });
    fetchTasks();
  }

  async function handleDeleteTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete task", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task",
      entity_id: id,
      action: "deleted",
      summary: `Deleted task '${task?.title ?? id}'`,
    });
    setSelectedTask(null);
    fetchTasks();
  }

  function openCreateForm() {
    setEditingTask(null);
    setShowForm(true);
  }

  function openEditForm(task: Task) {
    setEditingTask(task);
    setShowForm(true);
    setSelectedTask(null);
    updateUrl({ task: task.id });
  }

  function closeForm() {
    setShowForm(false);
    setEditingTask(null);
    updateUrl({ task: null });
  }

  function onFormSaved() {
    closeForm();
    fetchTasks();
  }

  // Resolve an id → task (hydrating joins) and open the modal.
  // Used by deep-link handling when the page reads `?task=<id>`.
  const openTaskById = useCallback(
    async (id: string) => {
      // Try the already-fetched list first
      const local = tasks.find((t) => t.id === id);
      if (local) {
        setEditingTask(local);
        setShowForm(true);
        setSelectedTask(null);
        return;
      }
      const { data } = await supabase
        .from("tasks")
        .select(
          "*, stream:streams(id, name, color, icon), assignee_agent:agents!tasks_assignee_agent_id_fkey(id, name, slug, avatar_url), series:task_series(id, cadence_type, interval_n, days_of_week, day_of_month, time_of_day, timezone)"
        )
        .eq("id", id)
        .maybeSingle();
      if (data) {
        setEditingTask(data as unknown as Task);
        setShowForm(true);
        setSelectedTask(null);
      }
    },
    [supabase, tasks]
  );

  const hasActiveFilters =
    streamFilter !== "all" ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    assigneeFilter !== "all" ||
    labelFilter !== "all" ||
    showArchived;

  function clearFilters() {
    setStreamFilterState("all");
    setStatusFilterState("all");
    setPriorityFilterState("all");
    setAssigneeFilterState("all");
    setLabelFilterState("all");
    setShowArchivedState(false);
    setSortingState([]);
    router.replace(pathname, { scroll: false });
  }

  return {
    tasks,
    loading,
    sorting,
    setSorting,
    filters: {
      streamFilter,
      setStreamFilter,
      statusFilter,
      setStatusFilter,
      priorityFilter,
      setPriorityFilter,
      assigneeFilter,
      setAssigneeFilter,
      labelFilter,
      setLabelFilter,
      showArchived,
      setShowArchived,
      hasActiveFilters,
      clearFilters,
    },
    actions: {
      fetchTasks,
      handleStatusChange,
      handleArchiveTask,
      handleRestoreTask,
      handleDeleteTask,
      handleQuickCreateTask,
    },
    selection: {
      selectedTask,
      setSelectedTask,
    },
    form: {
      showForm,
      editingTask,
      openCreateForm,
      openEditForm,
      openTaskById,
      closeForm,
      onFormSaved,
      FormComponent: TaskForm,
    },
  };
}
