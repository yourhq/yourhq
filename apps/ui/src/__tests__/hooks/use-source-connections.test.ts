import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildSourceConnection, buildSyncRun } from "@/__tests__/helpers/factories";

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
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

describe("useSourceConnections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches connections and sync runs on mount", async () => {
    const conn = buildSourceConnection();
    const run = buildSyncRun({ connection_id: conn.id });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", { select: { data: [conn], error: null } }],
        ["source_sync_runs", { select: { data: [run], error: null } }],
      ]),
    });

    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.connections).toHaveLength(1);
    expect(result.current.connections[0].id).toBe(conn.id);
    expect(result.current.syncRuns).toHaveLength(1);
  });

  it("returns loading state initially", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", { select: { data: [], error: null } }],
        ["source_sync_runs", { select: { data: [], error: null } }],
      ]),
    });

    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("getConnection finds connection by id", async () => {
    const conn1 = buildSourceConnection({ id: "sc-100" });
    const conn2 = buildSourceConnection({ id: "sc-200" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", { select: { data: [conn1, conn2], error: null } }],
        ["source_sync_runs", { select: { data: [], error: null } }],
      ]),
    });

    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getConnection("sc-100")).toEqual(conn1);
    expect(result.current.getConnection("sc-200")).toEqual(conn2);
    expect(result.current.getConnection("nonexistent")).toBeNull();
  });

  it("createConnection inserts and calls logAudit, trackEvent, completeItem", async () => {
    const newConn = buildSourceConnection({ id: "sc-new" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", {
          select: { data: [], error: null },
          insert: { data: [newConn], error: null },
        }],
        ["source_sync_runs", { select: { data: [], error: null } }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { trackEvent } = await import("@/lib/analytics");
    const { completeItem } = await import("@/lib/onboarding/progress");
    const { toast } = await import("sonner");
    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let created: unknown;
    await act(async () => {
      created = await result.current.actions.createConnection({
        provider: "notion" as never,
        account_label: "My Notion",
        credentials: { token: "secret" },
      });
    });

    expect(created).toBeTruthy();
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entity_type: "source_connection" }),
    );
    expect(trackEvent).toHaveBeenCalledWith("source_connected", { provider: "notion" });
    expect(completeItem).toHaveBeenCalledWith("sourceConnected");
    expect(toast.success).toHaveBeenCalled();
  });

  it("deleteConnection deletes and calls logAudit", async () => {
    const conn = buildSourceConnection({ id: "sc-del" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", {
          select: { data: [conn], error: null },
          delete: { data: null, error: null },
        }],
        ["source_sync_runs", { select: { data: [], error: null } }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { toast } = await import("sonner");
    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteConnection("sc-del");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted", entity_type: "source_connection" }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("updateConnection updates fields", async () => {
    const conn = buildSourceConnection({ id: "sc-upd" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", {
          select: { data: [conn], error: null },
          update: { data: null, error: null },
        }],
        ["source_sync_runs", { select: { data: [], error: null } }],
      ]),
    });

    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateConnection("sc-upd", { account_label: "Updated Label" });
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("source_connections");
  });

  it("triggerSync updates next_sync_at", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", {
          select: { data: [], error: null },
          update: { data: null, error: null },
        }],
        ["source_sync_runs", { select: { data: [], error: null } }],
      ]),
    });

    const { toast } = await import("sonner");
    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.triggerSync("sc-1");
    });

    expect(toast.success).toHaveBeenCalledWith("Sync triggered");
  });

  it("fetchConnectionItems selects knowledge_items by connection_id", async () => {
    const item = { id: "ki-1", title: "Synced Page", kind: "source", source_external_id: "ext-1", source_sync_status: "synced", source_synced_at: null, content_hash: null, created_at: new Date().toISOString() };

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", { select: { data: [], error: null } }],
        ["source_sync_runs", { select: { data: [], error: null } }],
        ["knowledge_items", { select: { data: [item], error: null } }],
      ]),
    });

    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let items: unknown[];
    await act(async () => {
      items = await result.current.actions.fetchConnectionItems("sc-1");
    });

    expect(items!).toHaveLength(1);
    expect(items![0]).toEqual(expect.objectContaining({ id: "ki-1" }));
  });

  it("addSyncItems inserts knowledge_items with source fields", async () => {
    const conn = buildSourceConnection({ id: "sc-sync", provider: "notion" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", {
          select: { data: [conn], error: null },
          update: { data: null, error: null },
        }],
        ["source_sync_runs", { select: { data: [], error: null } }],
        ["knowledge_items", {
          select: { data: [], error: null },
          insert: { data: [], error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { toast } = await import("sonner");
    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean;
    await act(async () => {
      ok = await result.current.actions.addSyncItems("sc-sync", [
        { external_id: "ext-1", title: "Page 1", source_url: "https://notion.so/1" },
      ]);
    });

    expect(ok!).toBe(true);
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", entity_id: "sc-sync" }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("stopSyncingItem archives the item", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", { select: { data: [], error: null } }],
        ["source_sync_runs", { select: { data: [], error: null } }],
        ["knowledge_items", {
          select: { data: [], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { toast } = await import("sonner");
    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.stopSyncingItem("ki-stop");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted", entity_type: "knowledge_item", entity_id: "ki-stop" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Item removed from sync");
  });

  it("syncItemNow updates sync status to stale", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", { select: { data: [], error: null } }],
        ["source_sync_runs", { select: { data: [], error: null } }],
        ["knowledge_items", {
          select: { data: [], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { toast } = await import("sonner");
    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.syncItemNow("ki-resync");
    });

    expect(toast.success).toHaveBeenCalledWith("Item queued for sync");
  });

  it("fetchSyncRuns can filter by connectionId", async () => {
    const run = buildSyncRun({ connection_id: "sc-filter" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["source_connections", { select: { data: [], error: null } }],
        ["source_sync_runs", { select: { data: [run], error: null } }],
      ]),
    });

    const { useSourceConnections } = await import("@/hooks/use-source-connections");
    const { result } = renderHook(() => useSourceConnections());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.fetchSyncRuns("sc-filter");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("source_sync_runs");
  });
});
