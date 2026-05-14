let counter = 0;

export function buildTask(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `task-${counter}`,
    title: `Test Task ${counter}`,
    description: null,
    status: "todo" as const,
    priority: "medium" as const,
    assigned_agent_id: null,
    stream_id: null,
    due_at: null,
    completed_at: null,
    parent_task_id: null,
    series_id: null,
    series_occurrence_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tenant_id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}
