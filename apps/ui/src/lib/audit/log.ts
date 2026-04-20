import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditAction, AuditModule } from "./types";

interface AuditEntry {
  module: AuditModule;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  summary?: string;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  actor_agent_id?: string | null;
}

/**
 * Insert an audit log entry. Call this after every write operation.
 * Fires and forgets — doesn't block the caller on failure.
 */
export function logAudit(supabase: SupabaseClient, entry: AuditEntry) {
  supabase
    .from("audit_log")
    .insert({
      actor_type: entry.actor_agent_id ? "agent" : "human",
      actor_agent_id: entry.actor_agent_id ?? null,
      module: entry.module,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      summary: entry.summary ?? null,
      changes: entry.changes ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[audit] Failed to log:", error.message);
    });
}

/**
 * Compute a changes diff between two objects.
 * Returns only fields that changed, with old/new values.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[]
): Record<string, { old: unknown; new: unknown }> | null {
  const keys = fields ?? Object.keys(after);
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const key of keys) {
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
