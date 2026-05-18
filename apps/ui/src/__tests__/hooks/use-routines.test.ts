import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildRoutine } from "@/__tests__/helpers/factories";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/onboarding/progress", () => ({
  completeItem: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

import { logAudit } from "@/lib/audit/log";
import { trackEvent } from "@/lib/analytics";
import { completeItem } from "@/lib/onboarding/progress";
import { toast } from "sonner";

function getFromCalls(table: string) {
  const calls = mockSupabase.from.mock.calls;
  const results = mockSupabase.from.mock.results;
  const builders: any[] = [];
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
    const fn = b[method];
    if (fn && fn.mock && fn.mock.calls.length > 0) {
      return fn;
    }
  }
  return null;
}

function makeRoutines() {
  return [
    buildRoutine({
      id: "routine-1",
      name: "Daily standup",
      instruction: "Post standup summary",
      trigger_type: "schedule",
      cadence_type: "daily",
      timezone: "UTC",
      is_active: true,
      run_count: 0,
      agent: { id: "agent-1", name: "Helper Bot", slug: "helper-bot" },
      agent_slug: "helper-bot",
      agent_id: "agent-1",
    }),
    buildRoutine({
      id: "routine-2",
      name: "On contact created",
      instruction: "Send welcome email",
      trigger_type: "event",
      cadence_type: null,
      timezone: null,
      is_active: true,
      run_count: 0,
      agent: { id: "agent-2", name: "Outreach Bot", slug: "outreach-bot" },
      agent_slug: "outreach-bot",
      agent_id: "agent-2",
    }),
  ];
}

function setupMock(overrides?: {
  routines?: unknown[];
  insertResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
  updateResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
  deleteResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
  rpcResponse?: { data: unknown; error: null };
}) {
  const routines = overrides?.routines ?? makeRoutines();
  const insertResp = overrides?.insertResponse ?? {
    data: [routines[0]],
    error: null,
  };
  const updateResp = overrides?.updateResponse ?? { data: [], error: null };
  const deleteResp = overrides?.deleteResponse ?? { data: [], error: null };
  const rpcResp = overrides?.rpcResponse ?? {
    data: "2026-01-02T09:00:00Z",
    error: null,
  };

  mockSupabase = createMockSupabaseClient({
    tables: new Map([
      [
        "routines",
        {
          select: { data: routines, error: null },
          insert: insertResp,
          update: updateResp,
          delete: deleteResp,
        },
      ],
      [
        "agents",
        {
          select: {
            data: [{ slug: "helper-bot" }],
            error: null,
          },
        },
      ],
      [
        "agent_inbox_items",
        {
          insert: { data: [{ id: "inbox-1" }], error: null },
        },
      ],
    ]),
    rpcs: new Map([
      ["routine_next_occurrence", rpcResp],
    ]),
  });
}

async function renderRoutines() {
  const { useRoutines } = await import("@/hooks/use-routines");
  return renderHook(() => useRoutines());
}

describe("useRoutines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches routines on mount with agent join", async () => {
    setupMock();
    const { result } = await renderRoutines();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allRoutines).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("routines");
  });

  it("returns loading state initially", async () => {
    setupMock();
    const { useRoutines } = await import("@/hooks/use-routines");
    const { result } = renderHook(() => useRoutines());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("createRoutine inserts routine and calls RPC for next_run_at if schedule type", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createRoutine({
        name: "New Routine",
        instruction: "Do something",
        agent_id: "agent-1",
        trigger_type: "schedule",
        cadence_type: "daily",
        timezone: "UTC",
        time_of_day: "09:00",
      } as any);
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "routine_next_occurrence",
      expect.objectContaining({
        p_cadence_type: "daily",
        p_timezone: "UTC",
      }),
    );

    const insertFn = findMutationCall("routines", "insert");
    expect(insertFn).not.toBeNull();
    expect(insertFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: "New Routine",
        next_run_at: "2026-01-02T09:00:00Z",
      }),
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        module: "routines",
        entity_type: "routine",
        action: "created",
      }),
    );
    expect(trackEvent).toHaveBeenCalledWith("routine_created", expect.any(Object));
    expect(completeItem).toHaveBeenCalledWith("routineCreated");
  });

  it("updateRoutine updates routine and recalculates next_run_at", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateRoutine("routine-1", {
        name: "Updated standup",
        cadence_type: "weekly",
        timezone: "America/New_York",
      } as any);
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "routine_next_occurrence",
      expect.objectContaining({
        p_cadence_type: "weekly",
        p_timezone: "America/New_York",
      }),
    );

    const updateFn = findMutationCall("routines", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: "Updated standup",
        next_run_at: "2026-01-02T09:00:00Z",
      }),
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated" }),
    );
  });

  it("deleteRoutine deletes and logs audit", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteRoutine("routine-1");
    });

    const deleteFn = findMutationCall("routines", "delete");
    expect(deleteFn).not.toBeNull();
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "deleted",
        summary: expect.stringContaining("Daily standup"),
      }),
    );
  });

  it("toggleActive flips is_active and recalculates next_run_at when re-activating schedule", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.toggleActive("routine-1", true);
    });

    const updateFn = findMutationCall("routines", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({ is_active: false }),
    );

    vi.clearAllMocks();
    setupMock();
    const { result: result2 } = await renderRoutines();
    await waitFor(() => expect(result2.current.loading).toBe(false));

    await act(async () => {
      await result2.current.actions.toggleActive("routine-1", false);
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "routine_next_occurrence",
      expect.objectContaining({ p_cadence_type: "daily" }),
    );

    const updateFn2 = findMutationCall("routines", "update");
    expect(updateFn2).not.toBeNull();
    expect(updateFn2.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        is_active: true,
        next_run_at: "2026-01-02T09:00:00Z",
      }),
    );
  });

  it("runNow inserts inbox item and updates last_run_at", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.runNow("routine-1");
    });

    const inboxInsert = findMutationCall("agent_inbox_items", "insert");
    expect(inboxInsert).not.toBeNull();
    expect(inboxInsert.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        agent_id: "agent-1",
        agent_slug: "helper-bot",
        event_type: "routine_schedule",
        status: "pending",
        context: expect.objectContaining({
          routine_id: "routine-1",
          manual_trigger: true,
        }),
      }),
    );

    const routineUpdate = findMutationCall("routines", "update");
    expect(routineUpdate).not.toBeNull();
    expect(routineUpdate.mock.calls[0][0]).toHaveProperty("last_run_at");
    expect(routineUpdate.mock.calls[0][0].run_count).toBe(1);

    expect(toast.success).toHaveBeenCalledWith(
      '"Daily standup" triggered',
      expect.any(Object),
    );
  });

  it("filters.search filters by name/instruction/agent", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.routines).toHaveLength(2);

    act(() => {
      result.current.filters.setSearch("standup");
    });

    expect(result.current.routines).toHaveLength(1);
    expect(result.current.routines[0].name).toBe("Daily standup");

    act(() => {
      result.current.filters.setSearch("outreach");
    });

    expect(result.current.routines).toHaveLength(1);
    expect(result.current.routines[0].agent?.name).toBe("Outreach Bot");
  });

  it("filters.setTriggerFilter filters by schedule/event", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.routines).toHaveLength(2);

    act(() => {
      result.current.filters.setTriggerFilter("schedule");
    });

    expect(result.current.routines).toHaveLength(1);
    expect(result.current.routines[0].trigger_type).toBe("schedule");

    act(() => {
      result.current.filters.setTriggerFilter("event");
    });

    expect(result.current.routines).toHaveLength(1);
    expect(result.current.routines[0].trigger_type).toBe("event");

    act(() => {
      result.current.filters.setTriggerFilter("all");
    });

    expect(result.current.routines).toHaveLength(2);
  });

  it("form.openCreateForm/openEditForm/closeForm toggle form state", async () => {
    setupMock();
    const { result } = await renderRoutines();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.form.showForm).toBe(false);
    expect(result.current.form.editingRoutine).toBeNull();

    act(() => {
      result.current.form.openCreateForm();
    });
    expect(result.current.form.showForm).toBe(true);
    expect(result.current.form.editingRoutine).toBeNull();

    act(() => {
      result.current.form.closeForm();
    });
    expect(result.current.form.showForm).toBe(false);

    const routine = result.current.allRoutines[0];
    act(() => {
      result.current.form.openEditForm(routine as any);
    });
    expect(result.current.form.showForm).toBe(true);
    expect(result.current.form.editingRoutine).toEqual(routine);

    act(() => {
      result.current.form.closeForm();
    });
    expect(result.current.form.showForm).toBe(false);
    expect(result.current.form.editingRoutine).toBeNull();
  });
});
