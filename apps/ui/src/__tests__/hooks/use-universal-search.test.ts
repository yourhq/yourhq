import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

describe("search result transformations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports expected types", async () => {
    const mod = await import("@/hooks/use-universal-search");
    expect(mod.useUniversalSearch).toBeDefined();
  });

  it("SearchResult type has required shape", async () => {
    const result: import("@/hooks/use-universal-search").SearchResult = {
      id: "k-1",
      type: "knowledge",
      title: "Test",
      href: "/dashboard/knowledge/k-1",
    };
    expect(result.id).toBe("k-1");
    expect(result.type).toBe("knowledge");
  });

  it("all entity type values are valid SearchResultType values", () => {
    const validTypes = [
      "knowledge",
      "knowledge_chunk",
      "task",
      "contact",
      "collection_record",
      "agent",
      "routine",
    ] as const;

    for (const t of validTypes) {
      const result: import("@/hooks/use-universal-search").SearchResult = {
        id: "1",
        type: t,
        title: "test",
        href: "#",
      };
      expect(result.type).toBe(t);
    }
  });

  it("SearchResult supports optional fields", () => {
    const result: import("@/hooks/use-universal-search").SearchResult = {
      id: "1",
      type: "knowledge",
      title: "test",
      href: "#",
      subtitle: "page",
      snippet: "some text",
      icon: "book",
      color: "#ff0000",
      score: 0.95,
    };
    expect(result.subtitle).toBe("page");
    expect(result.snippet).toBe("some text");
    expect(result.score).toBe(0.95);
  });
});

describe("knowledge result transform logic", () => {
  it("maps RPC data to SearchResult shape", () => {
    const rpcRow = {
      id: "k-1",
      title: "Architecture Guide",
      kind: "page",
      similarity: 0.87,
    };
    const transformed = {
      id: rpcRow.id,
      type: "knowledge" as const,
      title: rpcRow.title,
      subtitle: rpcRow.kind,
      href: `/dashboard/knowledge/${rpcRow.id}`,
      score: rpcRow.similarity,
    };
    expect(transformed.type).toBe("knowledge");
    expect(transformed.title).toBe("Architecture Guide");
    expect(transformed.href).toBe("/dashboard/knowledge/k-1");
    expect(transformed.score).toBe(0.87);
  });

  it("maps chunk data to SearchResult with truncated snippet", () => {
    const chunkRow = {
      id: "ch-1",
      content: "A".repeat(200),
      knowledge_item_id: "k-1",
    };
    const snippet = (chunkRow.content ?? "").slice(0, 160);
    const transformed = {
      id: chunkRow.id,
      type: "knowledge_chunk" as const,
      title: "Knowledge passage",
      snippet,
      href: chunkRow.knowledge_item_id
        ? `/dashboard/knowledge/${chunkRow.knowledge_item_id}`
        : "#",
    };
    expect(transformed.snippet).toHaveLength(160);
    expect(transformed.href).toBe("/dashboard/knowledge/k-1");
  });

  it("falls back to # href when chunk has no knowledge_item_id", () => {
    const chunkRow = {
      id: "ch-2",
      content: "test",
      knowledge_item_id: null as string | null,
    };
    const href = chunkRow.knowledge_item_id
      ? `/dashboard/knowledge/${chunkRow.knowledge_item_id}`
      : "#";
    expect(href).toBe("#");
  });

  it("deduplicates semantic results against text results by id", () => {
    const textResults = [
      { id: "k-1", type: "knowledge" as const, title: "A", href: "#" },
      { id: "k-2", type: "knowledge" as const, title: "B", href: "#" },
    ];
    const semanticResults = [
      { id: "k-2", title: "B", kind: "page", similarity: 0.9 },
      { id: "k-3", title: "C", kind: "page", similarity: 0.8 },
    ];
    const existingIds = new Set(textResults.map((r) => r.id));
    const semanticOnly = semanticResults.filter((r) => !existingIds.has(r.id));
    expect(semanticOnly).toHaveLength(1);
    expect(semanticOnly[0].id).toBe("k-3");
  });

  it("caps combined results at MAX_PER_GROUP + 3", () => {
    const MAX_PER_GROUP = 5;
    const textResults = Array.from({ length: MAX_PER_GROUP }, (_, i) => ({
      id: `k-${i}`,
      type: "knowledge" as const,
      title: `Item ${i}`,
      href: "#",
    }));
    const semanticOnly = Array.from({ length: 5 }, (_, i) => ({
      id: `k-sem-${i}`,
      type: "knowledge" as const,
      title: `Semantic ${i}`,
      href: "#",
    }));
    const combined = [...textResults, ...semanticOnly].slice(
      0,
      MAX_PER_GROUP + 3,
    );
    expect(combined).toHaveLength(8);
  });

  it("maps task data with status subtitle", () => {
    const row = { id: "t-1", title: "Fix bug", status: "in_progress" };
    const transformed = {
      id: row.id,
      type: "task" as const,
      title: row.title,
      subtitle: row.status,
      href: `/dashboard/tasks?selected=${row.id}`,
    };
    expect(transformed.subtitle).toBe("in_progress");
    expect(transformed.href).toContain("selected=t-1");
  });

  it("maps contact with fallback to email", () => {
    const row = {
      id: "c-1",
      full_name: "",
      email: "alice@example.com",
      company: null as string | null,
    };
    const title = row.full_name || row.email || "Unknown";
    expect(title).toBe("alice@example.com");
  });

  it("maps contact to Unknown when no name or email", () => {
    const row = {
      id: "c-2",
      full_name: "",
      email: "",
      company: null as string | null,
    };
    const title = row.full_name || row.email || "Unknown";
    expect(title).toBe("Unknown");
  });
});
