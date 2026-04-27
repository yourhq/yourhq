// Detects whether the user's Supabase project has tables that would
// conflict with HQ before we run the schema migration.
//
// Three outcomes:
//   "clean"      — nothing of ours exists; install fresh.
//   "installed"  — our tables exist with our shape; skip install.
//   "conflict"   — some HQ-named tables exist but with different shapes
//                  (probably from another app). Don't install — guide the
//                  user to use a separate Supabase project, or let them
//                  override.
//
// Probes pg-meta exactly like install-schema.ts. If pg-meta isn't
// reachable, returns "unknown" so the caller falls back to the existing
// validate behavior (try install, surface real errors).

import "server-only";

const PG_META_PATHS = [
  "/pg/meta/default/query",
  "/api/pg-meta/default/query",
];

// Tables HQ owns. If one of these exists but doesn't have its expected
// columns, that's a conflict.
const HQ_TABLES: Record<string, string[]> = {
  workspace: ["id", "name", "slug", "initialized"],
  contacts: ["id", "extended", "current_stage_key"],
  agents: ["id", "slug", "gateway_id"],
  pipeline_stages: ["id", "stage_key", "entity_type"],
  field_definitions: ["id", "field_key", "entity_type"],
  gateways: ["id", "slug", "label"],
};

export interface CollisionResult {
  status: "clean" | "installed" | "conflict" | "unknown";
  conflicts: string[];
  // The tables HQ already owns (used to decide skip-vs-install).
  installed: string[];
  // Set when pg-meta is unreachable; caller may want to treat as "ok,
  // try anyway" since the migration is idempotent.
  pgMetaUnreachable?: boolean;
}

async function tryQuery(
  base: string,
  serviceRoleKey: string,
  sql: string,
): Promise<{ ok: boolean; rows?: Record<string, unknown>[]; status: number }> {
  for (const p of PG_META_PATHS) {
    try {
      const res = await fetch(`${base}${p}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (res.status === 404) continue;
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json().catch(() => null);
      // pg-meta returns an array of result rows
      return { ok: true, rows: Array.isArray(data) ? data : [], status: 200 };
    } catch {
      // try next path
    }
  }
  return { ok: false, status: 404 };
}

export async function detectCollisions(input: {
  url: string;
  serviceRoleKey: string;
}): Promise<CollisionResult> {
  const base = input.url.replace(/\/$/, "");

  // 1) Which of our tables exist in public?
  const tableNames = Object.keys(HQ_TABLES);
  const inList = tableNames.map((t) => `'${t}'`).join(", ");
  const tablesQuery = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (${inList})
  `;

  const tablesResult = await tryQuery(base, input.serviceRoleKey, tablesQuery);

  if (!tablesResult.ok) {
    // pg-meta not reachable. Caller should fall through to validate +
    // attempted install; the migration is idempotent and Postgres errors
    // will surface there.
    return {
      status: "unknown",
      conflicts: [],
      installed: [],
      pgMetaUnreachable: tablesResult.status === 404,
    };
  }

  const existingTables: string[] = (tablesResult.rows ?? [])
    .map((r) => String(r.table_name ?? ""))
    .filter(Boolean);

  if (existingTables.length === 0) {
    return { status: "clean", conflicts: [], installed: [] };
  }

  // 2) For each existing HQ-named table, check whether it has our columns.
  const conflicts: string[] = [];
  const installed: string[] = [];

  for (const table of existingTables) {
    const expectedCols = HQ_TABLES[table];
    if (!expectedCols) continue;

    const colsQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${table}'
    `;
    const colsResult = await tryQuery(base, input.serviceRoleKey, colsQuery);
    if (!colsResult.ok) {
      // Bail safely.
      return {
        status: "unknown",
        conflicts: [],
        installed: [],
        pgMetaUnreachable: false,
      };
    }
    const colSet = new Set(
      (colsResult.rows ?? []).map((r) => String(r.column_name ?? "")),
    );
    const hasAll = expectedCols.every((c) => colSet.has(c));
    if (hasAll) installed.push(table);
    else conflicts.push(table);
  }

  if (conflicts.length > 0) {
    return { status: "conflict", conflicts, installed };
  }
  // All our tables present and shaped correctly → already installed.
  return { status: "installed", conflicts: [], installed };
}
