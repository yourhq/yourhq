let counter = 0;

export function buildEntityLink(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `el-${counter}`,
    created_at: new Date().toISOString(),
    owner_type: "task" as const,
    owner_id: "task-1",
    target_type: "knowledge_item" as const,
    target_id: `ki-${counter}` as string | null,
    url: null as string | null,
    label: null as string | null,
    sort_order: counter,
    meta: {},
    is_deliverable: false,
    review_status: null,
    review_note: null as string | null,
    reviewed_by: null as string | null,
    reviewed_at: null as string | null,
    submitted_by_agent_id: null as string | null,
    submitted_by_agent: null,
    resolved_name: `Item ${counter}`,
    resolved_icon: null as string | null,
    resolved_extra: {},
    ...overrides,
  };
}
