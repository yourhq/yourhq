import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

vi.mock("server-only", () => ({}));

describe("runCompleteSetup", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function importModule() {
    return import("@/lib/setup/run-complete-setup");
  }

  it("calls complete_setup RPC with correct params for default preset", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ error: null });
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["workspace", { update: { data: null, error: null } }],
      ]),
      rpcs: new Map(),
    });
    mockSupabase.rpc = rpcMock;

    const { runCompleteSetup } = await importModule();
    const result = await runCompleteSetup(mockSupabase as never, {
      workspaceName: "Test Workspace",
      workspaceSlug: "test-ws",
      ownerName: "Test User",
      contextPresetKey: null,
    });

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      "complete_setup",
      expect.objectContaining({
        p_name: "Test Workspace",
        p_slug: "test-ws",
        p_owner_name: "Test User",
        p_tenant_id: "00000000-0000-0000-0000-000000000000",
      }),
    );
  });

  it("calls complete_setup RPC with reach preset stages", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ error: null });
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["workspace", { update: { data: null, error: null } }],
      ]),
      rpcs: new Map(),
    });
    mockSupabase.rpc = rpcMock;

    const { runCompleteSetup } = await importModule();
    const result = await runCompleteSetup(mockSupabase as never, {
      workspaceName: "Sales HQ",
      contextPresetKey: "reach",
    });

    expect(result.ok).toBe(true);
    const call = rpcMock.mock.calls[0];
    expect(call[0]).toBe("complete_setup");
    const stages = call[1].p_stages;
    expect(stages.length).toBeGreaterThan(0);
    expect(stages[0]).toHaveProperty("stage_key");
    expect(stages[0]).toHaveProperty("label");
  });

  it("returns error when RPC fails", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      error: { message: "RPC failed" },
    });
    mockSupabase = createMockSupabaseClient({
      tables: new Map(),
      rpcs: new Map(),
    });
    mockSupabase.rpc = rpcMock;

    const { runCompleteSetup } = await importModule();
    const result = await runCompleteSetup(mockSupabase as never, {
      workspaceName: "Fail WS",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("RPC failed");
  });

  it("uses default name when workspaceName is empty", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ error: null });
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["workspace", { update: { data: null, error: null } }],
      ]),
      rpcs: new Map(),
    });
    mockSupabase.rpc = rpcMock;

    const { runCompleteSetup } = await importModule();
    await runCompleteSetup(mockSupabase as never, {
      workspaceName: "",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "complete_setup",
      expect.objectContaining({ p_name: "HQ" }),
    );
  });

  it("sets preferredName to ownerName when not provided", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ error: null });
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["workspace", { update: { data: null, error: null } }],
      ]),
      rpcs: new Map(),
    });
    mockSupabase.rpc = rpcMock;

    const { runCompleteSetup } = await importModule();
    await runCompleteSetup(mockSupabase as never, {
      workspaceName: "WS",
      ownerName: "Alice",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "complete_setup",
      expect.objectContaining({
        p_owner_name: "Alice",
        p_preferred_name: "Alice",
      }),
    );
  });
});
