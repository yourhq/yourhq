let counter = 0;

export function resetTaskCounter() {
  counter = 0;
}

export function buildTask(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `task-${counter}`,
    title: `Test Task ${counter}`,
    description: null,
    status: "todo" as const,
    priority: "medium" as const,
    assignee_type: null as "human" | "agent" | "system" | null,
    assignee_agent_id: null as string | null,
    assignee_agent: null as { id: string; name: string; slug: string; avatar_url: string | null } | null,
    stream_id: null as string | null,
    stream: null as { id: string; name: string; color: string } | null,
    parent_id: null,
    due_date: null as string | null,
    completed_at: null,
    sort_order: 0,
    tags: [] as string[],
    linked_entity_type: null,
    linked_entity_id: null,
    archived_at: null,
    meta: {},
    model_override: null,
    thinking_override: null,
    series_id: null as string | null,
    series_occurrence_at: null as string | null,
    series: null,
    comment_count: 0,
    attachment_count: 0,
    labels: [] as { id: string; created_at: string; name: string; color: string; description: string | null }[],
    blocker_count: 0,
    deliverable_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
