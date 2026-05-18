import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildAgent } from "@/__tests__/helpers/factories";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

describe("useAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches agents on mount", async () => {
    const agent1 = buildAgent({ name: "Alpha" });
    const agent2 = buildAgent({ name: "Beta" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: [agent1, agent2], error: null } }],
      ]),
    });

    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.agents).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("agents");
  });

  it("returns loading state initially", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: [], error: null } }],
      ]),
    });

    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("shows toast on fetch error", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: null, error: { message: "DB error" } } }],
      ]),
    });

    const { toast } = await import("sonner");
    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(toast.error).toHaveBeenCalledWith("Failed to load agents");
  });

  it("deleteAgent deletes and calls logAudit", async () => {
    const agent = buildAgent({ id: "agent-del", name: "Doomed" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", {
          select: { data: [agent], error: null },
          delete: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { toast } = await import("sonner");
    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteAgent("agent-del");
    });

    expect(toast.success).toHaveBeenCalledWith("Deleted Doomed");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted", entity_type: "agent", entity_id: "agent-del" }),
    );
  });

  it("togglePause pauses an active agent", async () => {
    const agent = buildAgent({ id: "agent-pause", name: "Busy", status: "active" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", {
          select: { data: [agent], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { toast } = await import("sonner");
    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.togglePause("agent-pause", "active");
    });

    expect(toast.success).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "status_changed", entity_id: "agent-pause" }),
    );
  });

  it("togglePause resumes a paused agent", async () => {
    const agent = buildAgent({ id: "agent-resume", name: "Idle", status: "paused" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", {
          select: { data: [agent], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { toast } = await import("sonner");
    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.togglePause("agent-resume", "paused");
    });

    expect(toast.success).toHaveBeenCalled();
  });

  it("form helpers open and close the form", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: [], error: null } }],
      ]),
    });

    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.form.showForm).toBe(false);

    act(() => {
      result.current.form.openCreateForm();
    });
    expect(result.current.form.showForm).toBe(true);
    expect(result.current.form.editingAgent).toBeNull();

    act(() => {
      result.current.form.closeForm();
    });
    expect(result.current.form.showForm).toBe(false);
  });

  it("openEditForm sets editingAgent", async () => {
    const agent = buildAgent({ id: "agent-edit", name: "Editable" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: [agent], error: null } }],
      ]),
    });

    const { useAgents } = await import("@/hooks/use-agents");
    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.form.openEditForm(agent as never);
    });

    expect(result.current.form.showForm).toBe(true);
    expect(result.current.form.editingAgent).toEqual(agent);
  });
});
