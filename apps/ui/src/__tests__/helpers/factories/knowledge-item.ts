let counter = 0;

export function buildKnowledgeItem(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `ki-${counter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    folder_id: null as string | null,
    kind: "page" as const,
    title: `Test Knowledge Item ${counter}`,
    content: `<p>Content ${counter}</p>`,
    plain_text: `Content ${counter}`,
    icon: null as string | null,
    mime_type: null as string | null,
    file_url: null as string | null,
    file_size: null as number | null,
    source_connection_id: null as string | null,
    source_external_id: null as string | null,
    source_sync_status: null,
    source_synced_at: null as string | null,
    scope: "workspace" as const,
    tags: [] as string[],
    meta: {},
    embedding_status: "pending" as const,
    chunk_status: "pending" as const,
    chunk_count: 0,
    processing_status: "done" as const,
    processing_error: null as string | null,
    archived_at: null as string | null,
    folder: null,
    agents: [],
    ...overrides,
  };
}
