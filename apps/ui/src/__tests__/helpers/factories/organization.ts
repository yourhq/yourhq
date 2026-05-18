let counter = 0;

export function buildOrganization(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `org-${counter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: `Test Organization ${counter}`,
    type: "company" as string | null,
    website: null as string | null,
    industry: null as string | null,
    size: null as string | null,
    location: null as string | null,
    description: null as string | null,
    notes: null as string | null,
    tags: [] as string[],
    status: "active" as string | null,
    extended: {},
    archived_at: null as string | null,
    contact_count: 0,
    ...overrides,
  };
}
