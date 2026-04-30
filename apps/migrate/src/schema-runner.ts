import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "db",
  "migrations",
);

const TRACKING_TABLE = "_yourhq_migrations";

export interface MigrationFile {
  name: string;
  version: number;
  path: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
}

export function discoverMigrations(dir?: string): MigrationFile[] {
  const migrationsDir = dir ?? MIGRATIONS_DIR;
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  return files.map((name) => {
    const match = name.match(/^(\d+)/);
    const version = match ? parseInt(match[1], 10) : 0;
    const fullPath = path.join(migrationsDir, name);
    const sql = fs.readFileSync(fullPath, "utf-8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex").slice(0, 16);
    return { name, version, path: fullPath, sql, checksum };
  });
}

async function ensureTrackingTable(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      version    integer PRIMARY KEY,
      name       text NOT NULL,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getApplied(client: pg.Client): Promise<AppliedMigration[]> {
  const { rows } = await client.query<AppliedMigration>(
    `SELECT version, name, checksum, applied_at::text FROM ${TRACKING_TABLE} ORDER BY version`,
  );
  return rows;
}

export interface RunOptions {
  connectionString: string;
  migrationsDir?: string;
  dryRun?: boolean;
  onProgress?: (msg: string) => void;
}

export async function runMigrations(opts: RunOptions): Promise<MigrationResult> {
  const log = opts.onProgress ?? (() => {});
  const migrations = discoverMigrations(opts.migrationsDir);
  const result: MigrationResult = { applied: [], skipped: [], errors: [] };

  const client = new pg.Client({ connectionString: opts.connectionString });
  await client.connect();

  try {
    await ensureTrackingTable(client);
    const applied = await getApplied(client);
    const appliedMap = new Map(applied.map((a) => [a.version, a]));

    for (const migration of migrations) {
      const existing = appliedMap.get(migration.version);

      if (existing) {
        if (existing.checksum !== migration.checksum) {
          result.errors.push({
            name: migration.name,
            error: `Checksum mismatch: applied=${existing.checksum} current=${migration.checksum}. Migration file was modified after it was applied.`,
          });
          break;
        }
        result.skipped.push(migration.name);
        continue;
      }

      if (opts.dryRun) {
        log(`[dry-run] Would apply: ${migration.name}`);
        result.applied.push(migration.name);
        continue;
      }

      log(`Applying ${migration.name}...`);
      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO ${TRACKING_TABLE} (version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("COMMIT");
        result.applied.push(migration.name);
        log(`  Applied ${migration.name}`);
      } catch (e) {
        await client.query("ROLLBACK");
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push({ name: migration.name, error: msg });
        log(`  FAILED ${migration.name}: ${msg}`);
        break;
      }
    }
  } finally {
    await client.end();
  }

  return result;
}

export function generateSqlBundle(migrationsDir?: string): string {
  const migrations = discoverMigrations(migrationsDir);
  const parts: string[] = [
    "-- yourhq schema bundle",
    `-- Generated: ${new Date().toISOString()}`,
    `-- Migrations: ${migrations.length}`,
    "",
  ];

  for (const m of migrations) {
    parts.push(`-- ═══════════════════════════════════════════════════`);
    parts.push(`-- ${m.name}`);
    parts.push(`-- ═══════════════════════════════════════════════════`);
    parts.push(m.sql);
    parts.push("");
  }

  return parts.join("\n");
}

export function getPendingMigrations(
  applied: AppliedMigration[],
  available: MigrationFile[],
): MigrationFile[] {
  const appliedVersions = new Set(applied.map((a) => a.version));
  return available.filter((m) => !appliedVersions.has(m.version));
}
