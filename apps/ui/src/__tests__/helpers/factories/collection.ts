let defCounter = 0;
let fieldCounter = 0;
let recordCounter = 0;
let viewCounter = 0;

export function buildCollectionDefinition(overrides: Record<string, unknown> = {}) {
  defCounter++;
  return {
    id: `col-${defCounter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: `Test Collection ${defCounter}`,
    slug: `test-collection-${defCounter}`,
    description: null as string | null,
    icon: null as string | null,
    color: null as string | null,
    sort_order: 0,
    meta: {},
    archived_at: null as string | null,
    fields: [],
    record_count: 0,
    ...overrides,
  };
}

export function buildCollectionField(overrides: Record<string, unknown> = {}) {
  fieldCounter++;
  return {
    id: `cf-${fieldCounter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    field_key: `field_${fieldCounter}`,
    field_type: "text" as const,
    label: `Field ${fieldCounter}`,
    description: null as string | null,
    sort_order: fieldCounter,
    required: false,
    options: null,
    default_value: null as unknown,
    is_title_field: fieldCounter === 1,
    is_active: true,
    ...overrides,
  };
}

export function buildCollectionRecord(overrides: Record<string, unknown> = {}) {
  recordCounter++;
  return {
    id: `cr-${recordCounter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    values: {} as Record<string, unknown>,
    sort_order: 0,
    archived_at: null as string | null,
    ...overrides,
  };
}

export function buildCollectionView(overrides: Record<string, unknown> = {}) {
  viewCounter++;
  return {
    id: `cv-${viewCounter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    name: `View ${viewCounter}`,
    view_type: "table" as const,
    config: {},
    is_default: viewCounter === 1,
    sort_order: viewCounter,
    ...overrides,
  };
}
