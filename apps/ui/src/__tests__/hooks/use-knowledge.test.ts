import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildKnowledgeItem } from "@/__tests__/helpers/factories";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/onboarding/progress", () => ({ completeItem: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-realtime-sync", () => ({ useRealtimeSync: vi.fn() }));
vi.mock("@/hooks/use-realtime", () => ({ useRealtime: vi.fn() }));
vi.mock("@/lib/knowledge/tree", () => ({
  collectDescendantIds: vi.fn((_folders: unknown[], folderId: string) => [folderId]),
  isDescendant: vi.fn(() => false),
}));
vi.mock("@/lib/knowledge/markdown-to-tiptap", () => ({
  markdownToTiptap: vi.fn((md: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: md }] }] })),
}));

import { logAudit } from "@/lib/audit/log";
import { isDescendant } from "@/lib/knowledge/tree";

const item1 = buildKnowledgeItem({ id: "ki-1", title: "Page One", kind: "page" });
const item2 = buildKnowledgeItem({ id: "ki-2", title: "Skill Two", kind: "skill" });
const fileItem = buildKnowledgeItem({ id: "ki-3", title: "file.pdf", kind: "file", file_url: "knowledge/ki-3/file.pdf" });

const folder1 = { id: "folder-1", name: "Folder A", parent_id: null, sort_order: 0, created_at: "2025-01-01T00:00:00Z" };
const folder2 = { id: "folder-2", name: "Folder B", parent_id: "folder-1", sort_order: 1, created_at: "2025-01-01T00:00:00Z" };

function setupMock(tableOverrides?: Record<string, Record<string, unknown>>) {
  const tables = new Map<string, Record<string, unknown>>([
    ["knowledge_items", { select: { data: [item1, item2], error: null }, insert: { data: [item1], error: null }, update: { data: [], error: null }, delete: { data: [], error: null } }],
    ["knowledge_folders", { select: { data: [folder1, folder2], error: null }, insert: { data: [], error: null }, update: { data: [], error: null }, delete: { data: [], error: null } }],
    ["knowledge_item_agents", { select: { data: [], error: null }, insert: { data: [], error: null }, delete: { data: [], error: null } }],
    ["knowledge_chunks", { select: { data: [], error: null } }],
  ]);
  if (tableOverrides) {
    for (const [k, v] of Object.entries(tableOverrides)) {
      const existing = tables.get(k) ?? {};
      tables.set(k, { ...existing, ...v });
    }
  }
  mockSupabase = createMockSupabaseClient({ tables });
  // Add remove to storage mock
  mockSupabase.storage.from = vi.fn().mockReturnValue({
    upload: vi.fn().mockResolvedValue({ data: { path: "test" }, error: null }),
    download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://example.com/file" } }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
  });
}

describe("useKnowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock();
  });

  it("fetches items and folders on mount", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.folders).toHaveLength(2);
  });

  it("returns loading=true initially, then false after fetch", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("createItem inserts into knowledge_items and calls logAudit", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createItem({ kind: "page", title: "New Page" });
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("knowledge_items");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entity_type: "knowledge_item" }),
    );
  });

  it("createItem with agent scope also inserts into knowledge_item_agents junction", async () => {
    setupMock({
      knowledge_items: {
        insert: { data: [{ id: "new-ki", title: "Agent Item" }], error: null },
      },
    });

    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createItem({
        kind: "page",
        title: "Agent Item",
        scope: "agent",
        agentIds: ["agent-1", "agent-2"],
      });
    });

    const junctionCalls = (mockSupabase.from as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([t]: [string]) => t === "knowledge_item_agents",
    );
    expect(junctionCalls.length).toBeGreaterThan(0);
  });

  it("archiveItem updates archived_at and calls logAudit", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.archiveItem("ki-1");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("knowledge_items");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "archived" }),
    );
  });

  it("restoreItem sets archived_at to null", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.restoreItem("ki-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "restored" }),
    );
  });

  it("deleteItem calls delete and removes file from storage if file_url exists", async () => {
    setupMock({
      knowledge_items: {
        select: { data: [fileItem], error: null },
        delete: { data: [], error: null },
      },
    });

    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteItem("ki-3");
    });

    expect(mockSupabase.storage.from).toHaveBeenCalledWith("assets");
    const storageMock = mockSupabase.storage.from("assets");
    expect(storageMock.remove).toHaveBeenCalledWith(["knowledge/ki-3/file.pdf"]);
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted" }),
    );
  });

  it("updateScope updates scope and manages junction table", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateScope("ki-1", "agent", ["agent-1"]);
    });

    const fromCalls = (mockSupabase.from as ReturnType<typeof vi.fn>).mock.calls;
    const agentTableCalls = fromCalls.filter(([t]: [string]) => t === "knowledge_item_agents");
    expect(agentTableCalls.length).toBeGreaterThan(0);
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", summary: expect.stringContaining("scope") }),
    );
  });

  it("createFolder inserts into knowledge_folders", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createFolder("New Folder", "folder-1");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("knowledge_folders");
  });

  it("renameFolder updates folder name", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.renameFolder("folder-1", "Renamed Folder");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("knowledge_folders");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", summary: expect.stringContaining("Renamed") }),
    );
  });

  it("deleteFolder deletes folder and resets folderId if current folder deleted", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Set the current folder to folder-1
    act(() => {
      result.current.filters.setFolderId("folder-1");
    });

    await act(async () => {
      await result.current.actions.deleteFolder("folder-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted", entity_type: "folder" }),
    );
    expect(result.current.filters.folderId).toBe("all");
  });

  it("moveFolder updates parent_id and prevents moving into own descendant", async () => {
    vi.mocked(isDescendant).mockReturnValueOnce(true);
    const { toast } = await import("sonner");

    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.moveFolder("folder-1", "folder-2");
    });

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("descendant"));
  });

  it("moveFolder succeeds when not moving into descendant", async () => {
    vi.mocked(isDescendant).mockReturnValueOnce(false);

    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.moveFolder("folder-1", null);
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", summary: expect.stringContaining("Moved folder") }),
    );
  });

  it("moveItem updates folder_id", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.moveItem("ki-1", "folder-2");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", summary: expect.stringContaining("Moved") }),
    );
  });

  it("importMarkdown inserts multiple rows", async () => {
    setupMock({
      knowledge_items: {
        select: { data: [item1, item2], error: null },
        insert: { data: [{ id: "imp-1", title: "Doc A" }, { id: "imp-2", title: "Doc B" }], error: null },
      },
    });

    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let count = 0;
    await act(async () => {
      count = await result.current.actions.importMarkdown(
        [
          { title: "Doc A", content: "# Hello" },
          { title: "Doc B", content: "## World" },
        ],
        "folder-1",
      );
    });

    expect(count).toBe(2);
    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it("filters.setKindFilter updates state", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setKindFilter("skill");
    });

    expect(result.current.filters.kindFilter).toBe("skill");
  });

  it("filters.setSearch updates state", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setSearch("hello");
    });

    expect(result.current.filters.search).toBe("hello");
  });

  it("filters.setScopeFilter updates state", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setScopeFilter("workspace");
    });

    expect(result.current.filters.scopeFilter).toBe("workspace");
  });

  it("filters.setShowArchived updates state", async () => {
    const { useKnowledge } = await import("@/hooks/use-knowledge");
    const { result } = renderHook(() => useKnowledge());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setShowArchived(true);
    });

    expect(result.current.filters.showArchived).toBe(true);
  });
});
