let connCounter = 0;
let runCounter = 0;

export function buildSourceConnection(overrides: Record<string, unknown> = {}) {
  connCounter++;
  return {
    id: `sc-${connCounter}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    provider: "notion",
    account_label: `My Source ${connCounter}`,
    credentials: {},
    status: "active" as const,
    last_verified_at: new Date().toISOString(),
    sync_interval_hours: 6,
    next_sync_at: null as string | null,
    error_message: null as string | null,
    meta: {},
    writable: false,
    ...overrides,
  };
}

export function buildSyncRun(overrides: Record<string, unknown> = {}) {
  runCounter++;
  return {
    id: `sr-${runCounter}`,
    created_at: new Date().toISOString(),
    connection_id: "sc-1",
    status: "done" as const,
    items_synced: 10,
    items_failed: 0,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    error_message: null as string | null,
    ...overrides,
  };
}
