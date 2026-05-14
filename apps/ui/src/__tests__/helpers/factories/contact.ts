let counter = 0;

export function buildContact(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `contact-${counter}`,
    name: `Test Contact ${counter}`,
    email: `contact${counter}@example.com`,
    phone: null,
    title: null,
    status: "active" as const,
    priority: "medium" as const,
    pipeline_stage_id: null,
    relationship_strength: null,
    notes: null,
    follow_up_at: null,
    custom_fields: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tenant_id: "00000000-0000-0000-0000-000000000000",
    ...overrides,
  };
}
