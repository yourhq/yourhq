// Loads the schema SQL and computes the deep-link to the user's
// Supabase SQL editor with the migration prefilled.
//
// Cloud Supabase doesn't expose any HTTP endpoint that can run arbitrary
// SQL with just a service_role key (verified: pg-meta paths all 404,
// PostgREST RPCs need pre-installed functions, the Management API needs
// a separate Personal Access Token). Rather than ask the user for an
// extra credential, we send them to the SQL editor with the migration
// loaded — they click "Run", come back, and we re-validate via REST.

import "server-only";
import { promises as fs } from "fs";
import path from "path";

const SCHEMA_PATH =
  process.env.HQ_SCHEMA_PATH ?? path.resolve(process.cwd(), "../../db/migrations/001_schema.sql");

export interface InstallSchemaInput {
  url: string;
  serviceRoleKey: string;
}

export interface SchemaInstallPayload {
  ok: true;
  /** Raw SQL the user needs to run. */
  sql: string;
  /** Deep-link to the user's SQL editor with the migration prefilled. */
  sqlEditorUrl: string;
  /** Project ref parsed from the URL (used to build the dashboard link). */
  projectRef: string | null;
}

export type InstallSchemaResult =
  | SchemaInstallPayload
  | { ok: false; error: string; hint?: string };

async function readSchemaSql(): Promise<string> {
  try {
    return await fs.readFile(SCHEMA_PATH, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read schema migration at ${SCHEMA_PATH}: ${(err as Error).message}. ` +
        `This usually means the Docker image was built incorrectly — HQ_SCHEMA_PATH ` +
        `should point at db/migrations/001_schema.sql.`,
    );
  }
}

function parseProjectRef(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function buildSqlEditorUrl(projectRef: string | null, sql: string): string {
  if (!projectRef) return "https://supabase.com/dashboard/projects";
  // Supabase's SQL editor accepts a `content` query param that prefills
  // the editor. Encode the SQL — URLs can be long but browsers handle
  // tens of KB without issue.
  return `https://supabase.com/dashboard/project/${projectRef}/sql/new?content=${encodeURIComponent(sql)}`;
}

/**
 * Returns the SQL to run + the dashboard link to run it in.
 *
 * The migration is idempotent (CREATE TABLE IF NOT EXISTS, ALTER TABLE
 * … ADD COLUMN IF NOT EXISTS) so it's safe to ask the user to re-run
 * even when partially-installed.
 */
export async function prepareSchemaInstall(
  input: InstallSchemaInput,
): Promise<InstallSchemaResult> {
  const base = input.url.replace(/\/$/, "");
  console.log(`[install-schema] preparing for ${base}`);
  let sql: string;
  try {
    sql = await readSchemaSql();
    console.log(`[install-schema] loaded SQL (${sql.length} bytes) from ${SCHEMA_PATH}`);
  } catch (err) {
    console.error(`[install-schema] ${(err as Error).message}`);
    return { ok: false, error: (err as Error).message };
  }
  const projectRef = parseProjectRef(base);
  return {
    ok: true,
    sql,
    sqlEditorUrl: buildSqlEditorUrl(projectRef, sql),
    projectRef,
  };
}

/**
 * Re-validates that the `workspace` table now exists — this is what
 * "I ran the SQL" effectively confirms. Same probe the validator uses.
 */
export async function verifySchemaInstalled(
  input: InstallSchemaInput,
): Promise<boolean> {
  const base = input.url.replace(/\/$/, "");
  const endpoint = `${base}/rest/v1/workspace?select=id&limit=1`;
  console.log(`[verify-schema] GET ${endpoint}`);
  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    const body = await res.text().catch(() => "");
    console.log(`[verify-schema] ← ${res.status} body=${body.slice(0, 200)}`);
    return res.ok;
  } catch (err) {
    console.error(`[verify-schema] threw: ${(err as Error).message}`);
    return false;
  }
}
