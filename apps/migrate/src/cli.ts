#!/usr/bin/env node
import { runMigrations, discoverMigrations, generateSqlBundle } from "./schema-runner.js";

const args = process.argv.slice(2);

function usage(): never {
  console.log(`
yourhq-migrate — Apply pending schema migrations to a Supabase/Postgres database.

Usage:
  yourhq-migrate --connection-string "postgres://..."   Apply pending migrations
  yourhq-migrate --dry-run --connection-string "..."    Show what would be applied
  yourhq-migrate --list                                 List all migration files
  yourhq-migrate --bundle                               Print concatenated SQL to stdout
  yourhq-migrate --help                                 Show this help

Options:
  --connection-string <url>  Postgres connection string (session mode, port 5432)
  --dry-run                  Show what would be applied without executing
  --list                     List discovered migration files
  --bundle                   Output all migrations as a single SQL bundle
  --migrations-dir <path>    Override migrations directory (default: db/migrations/)
  --help                     Show this help
`.trim());
  process.exit(0);
}

async function main() {
  if (args.includes("--help") || args.length === 0) usage();

  const migrationsDir = getArg("--migrations-dir") ?? undefined;

  if (args.includes("--list")) {
    const migrations = discoverMigrations(migrationsDir);
    console.log(`Found ${migrations.length} migrations:\n`);
    for (const m of migrations) {
      console.log(`  ${m.name}  (v${m.version}, checksum ${m.checksum})`);
    }
    return;
  }

  if (args.includes("--bundle")) {
    const bundle = generateSqlBundle(migrationsDir);
    process.stdout.write(bundle);
    return;
  }

  const connectionString = getArg("--connection-string");
  if (!connectionString) {
    console.error("Error: --connection-string is required");
    process.exit(1);
  }

  const dryRun = args.includes("--dry-run");

  console.log(dryRun ? "Dry run — no changes will be made.\n" : "Applying migrations...\n");

  const result = await runMigrations({
    connectionString,
    migrationsDir,
    dryRun,
    onProgress: (msg) => console.log(msg),
  });

  console.log("");
  if (result.skipped.length > 0) {
    console.log(`Skipped (already applied): ${result.skipped.length}`);
  }
  if (result.applied.length > 0) {
    console.log(`Applied: ${result.applied.length}`);
    for (const name of result.applied) {
      console.log(`  + ${name}`);
    }
  }
  if (result.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of result.errors) {
      console.log(`  ! ${err.name}: ${err.error}`);
    }
    process.exit(1);
  }

  if (result.applied.length === 0 && result.errors.length === 0) {
    console.log("Schema is up to date.");
  }
}

function getArg(name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
