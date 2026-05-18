import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildEntityLink, buildKnowledgeItem } from "@/__tests__/helpers/factories";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

describe("useEntityLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches links on mount with owner_type and owner_id filter", async () => {
    const link = buildEntityLink({ owner_type: "task", owner_id: "task-1", target_type: "url", target_id: null, url: "https://example.com" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [link], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSupabase.from).toHaveBeenCalledWith("entity_links");
    expect(result.current.links).toHaveLength(1);
  });

  it("returns loading state initially", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("resolves knowledge_item linked names", async () => {
    const link = buildEntityLink({
      owner_type: "task",
      owner_id: "task-1",
      target_type: "knowledge_item",
      target_id: "ki-1",
      resolved_name: undefined,
    });

    const knowledgeItem = { id: "ki-1", title: "My Doc", kind: "page", icon: "doc-icon" };

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [link], error: null } }],
        ["knowledge_items", { select: { data: [knowledgeItem], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.links[0].resolved_name).toBe("My Doc");
    expect(result.current.links[0].resolved_icon).toBe("doc-icon");
    expect(result.current.links[0].resolved_extra).toEqual({ kind: "page" });
  });

  it("resolves contact linked names", async () => {
    const link = buildEntityLink({
      owner_type: "task",
      owner_id: "task-1",
      target_type: "contact",
      target_id: "contact-1",
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [link], error: null } }],
        ["contacts", { select: { data: [{ id: "contact-1", name: "Jane Doe" }], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.links[0].resolved_name).toBe("Jane Doe");
  });

  it("resolves task linked names", async () => {
    const link = buildEntityLink({
      owner_type: "task",
      owner_id: "task-1",
      target_type: "task",
      target_id: "task-2",
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [link], error: null } }],
        ["tasks", { select: { data: [{ id: "task-2", title: "Linked Task" }], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.links[0].resolved_name).toBe("Linked Task");
  });

  it("resolves organization linked names", async () => {
    const link = buildEntityLink({
      owner_type: "task",
      owner_id: "task-1",
      target_type: "organization",
      target_id: "org-1",
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [link], error: null } }],
        ["organizations", { select: { data: [{ id: "org-1", name: "Acme Corp" }], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.links[0].resolved_name).toBe("Acme Corp");
  });

  it("resolves collection_record linked names from values", async () => {
    const link = buildEntityLink({
      owner_type: "task",
      owner_id: "task-1",
      target_type: "collection_record",
      target_id: "rec-1",
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [link], error: null } }],
        ["collection_records", { select: { data: [{ id: "rec-1", collection_id: "col-1", values: { name: "Record Name" } }], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.links[0].resolved_name).toBe("Record Name");
  });

  it("addLink inserts into entity_links and calls logAudit", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", {
          select: { data: [], error: null },
          insert: { data: [{ id: "new-link-1" }], error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.addLink({
        target_type: "knowledge_item",
        target_id: "ki-99",
      });
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "created",
        entity_type: "entity_link",
        entity_id: "new-link-1",
      }),
    );
  });

  it("removeLink deletes link and calls logAudit", async () => {
    const link = buildEntityLink({ id: "link-to-remove" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", {
          select: { data: [link], error: null },
          delete: { data: null, error: null },
        }],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");
    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.removeLink("link-to-remove");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "deleted",
        entity_type: "entity_link",
        entity_id: "link-to-remove",
      }),
    );
  });

  it("searchTargets searches across multiple tables", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", { select: { data: [], error: null } }],
        ["knowledge_items", { select: { data: [{ id: "ki-1", title: "Doc Test", kind: "page", icon: null }], error: null } }],
        ["contacts", { select: { data: [{ id: "c-1", name: "Test Contact" }], error: null } }],
        ["organizations", { select: { data: [], error: null } }],
        ["tasks", { select: { data: [], error: null } }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let results: unknown[];
    await act(async () => {
      results = await result.current.actions.searchTargets("Test");
    });

    expect(results!).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ki-1", target_type: "knowledge_item" }),
        expect.objectContaining({ id: "c-1", target_type: "contact" }),
      ]),
    );
  });

  it("reorderLinks updates sort_order for each link", async () => {
    const link1 = buildEntityLink({ id: "l-1", sort_order: 0 });
    const link2 = buildEntityLink({ id: "l-2", sort_order: 1 });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["entity_links", {
          select: { data: [link1, link2], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { useEntityLinks } = await import("@/hooks/use-entity-links");
    const { result } = renderHook(() => useEntityLinks("task", "task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.reorderLinks(["l-2", "l-1"]);
    });

    const updateCalls = mockSupabase.from("entity_links").update as ReturnType<typeof vi.fn>;
    expect(mockSupabase.from).toHaveBeenCalledWith("entity_links");
  });
});
