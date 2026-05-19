import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
  useRouter: vi.fn().mockReturnValue({ replace: mockReplace }),
  usePathname: vi.fn().mockReturnValue("/dashboard/activity"),
}));

let counter = 1;

function buildAuditEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: `audit-${counter++}`,
    created_at: new Date().toISOString(),
    actor_type: "human",
    actor_agent_id: null,
    module: "tasks",
    entity_type: "task",
    entity_id: "task-1",
    action: "created",
    summary: "Created task",
    changes: null,
    meta: {},
    actor_agent: null,
    ...overrides,
  };
}

describe("useEntityAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counter = 1;
  });

  it("fetches entries on mount with entity filter", async () => {
    const entries = [
      buildAuditEntry({ entity_type: "task", entity_id: "task-1" }),
      buildAuditEntry({ entity_type: "task", entity_id: "task-1" }),
    ];

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: entries, error: null } }],
      ]),
    });

    const { useEntityAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() =>
      useEntityAuditLog({ entity_type: "task", entity_id: "task-1" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0].id).toBe("audit-1");
    expect(result.current.entries[1].id).toBe("audit-2");

    expect(mockSupabase.from).toHaveBeenCalledWith("audit_log");
  });

  it("loading is true initially, false after fetch completes", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: [], error: null } }],
      ]),
    });

    const { useEntityAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() =>
      useEntityAuditLog({ entity_type: "task", entity_id: "task-1" }),
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loading).toBe(false);
  });

  it("hasMore is true when PAGE_SIZE (50) entries returned", async () => {
    const entries = Array.from({ length: 50 }, (_, i) =>
      buildAuditEntry({ id: `audit-full-${i}` }),
    );

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: entries, error: null } }],
      ]),
    });

    const { useEntityAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() =>
      useEntityAuditLog({ entity_type: "task", entity_id: "task-1" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(true);
  });

  it("hasMore is false when fewer than PAGE_SIZE entries returned", async () => {
    const entries = [buildAuditEntry(), buildAuditEntry()];

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: entries, error: null } }],
      ]),
    });

    const { useEntityAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() =>
      useEntityAuditLog({ entity_type: "task", entity_id: "task-1" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  it("loadMore fetches next page with offset equal to current entries length", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) =>
      buildAuditEntry({ id: `p1-${i}` }),
    );
    const page2 = [buildAuditEntry({ id: "p2-0" })];

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: page1, error: null } }],
      ]),
    });

    let rangeCalls: [number, number][] = [];
    const origFrom = mockSupabase.from;
    mockSupabase.from = vi.fn((table: string) => {
      const builder = origFrom(table);
      if (table === "audit_log") {
        const origRange = builder.range as ReturnType<typeof vi.fn>;
        builder.range = vi.fn((...args: unknown[]) => {
          rangeCalls.push([args[0] as number, args[1] as number]);
          origRange(...args);
          return builder;
        });
      }
      return builder;
    }) as typeof mockSupabase.from;

    const { useEntityAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() =>
      useEntityAuditLog({ entity_type: "task", entity_id: "task-1" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.entries).toHaveLength(50);
    expect(rangeCalls.some(([from]) => from === 0)).toBe(true);

    rangeCalls = [];

    const config = mockSupabase._config;
    config.tables.set("audit_log", {
      select: { data: page2, error: null },
    });

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.entries.length).toBeGreaterThan(50));

    expect(rangeCalls.some(([from]) => from === 50)).toBe(true);
    expect(result.current.entries).toHaveLength(51);
    expect(result.current.hasMore).toBe(false);
  });
});

describe("useAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counter = 1;
  });

  it("defaults all filters to 'all'", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: [], error: null } }],
      ]),
    });

    const { useAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() => useAuditLog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filters.moduleFilter).toBe("all");
    expect(result.current.filters.actorFilter).toBe("all");
    expect(result.current.filters.actionFilter).toBe("all");
  });

  it("reads initial filter values from URL search params", async () => {
    const { useSearchParams } = await import("next/navigation");
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("module=crm&actor=agent&action=created") as ReturnType<typeof useSearchParams>,
    );

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: [], error: null } }],
      ]),
    });

    const { useAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() => useAuditLog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filters.moduleFilter).toBe("crm");
    expect(result.current.filters.actorFilter).toBe("agent");
    expect(result.current.filters.actionFilter).toBe("created");

    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    );
  });

  it("setModuleFilter updates state and syncs to URL", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["audit_log", { select: { data: [], error: null } }],
      ]),
    });

    const { useAuditLog } = await import("@/hooks/use-audit-log");
    const { result } = renderHook(() => useAuditLog());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setModuleFilter("knowledge");
    });

    expect(result.current.filters.moduleFilter).toBe("knowledge");
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("module=knowledge"),
      { scroll: false },
    );
  });
});
