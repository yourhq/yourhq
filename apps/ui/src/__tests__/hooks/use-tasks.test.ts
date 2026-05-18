import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildTask } from "@/__tests__/helpers/factories";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/onboarding/progress", () => ({ completeItem: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-realtime-sync", () => ({ useRealtimeSync: vi.fn() }));
vi.mock("@/hooks/use-realtime", () => ({ useRealtime: vi.fn() }));
vi.mock("@/components/tasks/task-form", () => ({ TaskForm: () => null }));

import { logAudit } from "@/lib/audit/log";
import { trackEvent } from "@/lib/analytics";

const task1 = buildTask({ id: "t-1", title: "Task One", status: "todo" });
const task2 = buildTask({ id: "t-2", title: "Task Two", status: "in_progress" });

function setupMock(tableOverrides?: Record<string, Record<string, unknown>>) {
  const tables = new Map<string, Record<string, unknown>>([
    ["tasks", { select: { data: [task1, task2], error: null }, insert: { data: [{ id: "t-new" }], error: null }, update: { data: [], error: null }, delete: { data: [], error: null } }],
    ["entity_links", { select: { data: [], error: null } }],
    ["task_labels", { select: { data: [], error: null } }],
    ["task_relations", { select: { data: [], error: null } }],
    ["comments", { select: { data: [], error: null } }],
  ]);
  if (tableOverrides) {
    for (const [k, v] of Object.entries(tableOverrides)) {
      const existing = tables.get(k) ?? {};
      tables.set(k, { ...existing, ...v });
    }
  }
  mockSupabase = createMockSupabaseClient({ tables });
}

describe("useTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock();
  });

  it("fetches tasks on mount with correct select", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
    expect(result.current.tasks).toHaveLength(2);
  });

  it("returns loading state", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("handleStatusChange updates task status optimistically", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleStatusChange("t-1", "in_progress");
    });

    const updatedTask = result.current.tasks.find((t) => t.id === "t-1");
    expect(updatedTask?.status).toBe("in_progress");
  });

  it("handleStatusChange calls supabase update", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleStatusChange("t-1", "done");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "status_changed" }),
    );
  });

  it("handleArchiveTask updates archived_at and calls logAudit", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleArchiveTask("t-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "archived", entity_type: "task" }),
    );
  });

  it("handleRestoreTask restores task", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleRestoreTask("t-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "restored" }),
    );
  });

  it("handleDeleteTask deletes task", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleDeleteTask("t-1");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted" }),
    );
  });

  it("handleQuickCreateTask inserts with title/status/priority", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleQuickCreateTask("Quick task", "todo");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created" }),
    );
    expect(trackEvent).toHaveBeenCalledWith("task_created", { status: "todo" });
  });

  it("filters.setStreamFilter updates state", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setStreamFilter("stream-1");
    });

    expect(result.current.filters.streamFilter).toBe("stream-1");
  });

  it("filters.setStatusFilter updates state", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setStatusFilter("done");
    });

    expect(result.current.filters.statusFilter).toBe("done");
  });

  it("filters.setPriorityFilter updates state", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setPriorityFilter("high");
    });

    expect(result.current.filters.priorityFilter).toBe("high");
  });

  it("filters.setAssigneeFilter updates state", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setAssigneeFilter("me");
    });

    expect(result.current.filters.assigneeFilter).toBe("me");
  });

  it("filters.setLabelFilter updates state", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setLabelFilter("label-1");
    });

    expect(result.current.filters.labelFilter).toBe("label-1");
  });

  it("filters.setShowArchived updates state", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setShowArchived(true);
    });

    expect(result.current.filters.showArchived).toBe(true);
  });

  it("clearFilters resets all filters", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setStatusFilter("done");
      result.current.filters.setPriorityFilter("high");
    });

    act(() => {
      result.current.filters.clearFilters();
    });

    expect(result.current.filters.statusFilter).toBe("all");
    expect(result.current.filters.priorityFilter).toBe("all");
    expect(result.current.filters.streamFilter).toBe("all");
    expect(result.current.filters.assigneeFilter).toBe("all");
    expect(result.current.filters.labelFilter).toBe("all");
    expect(result.current.filters.showArchived).toBe(false);
  });

  it("form.openCreateForm/closeForm toggle showForm", async () => {
    const { useTasks } = await import("@/hooks/use-tasks");
    const { result } = renderHook(() => useTasks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.form.showForm).toBe(false);

    act(() => {
      result.current.form.openCreateForm();
    });
    expect(result.current.form.showForm).toBe(true);

    act(() => {
      result.current.form.closeForm();
    });
    expect(result.current.form.showForm).toBe(false);
  });
});
