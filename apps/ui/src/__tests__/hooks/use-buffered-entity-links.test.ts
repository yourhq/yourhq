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

async function importHook() {
  const mod = await import("@/hooks/use-buffered-entity-links");
  return mod.useBufferedEntityLinks;
}

describe("useBufferedEntityLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1
  it("returns empty links when ownerId is null", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    expect(result.current.links).toEqual([]);
  });

  // 2
  it("returns loading=false initially when no ownerId", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    expect(result.current.loading).toBe(false);
  });

  // 3
  it("dirty is false initially", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    expect(result.current.dirty).toBe(false);
  });

  // 4
  it("addLink adds a link to the buffer", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    act(() => {
      result.current.actions.addLink({
        target_type: "contact",
        target_id: "contact-1",
        label: "Alice",
      });
    });

    expect(result.current.links).toHaveLength(1);
    expect(result.current.links[0].target_type).toBe("contact");
    expect(result.current.links[0].target_id).toBe("contact-1");
    expect(result.current.links[0].resolved_name).toBe("Alice");
  });

  // 5
  it("addLink makes dirty=true", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    expect(result.current.dirty).toBe(false);

    act(() => {
      result.current.actions.addLink({
        target_type: "knowledge_item",
        target_id: "ki-1",
        label: "My doc",
      });
    });

    expect(result.current.dirty).toBe(true);
  });

  // 6
  it("links array reflects added items and filters out removes", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    act(() => {
      result.current.actions.addLink({
        target_type: "contact",
        target_id: "c-1",
        label: "First",
      });
      result.current.actions.addLink({
        target_type: "organization",
        target_id: "o-1",
        label: "Second",
      });
    });

    expect(result.current.links).toHaveLength(2);
    expect(result.current.links[0].target_type).toBe("contact");
    expect(result.current.links[1].target_type).toBe("organization");
  });

  // 7
  it("removeLink on a newly-added link removes it entirely", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    act(() => {
      result.current.actions.addLink({
        target_type: "contact",
        target_id: "c-1",
        label: "Temp",
      });
    });

    expect(result.current.links).toHaveLength(1);
    const linkId = result.current.links[0].id;

    act(() => {
      result.current.actions.removeLink(linkId);
    });

    expect(result.current.links).toHaveLength(0);
    expect(result.current.dirty).toBe(false);
  });

  // 8
  it("removeLink on a persisted link marks it for removal", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "entity_links",
          {
            select: {
              data: [
                {
                  id: "db-link-1",
                  owner_type: "task",
                  owner_id: "task-1",
                  target_type: "contact",
                  target_id: "c-1",
                  url: null,
                  label: "Persisted",
                  sort_order: 0,
                },
              ],
              error: null,
            },
          },
        ],
        [
          "contacts",
          {
            select: {
              data: [{ id: "c-1", name: "Alice" }],
              error: null,
            },
          },
        ],
      ]),
    });

    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() =>
      useBufferedEntityLinks("task", "task-1"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.links).toHaveLength(1));

    const linkId = result.current.links[0].id;

    act(() => {
      result.current.actions.removeLink(linkId);
    });

    expect(result.current.links).toHaveLength(0);
  });

  // 9
  it("after removeLink on persisted item, dirty is true", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "entity_links",
          {
            select: {
              data: [
                {
                  id: "db-link-2",
                  owner_type: "task",
                  owner_id: "task-2",
                  target_type: "organization",
                  target_id: "o-1",
                  url: null,
                  label: null,
                  sort_order: 0,
                },
              ],
              error: null,
            },
          },
        ],
        [
          "organizations",
          {
            select: {
              data: [{ id: "o-1", name: "Acme" }],
              error: null,
            },
          },
        ],
      ]),
    });

    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() =>
      useBufferedEntityLinks("task", "task-2"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.links).toHaveLength(1));

    expect(result.current.dirty).toBe(false);

    const linkId = result.current.links[0].id;

    act(() => {
      result.current.actions.removeLink(linkId);
    });

    expect(result.current.dirty).toBe(true);
  });

  // 10
  it("after removeLink on persisted item, links array excludes it", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "entity_links",
          {
            select: {
              data: [
                {
                  id: "db-link-3",
                  owner_type: "task",
                  owner_id: "task-3",
                  target_type: "task",
                  target_id: "t-99",
                  url: null,
                  label: null,
                  sort_order: 0,
                },
              ],
              error: null,
            },
          },
        ],
        [
          "tasks",
          {
            select: {
              data: [{ id: "t-99", title: "Related task" }],
              error: null,
            },
          },
        ],
      ]),
    });

    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() =>
      useBufferedEntityLinks("task", "task-3"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.links).toHaveLength(1));

    const linkId = result.current.links[0].id;

    act(() => {
      result.current.actions.removeLink(linkId);
    });

    expect(result.current.links).toHaveLength(0);
  });

  // 11
  it("flush inserts add-pending items to Supabase", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "entity_links",
          {
            select: { data: [], error: null },
            insert: { data: [], error: null },
          },
        ],
      ]),
    });

    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    act(() => {
      result.current.actions.addLink({
        target_type: "contact",
        target_id: "c-1",
        label: "New link",
      });
    });

    await act(async () => {
      await result.current.actions.flush("task-flush-1");
    });

    const fromCalls = mockSupabase.from.mock.calls;
    const entityLinkInsertCalls = fromCalls.filter(
      (c) => c[0] === "entity_links",
    );
    expect(entityLinkInsertCalls.length).toBeGreaterThan(0);
  });

  // 12
  it("flush deletes remove-pending items from Supabase", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "entity_links",
          {
            select: {
              data: [
                {
                  id: "db-del-1",
                  owner_type: "task",
                  owner_id: "task-del",
                  target_type: "contact",
                  target_id: "c-del",
                  url: null,
                  label: null,
                  sort_order: 0,
                },
              ],
              error: null,
            },
            delete: { data: [], error: null },
          },
        ],
        [
          "contacts",
          {
            select: {
              data: [{ id: "c-del", name: "To Delete" }],
              error: null,
            },
          },
        ],
      ]),
    });

    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() =>
      useBufferedEntityLinks("task", "task-del"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.links).toHaveLength(1));

    const linkId = result.current.links[0].id;

    act(() => {
      result.current.actions.removeLink(linkId);
    });

    await act(async () => {
      await result.current.actions.flush("task-del");
    });

    const fromCalls = mockSupabase.from.mock.calls;
    const entityLinkCalls = fromCalls.filter((c) => c[0] === "entity_links");
    expect(entityLinkCalls.length).toBeGreaterThanOrEqual(2);
  });

  // 13
  it("flush calls logAudit for inserts", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "entity_links",
          {
            select: { data: [], error: null },
            insert: { data: [], error: null },
          },
        ],
      ]),
    });

    const { logAudit } = await import("@/lib/audit/log");

    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    act(() => {
      result.current.actions.addLink({
        target_type: "contact",
        target_id: "c-audit",
        label: "Audit test",
      });
    });

    await act(async () => {
      await result.current.actions.flush("task-audit-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "created",
        entity_type: "entity_link",
        entity_id: "task-audit-1",
      }),
    );
  });

  // 14
  it("searchTargets returns empty for blank query", async () => {
    mockSupabase = createMockSupabaseClient();
    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() => useBufferedEntityLinks("task", null));

    let searchResults: unknown[];
    await act(async () => {
      searchResults = await result.current.actions.searchTargets("");
    });

    expect(searchResults!).toEqual([]);
  });

  // 15
  it("hydration loads existing links from Supabase when ownerId provided", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "entity_links",
          {
            select: {
              data: [
                {
                  id: "hydrate-1",
                  owner_type: "task",
                  owner_id: "task-hydrate",
                  target_type: "knowledge_item",
                  target_id: "ki-hydrate",
                  url: null,
                  label: "Doc link",
                  sort_order: 0,
                },
              ],
              error: null,
            },
          },
        ],
        [
          "knowledge_items",
          {
            select: {
              data: [
                { id: "ki-hydrate", title: "My Document", kind: "page", icon: null },
              ],
              error: null,
            },
          },
        ],
      ]),
    });

    const useBufferedEntityLinks = await importHook();
    const { result } = renderHook(() =>
      useBufferedEntityLinks("task", "task-hydrate"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.links).toHaveLength(1));

    expect(result.current.links[0].target_type).toBe("knowledge_item");
    expect(result.current.links[0].target_id).toBe("ki-hydrate");
    expect(result.current.links[0].resolved_name).toBe("My Document");
    expect(result.current.dirty).toBe(false);
  });
});
