import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SUPABASE_MGMT_URL, mgmtHeaders } from "./supabase-mgmt.js";

export async function applyMigrations(projectRef: string): Promise<void> {
  const migrationsDir = join(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("No migration files found in db/migrations/");
  }

  console.log(`[schema-runner] Applying ${files.length} migrations`);

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), "utf-8");
    if (!sql.trim()) continue;

    console.log(`[schema-runner] Running ${file}...`);

    const res = await fetch(
      `${SUPABASE_MGMT_URL}/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: mgmtHeaders(),
        body: JSON.stringify({ query: sql }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Migration ${file} failed (${res.status}): ${body}`);
    }
  }

  console.log(`[schema-runner] Applied ${files.length} migrations`);
}
