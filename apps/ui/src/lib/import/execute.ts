import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit/log";
import type { DuplicateStrategy, ImportEntityType, ImportResult, ValidatedRow } from "./types";

const BATCH_SIZE = 50;

interface ExecuteOptions {
  supabase: SupabaseClient;
  entityType: ImportEntityType;
  rows: ValidatedRow[];
  duplicateStrategy: DuplicateStrategy;
  fileName: string;
  onProgress: (completed: number, total: number) => void;
}

/** Find existing records that match import data */
async function findDuplicates(
  supabase: SupabaseClient,
  entityType: ImportEntityType,
  rows: ValidatedRow[]
): Promise<Set<string>> {
  const dupeKeys = new Set<string>();

  if (entityType === "contact") {
    const emails = rows
      .map((r) => r.data.email as string | null)
      .filter((e): e is string => !!e);

    if (emails.length === 0) return dupeKeys;

    const { data } = await supabase
      .from("contacts")
      .select("email")
      .in("email", emails);

    if (data) {
      for (const row of data) {
        if (row.email) dupeKeys.add(row.email.toLowerCase());
      }
    }
  } else {
    const names = rows
      .map((r) => r.data.name as string | null)
      .filter((n): n is string => !!n);

    if (names.length === 0) return dupeKeys;

    const { data } = await supabase
      .from("organizations")
      .select("name");

    if (data) {
      for (const row of data) {
        if (row.name) dupeKeys.add(row.name.toLowerCase());
      }
    }
  }

  return dupeKeys;
}

/** Check if a row is a duplicate */
function isDuplicate(
  row: ValidatedRow,
  entityType: ImportEntityType,
  dupeKeys: Set<string>
): boolean {
  if (entityType === "contact") {
    const email = row.data.email as string | null;
    return !!email && dupeKeys.has(email.toLowerCase());
  }
  const name = row.data.name as string | null;
  return !!name && dupeKeys.has(name.toLowerCase());
}

/** Execute the import — batch insert rows with progress tracking */
export async function executeImport(opts: ExecuteOptions): Promise<ImportResult> {
  const { supabase, entityType, rows, duplicateStrategy, fileName, onProgress } = opts;
  const table = entityType === "contact" ? "contacts" : "organizations";

  // Only import valid rows
  const validRows = rows.filter((r) => r.isValid);
  const total = validRows.length;

  // Find duplicates
  const dupeKeys = await findDuplicates(supabase, entityType, validRows);

  const result: ImportResult = {
    created: 0,
    skipped: 0,
    errored: 0,
    duplicates: 0,
    errors: [],
  };

  // Filter based on duplicate strategy
  let toInsert: ValidatedRow[];
  if (duplicateStrategy === "skip") {
    toInsert = [];
    for (const row of validRows) {
      if (isDuplicate(row, entityType, dupeKeys)) {
        result.duplicates++;
        result.skipped++;
      } else {
        toInsert.push(row);
      }
    }
  } else if (duplicateStrategy === "create_new") {
    toInsert = validRows;
    result.duplicates = validRows.filter((r) => isDuplicate(r, entityType, dupeKeys)).length;
  } else {
    // overwrite — we'll use upsert
    toInsert = validRows;
    result.duplicates = validRows.filter((r) => isDuplicate(r, entityType, dupeKeys)).length;
  }

  // Batch insert
  let completed = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const records = batch.map((r) => r.data);

    try {
      if (duplicateStrategy === "overwrite" && entityType === "contact") {
        const { error } = await supabase.from(table).upsert(records, {
          onConflict: "email",
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(records);
        if (error) throw error;
      }
      result.created += batch.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Try inserting one by one to identify bad rows
      for (const row of batch) {
        try {
          if (duplicateStrategy === "overwrite" && entityType === "contact") {
            const { error } = await supabase.from(table).upsert([row.data], {
              onConflict: "email",
            });
            if (error) throw error;
          } else {
            const { error } = await supabase.from(table).insert([row.data]);
            if (error) throw error;
          }
          result.created++;
        } catch (rowErr) {
          result.errored++;
          result.errors.push({
            row: row.index + 1,
            message: rowErr instanceof Error ? rowErr.message : message,
          });
        }
      }
    }

    completed += batch.length;
    onProgress(completed, toInsert.length);
  }

  // Audit log
  logAudit(supabase, {
    module: entityType === "contact" ? "crm" : "crm",
    entity_type: entityType,
    entity_id: "bulk-import",
    action: "created",
    summary: `Imported ${result.created} ${entityType}s from ${fileName}`,
    changes: {
      source: { old: null, new: fileName },
      total: { old: null, new: total },
      created: { old: null, new: result.created },
      skipped: { old: null, new: result.skipped },
      errored: { old: null, new: result.errored },
    },
  });

  return result;
}

/** Check for duplicates and return the count (for preview step) */
export async function countDuplicates(
  supabase: SupabaseClient,
  entityType: ImportEntityType,
  rows: ValidatedRow[]
): Promise<number> {
  const dupeKeys = await findDuplicates(supabase, entityType, rows);
  return rows.filter((r) => isDuplicate(r, entityType, dupeKeys)).length;
}
