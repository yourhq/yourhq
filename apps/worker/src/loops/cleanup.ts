import { getMasterSupabase, logSandboxEvent } from "../lib/master-supabase.js";
import { deleteSupabaseProject } from "../lib/supabase-mgmt.js";
import type { SandboxProvider } from "../providers/types.js";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // Check every 6 hours

export function startCleanupLoop(provider: SandboxProvider): NodeJS.Timeout {
  async function cleanup() {
    const db = getMasterSupabase();

    const { data: expired } = await db
      .from("hosted_workspaces")
      .select("id, e2b_sandbox_id, supabase_project_ref")
      .eq("subscription_status", "canceling")
      .lt("cancel_at", new Date().toISOString());

    if (!expired?.length) return;

    for (const ws of expired) {
      console.log(`[cleanup] Destroying workspace ${ws.id}`);

      if (ws.e2b_sandbox_id) {
        try {
          await provider.destroy(ws.e2b_sandbox_id);
        } catch (err) {
          console.error(`[cleanup] Failed to destroy sandbox ${ws.e2b_sandbox_id}:`, err);
        }
      }

      if (ws.supabase_project_ref) {
        try {
          await deleteSupabaseProject(ws.supabase_project_ref);
          console.log(`[cleanup] Deleted Supabase project ${ws.supabase_project_ref}`);
        } catch (err) {
          console.error(`[cleanup] Failed to delete Supabase project ${ws.supabase_project_ref}:`, err);
        }
      }

      await db
        .from("hosted_workspaces")
        .update({
          subscription_status: "canceled",
          e2b_sandbox_id: null,
          e2b_sandbox_status: "none",
          supabase_project_ref: null,
          supabase_url: null,
          supabase_anon_key: null,
          supabase_service_role_key_enc: null,
          supabase_db_password_enc: null,
        })
        .eq("id", ws.id);

      await logSandboxEvent(ws.id, "destroyed", {
        reason: "cancellation_grace_expired",
        supabase_project_deleted: !!ws.supabase_project_ref,
      });
    }
  }

  cleanup().catch(console.error);
  return setInterval(() => cleanup().catch(console.error), CLEANUP_INTERVAL_MS);
}
