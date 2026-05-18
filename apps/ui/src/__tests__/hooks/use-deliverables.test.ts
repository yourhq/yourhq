import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildEntityLink } from "@/__tests__/helpers/factories";

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

describe("useDeliverables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches deliverables on mount for a given taskId", async () => {
    const deliverable = buildEntityLink({
      id: "del-1",
      owner_type: "task",
      owner_id: "task-1",
      is_deliverable: true,
      target_type: "url",
      target_id: null,
      url: "https://example.com",
      label: "Final Report",
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [deliverable], error: null } }],
      ]),
    });

    const { useDeliverables } = await import("@/hooks/use-deliverables");
    const { result } = renderHook(() => useDeliverables("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.deliverables).toHaveLength(1);
    expect(result.current.deliverables[0].resolved_name).toBe("Final Report");
  });

  it("does not fetch when taskId is null", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [], error: null } }],
      ]),
    });

    const { useDeliverables } = await import("@/hooks/use-deliverables");
    const { result } = renderHook(() => useDeliverables(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.deliverables).toHaveLength(0);
  });

  it("resolves knowledge_item deliverable names", async () => {
    const deliverable = buildEntityLink({
      id: "del-ki",
      owner_type: "task",
      owner_id: "task-1",
      is_deliverable: true,
      target_type: "knowledge_item",
      target_id: "ki-1",
      resolved_name: undefined,
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [deliverable], error: null } }],
        ["knowledge_items", { select: { data: [{ id: "ki-1", title: "Design Doc", kind: "page", icon: "doc" }], error: null } }],
      ]),
    });

    const { useDeliverables } = await import("@/hooks/use-deliverables");
    const { result } = renderHook(() => useDeliverables("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.deliverables[0].resolved_name).toBe("Design Doc");
    expect(result.current.deliverables[0].resolved_icon).toBe("doc");
  });

  it("approve updates review_status to approved and calls logAudit", async () => {
    const deliverable = buildEntityLink({
      id: "del-approve",
      is_deliverable: true,
      target_type: "url",
      target_id: null,
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", {
          select: { data: [deliverable], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useDeliverables } = await import("@/hooks/use-deliverables");
    const { result } = renderHook(() => useDeliverables("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.approve("del-approve");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "updated",
        entity_type: "entity_link",
        entity_id: "del-approve",
        summary: "Deliverable review: approved",
      }),
    );
  });

  it("requestRevision updates review_status with a note", async () => {
    const deliverable = buildEntityLink({
      id: "del-revision",
      is_deliverable: true,
      target_type: "url",
      target_id: null,
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", {
          select: { data: [deliverable], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useDeliverables } = await import("@/hooks/use-deliverables");
    const { result } = renderHook(() => useDeliverables("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.requestRevision("del-revision", "Needs more detail");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        summary: "Deliverable review: revision_requested",
      }),
    );
  });

  it("reject updates review_status to rejected with a note", async () => {
    const deliverable = buildEntityLink({
      id: "del-reject",
      is_deliverable: true,
      target_type: "url",
      target_id: null,
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", {
          select: { data: [deliverable], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useDeliverables } = await import("@/hooks/use-deliverables");
    const { result } = renderHook(() => useDeliverables("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.reject("del-reject", "Not acceptable");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        summary: "Deliverable review: rejected",
      }),
    );
  });

  it("returns loading state", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [], error: null } }],
      ]),
    });

    const { useDeliverables } = await import("@/hooks/use-deliverables");
    const { result } = renderHook(() => useDeliverables("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.deliverables).toHaveLength(0);
  });
});
