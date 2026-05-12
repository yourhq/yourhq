import "server-only";

export interface InstallSchemaInput {
  url: string;
  serviceRoleKey: string;
}

export interface SchemaInstallPayload {
  ok: true;
  sql: string;
  sqlEditorUrl: string;
  projectRef: string | null;
}

export type InstallSchemaResult =
  | SchemaInstallPayload
  | { ok: false; error: string; hint?: string };

async function readSchemaSql(): Promise<string> {
  const fs = require("fs").promises as typeof import("fs").promises;
  const path = require("path") as typeof import("path");
  const migrationsPath =
    process.env.HQ_SCHEMA_PATH ?? path.join(__dirname, "../../db/migrations");

  try {
    const stat = await fs.stat(migrationsPath);

    if (stat.isFile()) {
      return await fs.readFile(migrationsPath, "utf-8");
    }

    const entries = await fs.readdir(migrationsPath);
    const sqlFiles = entries
      .filter((f: string) => f.endsWith(".sql"))
      .sort();

    if (sqlFiles.length === 0) {
      throw new Error(`No .sql files found in ${migrationsPath}`);
    }

    const parts = await Promise.all(
      sqlFiles.map((f: string) => fs.readFile(path.join(migrationsPath, f), "utf-8")),
    );

    return parts.join("\n\n");
  } catch (err) {
    throw new Error(
      `Failed to read schema migrations at ${migrationsPath}: ${(err as Error).message}. ` +
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

export async function prepareSchemaInstall(
  input: InstallSchemaInput,
): Promise<InstallSchemaResult> {
  const base = input.url.replace(/\/$/, "");
  let sql: string;
  try {
    sql = await readSchemaSql();
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

export async function verifySchemaInstalled(
  input: InstallSchemaInput,
): Promise<boolean> {
  const base = input.url.replace(/\/$/, "");
  const endpoint = `${base}/rest/v1/workspace?select=id&limit=1`;
  try {
    const res = await fetch(endpoint, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    return res.ok;
  } catch (err) {
    console.error(`[verify-schema] threw: ${(err as Error).message}`);
    return false;
  }
}
