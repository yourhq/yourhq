import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildLabel } from "@/__tests__/helpers/factories";

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

describe("useLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches labels on mount", async () => {
    const label1 = buildLabel({ name: "Bug" });
    const label2 = buildLabel({ name: "Feature" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", { select: { data: [label1, label2], error: null } }],
      ]),
    });

    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.labels).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("labels");
  });

  it("returns loading state initially", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", { select: { data: [], error: null } }],
      ]),
    });

    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("createLabel inserts a label and calls logAudit", async () => {
    const newLabel = buildLabel({ id: "label-new", name: "Urgent" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", {
          select: { data: [], error: null },
          insert: { data: [newLabel], error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let out: { data: unknown; error: unknown };
    await act(async () => {
      out = await result.current.actions.createLabel("Urgent", "#ef4444");
    });

    expect(out!.data).toBeTruthy();
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entity_type: "label" }),
    );
  });

  it("updateLabel updates a label and calls logAudit", async () => {
    const label = buildLabel({ id: "label-upd" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", {
          select: { data: [label], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateLabel("label-upd", { name: "Renamed" });
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", entity_type: "label", entity_id: "label-upd" }),
    );
  });

  it("deleteLabel deletes a label and calls logAudit", async () => {
    const label = buildLabel({ id: "label-del" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", {
          select: { data: [label], error: null },
          delete: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteLabel("label-del");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted", entity_type: "label", entity_id: "label-del" }),
    );
  });

  it("addLabelToTask inserts into task_labels and calls logAudit", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", { select: { data: [], error: null } }],
        ["task_labels", { insert: { data: [], error: null } }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.addLabelToTask("task-1", "label-1");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("task_labels");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entity_type: "task_label" }),
    );
  });

  it("removeLabelFromTask deletes from task_labels and calls logAudit", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", { select: { data: [], error: null } }],
        ["task_labels", { delete: { data: null, error: null } }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.removeLabelFromTask("task-1", "label-1");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("task_labels");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted", entity_type: "task_label" }),
    );
  });

  it("getTaskLabels returns labels for a task", async () => {
    const label = buildLabel({ id: "label-tl", name: "Priority" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["labels", { select: { data: [], error: null } }],
        ["task_labels", { select: { data: [{ label_id: "label-tl", labels: label }], error: null } }],
      ]),
    });

    const { useLabels } = await import("@/hooks/use-labels");
    const { result } = renderHook(() => useLabels());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let taskLabels: unknown[];
    await act(async () => {
      taskLabels = await result.current.actions.getTaskLabels("task-1");
    });

    expect(taskLabels!).toHaveLength(1);
    expect(taskLabels![0]).toEqual(expect.objectContaining({ name: "Priority" }));
  });
});
