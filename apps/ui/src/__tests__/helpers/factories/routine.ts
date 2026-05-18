let counter = 0;

export function buildRoutine(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `routine-${counter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_id: "agent-1",
    agent_slug: "test-agent-1",
    name: `Test Routine ${counter}`,
    instruction: `Do something ${counter}`,
    trigger_type: "schedule" as const,
    is_active: true,
    cadence_type: "daily" as const,
    interval_n: null as number | null,
    days_of_week: [] as number[],
    day_of_month: null as number | null,
    time_of_day: "09:00" as string | null,
    timezone: "UTC" as string | null,
    next_run_at: null as string | null,
    last_run_at: null as string | null,
    run_count: 0,
    entity_type: null,
    collection_id: null as string | null,
    field: null as string | null,
    condition: null,
    value: null as string | null,
    meta: {},
    archived_at: null as string | null,
    agent: { id: "agent-1", name: "Test Agent 1", slug: "test-agent-1" },
    ...overrides,
  };
}
