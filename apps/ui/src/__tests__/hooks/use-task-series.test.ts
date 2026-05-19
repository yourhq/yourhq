import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";

let counter = 0;

function buildSeries(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `series-${counter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    title: "Daily standup",
    description: null,
    priority: "medium" as const,
    assignee_type: null,
    assignee_agent_id: null,
    stream_id: null,
    linked_entity_type: null,
    linked_entity_id: null,
    model_override: null,
    thinking_override: null,
    meta: {},
    tags: [],
    cadence_type: "daily" as const,
    interval_n: 1,
    days_of_week: [],
    day_of_month: null,
    time_of_day: "09:00",
    timezone: "UTC",
    starts_on: "2025-01-01",
    ends_on: null,
    ends_after_count: null,
    is_paused: false,
    spawned_count: 0,
    next_occurrence_at: null,
    last_spawned_at: null,
    missed_policy: "auto_skip" as const,
    stream: null,
    assignee_agent: null,
    ...overrides,
  };
}

function getFromCalls(table: string) {
  const calls = mockSupabase.from.mock.calls;
  const results = mockSupabase.from.mock.results;
  const builders: unknown[] = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === table) {
      builders.push(results[i].value);
    }
  }
  return builders;
}

function findMutationCall(table: string, method: "insert" | "update" | "delete") {
  const builders = getFromCalls(table);
  for (const b of builders) {
    const fn = (b as Record<string, ReturnType<typeof vi.fn>>)[method];
    if (fn && fn.mock && fn.mock.calls.length > 0) {
      return fn;
    }
  }
  return null;
}

function setupMock(overrides?: {
  seriesList?: unknown[];
  insertResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
  updateResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
  deleteResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
  rpcResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
}) {
  const seriesList = overrides?.seriesList ?? [
    buildSeries({ id: "series-a", title: "Daily standup" }),
    buildSeries({ id: "series-b", title: "Weekly review", cadence_type: "weekly" }),
  ];

  const insertResp = overrides?.insertResponse ?? {
    data: [seriesList[0]],
    error: null,
  };
  const updateResp = overrides?.updateResponse ?? { data: [], error: null };
  const deleteResp = overrides?.deleteResponse ?? { data: [], error: null };
  const rpcResp = overrides?.rpcResponse ?? { data: null, error: null };

  mockSupabase = createMockSupabaseClient({
    tables: new Map([
      [
        "task_series",
        {
          select: { data: seriesList, error: null },
          insert: insertResp,
          update: updateResp,
          delete: deleteResp,
        },
      ],
    ]),
    rpcs: new Map([["spawn_due_task_instances", rpcResp]]),
  });
}

async function renderTaskSeries(options?: { seriesId?: string }) {
  const { useTaskSeries } = await import("@/hooks/use-task-series");
  return renderHook(() => useTaskSeries(options));
}

describe("useTaskSeries", () => {
  beforeEach(() => {
    counter = 0;
    vi.clearAllMocks();
  });

  it("fetches series on mount and sets loading=false", async () => {
    setupMock();
    const { result } = await renderTaskSeries();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.seriesList).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("task_series");
  });

  it("filters by seriesId when option provided", async () => {
    const single = buildSeries({ id: "series-specific", title: "Specific" });
    setupMock({ seriesList: [single] });
    const { result } = await renderTaskSeries({ seriesId: "series-specific" });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const builders = getFromCalls("task_series");
    expect(builders.length).toBeGreaterThan(0);

    const lastBuilder = builders[builders.length - 1] as Record<string, ReturnType<typeof vi.fn>>;
    expect(lastBuilder.eq).toHaveBeenCalledWith("id", "series-specific");
  });

  it("returns series (first item) when seriesId provided, null otherwise", async () => {
    const single = buildSeries({ id: "series-x", title: "Target" });
    setupMock({ seriesList: [single] });

    const { result } = await renderTaskSeries({ seriesId: "series-x" });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.series).not.toBeNull();
    expect(result.current.series?.id).toBe("series-x");

    vi.clearAllMocks();
    counter = 0;
    setupMock();
    const { result: result2 } = await renderTaskSeries();
    await waitFor(() => expect(result2.current.loading).toBe(false));

    expect(result2.current.series).toBeNull();
  });

  it("createSeries inserts, calls logAudit, kicks spawn RPC", async () => {
    const created = buildSeries({ id: "series-new", title: "New series" });
    setupMock({ insertResponse: { data: [created], error: null } });
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.actions.createSeries({
        title: "New series",
        cadence_type: "daily",
        interval_n: 1,
        days_of_week: [],
        day_of_month: null,
        time_of_day: "09:00",
        timezone: "UTC",
        starts_on: "2025-01-01",
        ends_on: null,
        ends_after_count: null,
        is_paused: false,
        missed_policy: "auto_skip",
        description: null,
        priority: "medium",
        assignee_type: null,
        assignee_agent_id: null,
        stream_id: null,
        linked_entity_type: null,
        linked_entity_id: null,
        model_override: null,
        thinking_override: null,
        meta: {},
        tags: [],
      } as never);
    });

    expect(returned).not.toBeNull();
    expect((returned as { id: string }).id).toBe("series-new");

    const insertFn = findMutationCall("task_series", "insert");
    expect(insertFn).not.toBeNull();

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        module: "tasks",
        entity_type: "task_series",
        entity_id: "series-new",
        action: "created",
        summary: expect.stringContaining("New series"),
      }),
    );

    expect(mockSupabase.rpc).toHaveBeenCalledWith("spawn_due_task_instances");
  });

  it("createSeries returns null and shows toast on error", async () => {
    setupMock({
      insertResponse: { data: null, error: { message: "insert failed" } },
    });
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: unknown;
    await act(async () => {
      returned = await result.current.actions.createSeries({
        title: "Bad series",
        cadence_type: "daily",
        interval_n: 1,
        days_of_week: [],
        day_of_month: null,
        time_of_day: "09:00",
        timezone: "UTC",
        starts_on: "2025-01-01",
        ends_on: null,
        ends_after_count: null,
        is_paused: false,
        missed_policy: "auto_skip",
        description: null,
        priority: "medium",
        assignee_type: null,
        assignee_agent_id: null,
        stream_id: null,
        linked_entity_type: null,
        linked_entity_id: null,
        model_override: null,
        thinking_override: null,
        meta: {},
        tags: [],
      } as never);
    });

    expect(returned).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to create recurring task",
      expect.objectContaining({ description: "insert failed" }),
    );
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("updateSeries updates and calls logAudit", async () => {
    setupMock();
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateSeries("series-a", { title: "Updated standup" });
    });

    const updateFn = findMutationCall("task_series", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn!.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: "Updated standup" }),
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        module: "tasks",
        entity_type: "task_series",
        entity_id: "series-a",
        action: "updated",
      }),
    );
  });

  it("updateSeries shows toast on error", async () => {
    setupMock({
      updateResponse: { data: null, error: { message: "update failed" } },
    });
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateSeries("series-a", { title: "Bad update" });
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to update recurring task",
      expect.objectContaining({ description: "update failed" }),
    );
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("pauseSeries calls updateSeries with is_paused: true", async () => {
    setupMock();
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.pauseSeries("series-a");
    });

    const updateFn = findMutationCall("task_series", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn!.mock.calls[0][0]).toEqual(
      expect.objectContaining({ is_paused: true }),
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "updated",
        summary: "Paused recurring task",
      }),
    );
  });

  it("resumeSeries calls updateSeries with is_paused: false", async () => {
    setupMock();
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.resumeSeries("series-a");
    });

    const updateFn = findMutationCall("task_series", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn!.mock.calls[0][0]).toEqual(
      expect.objectContaining({ is_paused: false }),
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "updated",
        summary: "Resumed recurring task",
      }),
    );
  });

  it("deleteSeries deletes and calls logAudit", async () => {
    setupMock();
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteSeries("series-a");
    });

    const deleteFn = findMutationCall("task_series", "delete");
    expect(deleteFn).not.toBeNull();

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        module: "tasks",
        entity_type: "task_series",
        entity_id: "series-a",
        action: "deleted",
        summary: "Deleted recurring task",
      }),
    );
  });

  it("deleteSeries shows toast on error", async () => {
    setupMock({
      deleteResponse: { data: null, error: { message: "delete failed" } },
    });
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteSeries("series-a");
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to delete recurring task",
      expect.objectContaining({ description: "delete failed" }),
    );
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("spawnNow calls spawn_due_task_instances RPC", async () => {
    setupMock();
    const { result } = await renderTaskSeries();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let success: unknown;
    await act(async () => {
      success = await result.current.actions.spawnNow();
    });

    expect(success).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("spawn_due_task_instances");
  });
});
