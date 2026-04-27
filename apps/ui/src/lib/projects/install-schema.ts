// Runs db/migrations/001_schema.sql against a Supabase project using
// the user's service role key. Called from the onboarding flow so the
// non-technical user never has to paste SQL into the Supabase dashboard.
//
// Supabase's dashboard itself uses the internal pg-meta HTTP endpoint
// at `/pg/meta/default/query` or `/api/pg-meta/...` to execute arbitrary
// SQL. That endpoint accepts the service role key as Authorization
// and is reachable on every cloud project. Not all self-hosted Supabase
// instances enable it, so we fall back to a clear error that tells the
// user to paste the SQL manually (with a link and copyable file).

import "server-only";
import { promises as fs } from "fs";
import path from "path";

const SCHEMA_PATH =
  process.env.HQ_SCHEMA_PATH ?? path.resolve(process.cwd(), "../../db/migrations/001_schema.sql");

export interface InstallSchemaInput {
  url: string;
  serviceRoleKey: string;
}

export type InstallSchemaResult =
  | { ok: true; endpoint: string }
  | {
      ok: false;
      error: string;
      hint?: string;
      // If the hosted pg-meta endpoint isn't available, surface the raw
      // SQL so the UI can show a "paste this into Supabase SQL editor"
      // fallback with a copy button.
      sqlFallback?: string;
    };

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

// Try each known pg-meta path in order. Different Supabase versions /
// self-hosts expose it differently — we try all reasonable ones.
const PG_META_PATHS = [
  "/pg/meta/default/query",
  "/api/pg-meta/default/query",
];

async function tryExecSql(
  base: string,
  serviceRoleKey: string,
  sql: string,
): Promise<{ ok: boolean; status: number; endpoint: string; error?: string }> {
  for (const p of PG_META_PATHS) {
    const endpoint = `${base}${p}`;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });
      if (res.status === 404) continue;
      if (res.ok) return { ok: true, status: res.status, endpoint };
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        endpoint,
        error: text.slice(0, 500),
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        endpoint,
        error: (err as Error).message,
      };
    }
  }
  return {
    ok: false,
    status: 404,
    endpoint: `${base}${PG_META_PATHS[0]}`,
    error: "pg-meta endpoint not reachable",
  };
}

export async function installSchema(
  input: InstallSchemaInput,
): Promise<InstallSchemaResult> {
  const base = input.url.replace(/\/$/, "");
  let sql: string;
  try {
    sql = await readSchemaSql();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // A migration that already ran should be idempotent: 001_schema.sql
  // uses CREATE TABLE IF NOT EXISTS and ALTER TABLE ... ADD COLUMN IF
  // NOT EXISTS everywhere. Running it twice is fine.
  const r = await tryExecSql(base, input.serviceRoleKey, sql);
  if (r.ok) return { ok: true, endpoint: r.endpoint };

  // pg-meta unreachable (404) → manual paste fallback
  if (r.status === 404) {
    return {
      ok: false,
      error:
        "We couldn't reach the Supabase SQL endpoint automatically. " +
        "Copy the SQL below and paste it into your Supabase SQL editor.",
      hint:
        "This happens on some self-hosted Supabase versions. Cloud-hosted " +
        "projects usually work automatically.",
      sqlFallback: sql,
    };
  }

  // Auth failure → secret key is wrong
  if (r.status === 401 || r.status === 403) {
    return {
      ok: false,
      error: "Secret key was rejected by Supabase.",
      hint:
        "Double-check you copied the secret key (sb_secret_…), not the publishable key (sb_publishable_…), " +
        "from Project Settings → API Keys.",
    };
  }

  return {
    ok: false,
    error: `Schema install failed (${r.status}): ${r.error ?? "unknown error"}`,
    hint:
      "If the error mentions a specific SQL object, the project may already " +
      "have partial schema. You can re-run by pasting db/migrations/001_schema.sql " +
      "into your Supabase SQL editor.",
    sqlFallback: sql,
  };
}

// After a successful schema install, verify the `workspace` table exists
// — same probe the validator uses. Belt-and-suspenders.
export async function verifySchemaInstalled(
  input: InstallSchemaInput,
): Promise<boolean> {
  const base = input.url.replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/rest/v1/workspace?select=id&limit=1`, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}
