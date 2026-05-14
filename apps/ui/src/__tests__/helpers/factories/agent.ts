let counter = 0;

export function buildAgent(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `agent-${counter}`,
    slug: `test-agent-${counter}`,
    name: `Test Agent ${counter}`,
    description: "A test agent",
    status: "active" as const,
    gateway_id: "default",
    template_id: "general",
    model_override: null,
    thinking_override: null,
    reports_to_id: null,
    paused: false,
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tenant_id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}
