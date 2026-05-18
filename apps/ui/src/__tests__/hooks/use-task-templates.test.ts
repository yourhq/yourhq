import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import type { TaskTemplate, TaskTemplateItem } from "@/lib/tasks/types";

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

function makeTemplate(
  overrides: Partial<TaskTemplate> = {},
): TaskTemplate {
  return {
    id: "tpl-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    name: "Test Template",
    description: null,
    icon: null,
    color: null,
    items: [],
    meta: {},
    ...overrides,
  };
}

describe("spawnFromTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when template is not found", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "task_templates",
          {
            select: { data: [makeTemplate({ id: "tpl-other" })], error: null },
          },
        ],
      ]),
    });

    const { useTaskTemplates } = await import("@/hooks/use-task-templates");
    const { result } = renderHook(() => useTaskTemplates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { error?: Error | null; warnings?: string[] };
    await act(async () => {
      outcome = await result.current.actions.spawnFromTemplate("nonexistent");
    });

    expect(outcome!.error).toBeTruthy();
    expect(outcome!.error!.message).toBe("Template not found");
  });

  it("warns about unresolved agent roles", async () => {
    const items: TaskTemplateItem[] = [
      { ref: "A", title: "Task A", assignee_role: "writer-bot" },
      { ref: "B", title: "Task B", assignee_role: "reviewer-bot" },
    ];
    const template = makeTemplate({ id: "tpl-1", items });

    let taskCounter = 0;
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "task_templates",
          { select: { data: [template], error: null } },
        ],
        [
          "tasks",
          {
            insert: {
              data: [{ id: "created-task" }],
              error: null,
            },
          },
        ],
        [
          "agents",
          { select: { data: [], error: null } },
        ],
        [
          "task_relations",
          { insert: { data: [], error: null } },
        ],
      ]),
    });

    const origFrom = mockSupabase.from;
    mockSupabase.from = vi.fn((table: string) => {
      const builder = origFrom(table);
      if (table === "tasks") {
        const origInsert = builder.insert as ReturnType<typeof vi.fn>;
        builder.insert = vi.fn((...args: unknown[]) => {
          origInsert(...args);
          taskCounter++;
          const mutBuilder = { ...builder };
          mutBuilder.select = vi.fn().mockReturnValue(mutBuilder);
          mutBuilder.single = vi.fn().mockResolvedValue({
            data: { id: `task-${taskCounter}` },
            error: null,
          });
          return mutBuilder;
        });
      }
      if (table === "agents") {
        builder.then = (
          resolve: (v: unknown) => void,
          reject?: (e: unknown) => void,
        ) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
      }
      return builder;
    }) as typeof mockSupabase.from;

    const { useTaskTemplates } = await import("@/hooks/use-task-templates");
    const { result } = renderHook(() => useTaskTemplates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { data?: string[]; error?: Error | null; warnings?: string[] };
    await act(async () => {
      outcome = await result.current.actions.spawnFromTemplate("tpl-1");
    });

    expect(outcome!.warnings!.length).toBeGreaterThan(0);
    expect(outcome!.warnings![0]).toContain("not found");
    expect(outcome!.warnings![0]).toContain("writer-bot");
  });

  it("warns about unresolved label names", async () => {
    const items: TaskTemplateItem[] = [
      { ref: "A", title: "Task A", labels: ["urgent", "ghost-label"] },
    ];
    const template = makeTemplate({ id: "tpl-1", items });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "task_templates",
          { select: { data: [template], error: null } },
        ],
        [
          "tasks",
          { insert: { data: [{ id: "task-new" }], error: null } },
        ],
        [
          "labels",
          {
            select: {
              data: [{ id: "lbl-1", name: "urgent" }],
              error: null,
            },
          },
        ],
        [
          "task_labels",
          { insert: { data: [], error: null } },
        ],
        [
          "task_relations",
          { insert: { data: [], error: null } },
        ],
      ]),
    });

    const origFrom = mockSupabase.from;
    mockSupabase.from = vi.fn((table: string) => {
      const builder = origFrom(table);
      if (table === "tasks") {
        const origInsert = builder.insert as ReturnType<typeof vi.fn>;
        builder.insert = vi.fn((...args: unknown[]) => {
          origInsert(...args);
          const mutBuilder = { ...builder };
          mutBuilder.select = vi.fn().mockReturnValue(mutBuilder);
          mutBuilder.single = vi.fn().mockResolvedValue({
            data: { id: "task-new" },
            error: null,
          });
          return mutBuilder;
        });
      }
      if (table === "labels") {
        builder.then = (
          resolve: (v: unknown) => void,
          reject?: (e: unknown) => void,
        ) =>
          Promise.resolve({
            data: [{ id: "lbl-1", name: "urgent" }],
            error: null,
          }).then(resolve, reject);
      }
      return builder;
    }) as typeof mockSupabase.from;

    const { useTaskTemplates } = await import("@/hooks/use-task-templates");
    const { result } = renderHook(() => useTaskTemplates());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome: { data?: string[]; error?: Error | null; warnings?: string[] };
    await act(async () => {
      outcome = await result.current.actions.spawnFromTemplate("tpl-1");
    });

    expect(outcome!.warnings!.length).toBeGreaterThan(0);
    expect(outcome!.warnings![0]).toContain("ghost-label");
  });
});

describe("template spawn — ref-to-taskId mapping and dependency resolution", () => {
  it("creates blocked_by relations between spawned tasks using ref mapping", () => {
    const items: TaskTemplateItem[] = [
      { ref: "A", title: "First" },
      { ref: "B", title: "Second", blocked_by: ["A"] },
      { ref: "C", title: "Third", blocked_by: ["A", "B"] },
    ];

    const refToTaskId = new Map<string, string>();
    refToTaskId.set("A", "task-1");
    refToTaskId.set("B", "task-2");
    refToTaskId.set("C", "task-3");

    const relationInserts: {
      source_task_id: string;
      target_task_id: string;
      relation_type: string;
    }[] = [];

    for (const item of items) {
      const taskId = refToTaskId.get(item.ref);
      if (!taskId || !item.blocked_by?.length) continue;
      for (const blockerRef of item.blocked_by) {
        const blockerId = refToTaskId.get(blockerRef);
        if (!blockerId) continue;
        relationInserts.push({
          source_task_id: taskId,
          target_task_id: blockerId,
          relation_type: "blocked_by",
        });
      }
    }

    expect(relationInserts).toHaveLength(3);
    expect(relationInserts[0]).toEqual({
      source_task_id: "task-2",
      target_task_id: "task-1",
      relation_type: "blocked_by",
    });
    expect(relationInserts[1]).toEqual({
      source_task_id: "task-3",
      target_task_id: "task-1",
      relation_type: "blocked_by",
    });
    expect(relationInserts[2]).toEqual({
      source_task_id: "task-3",
      target_task_id: "task-2",
      relation_type: "blocked_by",
    });
  });

  it("skips unresolvable blocker refs without crashing", () => {
    const items: TaskTemplateItem[] = [
      { ref: "A", title: "First" },
      { ref: "B", title: "Second", blocked_by: ["A", "MISSING"] },
    ];

    const refToTaskId = new Map<string, string>();
    refToTaskId.set("A", "task-1");
    refToTaskId.set("B", "task-2");

    const relationInserts: {
      source_task_id: string;
      target_task_id: string;
    }[] = [];

    for (const item of items) {
      const taskId = refToTaskId.get(item.ref);
      if (!taskId || !item.blocked_by?.length) continue;
      for (const blockerRef of item.blocked_by) {
        const blockerId = refToTaskId.get(blockerRef);
        if (!blockerId) continue;
        relationInserts.push({
          source_task_id: taskId,
          target_task_id: blockerId,
        });
      }
    }

    expect(relationInserts).toHaveLength(1);
    expect(relationInserts[0].target_task_id).toBe("task-1");
  });

  it("resolves assignee via slug lookup", () => {
    const agentsBySlug = new Map([
      ["writer-bot", "agent-uuid-1"],
      ["reviewer-bot", "agent-uuid-2"],
    ]);

    const item: TaskTemplateItem = {
      ref: "A",
      title: "Write article",
      assignee_role: "writer-bot",
    };

    const assigneeMap: Record<string, string> = {};
    const agentId =
      assigneeMap[item.assignee_role ?? ""] ??
      agentsBySlug.get(item.assignee_role ?? "") ??
      null;

    expect(agentId).toBe("agent-uuid-1");
  });

  it("prefers assignee_map override over slug lookup", () => {
    const agentsBySlug = new Map([["writer-bot", "agent-uuid-1"]]);
    const assigneeMap: Record<string, string> = {
      "writer-bot": "override-uuid",
    };

    const item: TaskTemplateItem = {
      ref: "A",
      title: "Write article",
      assignee_role: "writer-bot",
    };

    const agentId =
      assigneeMap[item.assignee_role ?? ""] ??
      agentsBySlug.get(item.assignee_role ?? "") ??
      null;

    expect(agentId).toBe("override-uuid");
  });
});
