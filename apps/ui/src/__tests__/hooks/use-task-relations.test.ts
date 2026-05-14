import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

describe("detectBlockerCycle (via addRelation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects a direct inverse cycle (A blocks B, then B blocks A)", async () => {
    mockSupabase = createMockSupabaseClient({
      rpcs: new Map([
        ["get_task_relations", { data: [], error: null }],
      ]),
      tables: new Map([
        [
          "task_relations",
          {
            select: { data: [{ id: "rel-1" }], error: null },
            insert: { data: [], error: null },
          },
        ],
      ]),
    });

    const { useTaskRelations } = await import("@/hooks/use-task-relations");
    const { result } = renderHook(() => useTaskRelations("task-A"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { error?: Error | null };
    await act(async () => {
      outcome = await result.current.actions.addRelation("task-B", "blocks");
    });

    expect(outcome!.error).toBeTruthy();
    expect(outcome!.error!.message).toContain("Circular dependency");
  });

  it("detects a transitive blocker cycle (A->B->C, adding C blocked_by A)", async () => {
    const fromCalls: { table: string }[] = [];
    const selectResults: Record<string, { target_task_id: string }[]> = {
      "task-C": [{ target_task_id: "task-B" }],
      "task-B": [{ target_task_id: "task-A" }],
    };

    mockSupabase = createMockSupabaseClient({
      rpcs: new Map([
        ["get_task_relations", { data: [], error: null }],
      ]),
      tables: new Map([
        [
          "task_relations",
          {
            select: { data: [], error: null },
            insert: { data: [], error: null },
          },
        ],
      ]),
    });

    const origFrom = mockSupabase.from;
    mockSupabase.from = vi.fn((table: string) => {
      fromCalls.push({ table });
      const builder = origFrom(table);

      if (table === "task_relations") {
        let eqSourceId: string | null = null;
        let eqRelationType: string | null = null;

        const origEq = builder.eq as ReturnType<typeof vi.fn>;
        builder.eq = vi.fn((col: string, val: string) => {
          if (col === "source_task_id") eqSourceId = val;
          if (col === "relation_type") eqRelationType = val;
          origEq(col, val);
          return builder;
        });

        builder.then = (
          resolve: (v: unknown) => void,
          reject?: (e: unknown) => void,
        ) => {
          if (eqRelationType === "blocked_by" && eqSourceId) {
            const rows = selectResults[eqSourceId] ?? [];
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        };
      }
      return builder;
    }) as typeof mockSupabase.from;

    const { useTaskRelations } = await import("@/hooks/use-task-relations");
    const { result } = renderHook(() => useTaskRelations("task-A"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { error?: Error | null };
    await act(async () => {
      outcome = await result.current.actions.addRelation("task-C", "blocked_by");
    });

    expect(outcome!.error).toBeTruthy();
    expect(outcome!.error!.message).toContain("Circular dependency chain");
  });

  it("allows a valid relation that creates no cycle", async () => {
    mockSupabase = createMockSupabaseClient({
      rpcs: new Map([
        ["get_task_relations", { data: [], error: null }],
      ]),
      tables: new Map([
        [
          "task_relations",
          {
            select: { data: [], error: null },
            insert: { data: [], error: null },
          },
        ],
      ]),
    });

    const { useTaskRelations } = await import("@/hooks/use-task-relations");
    const { result } = renderHook(() => useTaskRelations("task-A"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { error?: Error | null };
    await act(async () => {
      outcome = await result.current.actions.addRelation("task-B", "relates_to");
    });

    expect(outcome!.error).toBeFalsy();
  });

  it("returns an error when called with no task ID", async () => {
    mockSupabase = createMockSupabaseClient({
      rpcs: new Map([
        ["get_task_relations", { data: [], error: null }],
      ]),
    });

    const { useTaskRelations } = await import("@/hooks/use-task-relations");
    const { result } = renderHook(() => useTaskRelations(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { error?: Error | null };
    await act(async () => {
      outcome = await result.current.actions.addRelation("task-B", "blocks");
    });

    expect(outcome!.error).toBeTruthy();
    expect(outcome!.error!.message).toBe("No task ID");
  });
});
