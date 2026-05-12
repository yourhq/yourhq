// Loads all migration SQL files from the migrations directory, concatenates
// them in filename order, and returns the combined SQL for the user to run
// in their Supabase SQL editor.
//
// Cloud Supabase doesn't expose any HTTP endpoint that can run arbitrary
// SQL with just a service_role key. Rather than ask the user for an extra
// credential, we send them to the SQL editor with the migration on their
// clipboard — they click "Run", come back, and we re-validate via REST.

import "server-only";
import { promises as fs } from "fs";
import path from "path";

const MIGRATIONS_PATH =
  process.env.HQ_SCHEMA_PATH ?? path.resolve(/* turbopackIgnore: true */ process.cwd(), "../../db/migrations");

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
    const stat = await fs.stat(MIGRATIONS_PATH);

    if (stat.isFile()) {
      return await fs.readFile(MIGRATIONS_PATH, "utf-8");
    }

    const entries = await fs.readdir(MIGRATIONS_PATH);
    const sqlFiles = entries
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (sqlFiles.length === 0) {
      throw new Error(`No .sql files found in ${MIGRATIONS_PATH}`);
    }

    const parts = await Promise.all(
      sqlFiles.map((f) => fs.readFile(path.join(MIGRATIONS_PATH, f), "utf-8")),
    );

    return parts.join("\n\n");
  } catch (err) {
    throw new Error(
      `Failed to read schema migrations at ${MIGRATIONS_PATH}: ${(err as Error).message}. ` +
        `HQ_SCHEMA_PATH should point at the db/migrations/ directory.`,
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

function buildSqlEditorUrl(projectRef: string | null): string {
  if (!projectRef) return "https://supabase.com/dashboard/projects";
  return `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
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
  console.log("[install-schema] preparing schema install");
  let sql: string;
  try {
    sql = await readSchemaSql();
    console.log(`[install-schema] loaded SQL (${sql.length} bytes) from ${MIGRATIONS_PATH}`);
  } catch (err) {
    console.error(`[install-schema] ${(err as Error).message}`);
    return { ok: false, error: (err as Error).message };
  }
  const projectRef = parseProjectRef(base);
  return {
    ok: true,
    sql,
    sqlEditorUrl: buildSqlEditorUrl(projectRef),
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
  console.log("[verify-schema] probing workspace table");
  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    const body = await res.text().catch(() => "");
    console.log(`[verify-schema] status=${res.status} body_bytes=${body.length}`);
    return res.ok;
  } catch (err) {
    console.error(`[verify-schema] threw: ${(err as Error).message}`);
    return false;
  }
}
