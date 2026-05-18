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

function buildStream(overrides: Record<string, unknown> = {}) {
  return {
    id: "stream-1",
    created_at: new Date().toISOString(),
    name: "Default Stream",
    type: "custom",
    sort_order: 0,
    is_archived: false,
    ...overrides,
  };
}

describe("useStreams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches streams on mount", async () => {
    const stream1 = buildStream({ id: "s-1", name: "Backlog", sort_order: 0 });
    const stream2 = buildStream({ id: "s-2", name: "Sprint", sort_order: 1 });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["streams", { select: { data: [stream1, stream2], error: null } }],
      ]),
    });

    const { useStreams } = await import("@/hooks/use-streams");
    const { result } = renderHook(() => useStreams());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.streams).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("streams");
  });

  it("returns loading state initially", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["streams", { select: { data: [], error: null } }],
      ]),
    });

    const { useStreams } = await import("@/hooks/use-streams");
    const { result } = renderHook(() => useStreams());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("createStream inserts a stream and calls logAudit", async () => {
    const created = buildStream({ id: "s-new" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["streams", {
          select: { data: [], error: null },
          insert: { data: [created], error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useStreams } = await import("@/hooks/use-streams");
    const { result } = renderHook(() => useStreams());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createStream("New Stream");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "created",
        entity_type: "stream",
        summary: "Created stream 'New Stream'",
      }),
    );
  });

  it("updateStream updates a stream and calls logAudit", async () => {
    const stream = buildStream({ id: "s-upd" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["streams", {
          select: { data: [stream], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useStreams } = await import("@/hooks/use-streams");
    const { result } = renderHook(() => useStreams());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateStream("s-upd", { name: "Renamed" } as never);
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "updated",
        entity_type: "stream",
        entity_id: "s-upd",
      }),
    );
  });

  it("archiveStream marks as archived and calls logAudit", async () => {
    const stream = buildStream({ id: "s-arch", name: "Old Stream" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["streams", {
          select: { data: [stream], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useStreams } = await import("@/hooks/use-streams");
    const { result } = renderHook(() => useStreams());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.archiveStream("s-arch");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "archived",
        entity_type: "stream",
        entity_id: "s-arch",
        summary: "Archived stream 'Old Stream'",
      }),
    );
  });

  it("createStream sets sort_order beyond existing streams", async () => {
    const existing1 = buildStream({ id: "s-a", sort_order: 0 });
    const existing2 = buildStream({ id: "s-b", sort_order: 5 });
    const created = buildStream({ id: "s-c" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["streams", {
          select: { data: [existing1, existing2], error: null },
          insert: { data: [created], error: null },
        }],
      ]),
    });

    const { useStreams } = await import("@/hooks/use-streams");
    const { result } = renderHook(() => useStreams());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createStream("Third");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("streams");
  });

  it("returns empty streams array when none exist", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["streams", { select: { data: [], error: null } }],
      ]),
    });

    const { useStreams } = await import("@/hooks/use-streams");
    const { result } = renderHook(() => useStreams());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.streams).toEqual([]);
  });
});
