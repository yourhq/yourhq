import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
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

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    entity_type: "task",
    entity_id: "task-1",
    parent_id: null,
    actor_type: "human",
    actor_agent_id: null,
    body: "Hello",
    mentions: [],
    meta: {},
    actor_agent: null,
    ...overrides,
  };
}

describe("parseMentions", () => {
  it("extracts unique @mentions from text", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["comments", { select: { data: [], error: null } }],
      ]),
    });

    const { useComments } = await import("@/hooks/use-comments");
    const { result } = renderHook(() => useComments("task-1"));

    expect(result.current.parseMentions("Hey @alice and @bob")).toEqual([
      "@alice",
      "@bob",
    ]);
  });

  it("deduplicates mentions", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["comments", { select: { data: [], error: null } }],
      ]),
    });

    const { useComments } = await import("@/hooks/use-comments");
    const { result } = renderHook(() => useComments("task-1"));

    expect(result.current.parseMentions("@alice ping @alice again")).toEqual([
      "@alice",
    ]);
  });

  it("returns empty array when no mentions", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["comments", { select: { data: [], error: null } }],
      ]),
    });

    const { useComments } = await import("@/hooks/use-comments");
    const { result } = renderHook(() => useComments("task-1"));

    expect(result.current.parseMentions("No mentions here")).toEqual([]);
  });

  it("handles mentions with hyphens and underscores", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["comments", { select: { data: [], error: null } }],
      ]),
    });

    const { useComments } = await import("@/hooks/use-comments");
    const { result } = renderHook(() => useComments("task-1"));

    expect(
      result.current.parseMentions("cc @test-agent and @another_one"),
    ).toEqual(["@test-agent", "@another_one"]);
  });
});

describe("thread building", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("groups replies under parent comments", async () => {
    const parent = makeComment({ id: "c-parent", body: "Top level" });
    const reply1 = makeComment({
      id: "c-reply-1",
      parent_id: "c-parent",
      body: "Reply 1",
    });
    const reply2 = makeComment({
      id: "c-reply-2",
      parent_id: "c-parent",
      body: "Reply 2",
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "comments",
          { select: { data: [parent, reply1, reply2], error: null } },
        ],
      ]),
    });

    const { useComments } = await import("@/hooks/use-comments");
    const { result } = renderHook(() => useComments("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].id).toBe("c-parent");
    expect(result.current.comments[0].replies).toHaveLength(2);
    expect(result.current.comments[0].replies![0].id).toBe("c-reply-1");
    expect(result.current.comments[0].replies![1].id).toBe("c-reply-2");
  });

  it("returns empty replies when a top-level comment has no children", async () => {
    const comment = makeComment({ id: "c-solo", body: "Just me" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["comments", { select: { data: [comment], error: null } }],
      ]),
    });

    const { useComments } = await import("@/hooks/use-comments");
    const { result } = renderHook(() => useComments("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].replies).toEqual([]);
  });

  it("handles multiple top-level comments with separate reply trees", async () => {
    const parent1 = makeComment({ id: "p1", body: "Thread 1" });
    const parent2 = makeComment({ id: "p2", body: "Thread 2" });
    const reply1 = makeComment({
      id: "r1",
      parent_id: "p1",
      body: "Reply to p1",
    });
    const reply2 = makeComment({
      id: "r2",
      parent_id: "p2",
      body: "Reply to p2",
    });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "comments",
          {
            select: {
              data: [parent1, parent2, reply1, reply2],
              error: null,
            },
          },
        ],
      ]),
    });

    const { useComments } = await import("@/hooks/use-comments");
    const { result } = renderHook(() => useComments("task-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.comments).toHaveLength(2);
    expect(result.current.comments[0].replies).toHaveLength(1);
    expect(result.current.comments[1].replies).toHaveLength(1);
    expect(result.current.comments[0].replies![0].id).toBe("r1");
    expect(result.current.comments[1].replies![0].id).toBe("r2");
  });
});
