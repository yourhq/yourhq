import { getMasterSupabase, updateWorkspace, logSandboxEvent } from "../lib/master-supabase.js";
import { deleteSupabaseProject } from "../lib/supabase-mgmt.js";
import type { SandboxProvider } from "../providers/types.js";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function startCleanupLoop(provider: SandboxProvider): NodeJS.Timeout {
  async function cleanup() {
    const db = getMasterSupabase();

    const { data: expired } = await db
      .from("hosted_workspaces")
      .select("id, e2b_sandbox_id, e2b_sandbox_status, supabase_project_ref, cleanup_sandbox_done, cleanup_supabase_done")
      .eq("subscription_status", "canceling")
      .lt("cancel_at", new Date().toISOString());

    if (!expired?.length) return;

    for (const ws of expired) {
      console.log("[cleanup] Processing expired workspace", ws.id);

      let sandboxDone = ws.cleanup_sandbox_done;
      let supabaseDone = ws.cleanup_supabase_done;

      if (!sandboxDone && ws.e2b_sandbox_id) {
        try {
          if (ws.e2b_sandbox_status === "paused") {
            await provider.resume(ws.e2b_sandbox_id);
          }
          await provider.destroy(ws.e2b_sandbox_id);
          sandboxDone = true;
        } catch (err) {
          console.error("[cleanup] Failed to destroy sandbox", ws.id);
        }
      } else if (!ws.e2b_sandbox_id) {
        sandboxDone = true;
      }

      if (!supabaseDone && ws.supabase_project_ref) {
        try {
          await deleteSupabaseProject(ws.supabase_project_ref);
          supabaseDone = true;
        } catch (err) {
          console.error("[cleanup] Failed to delete Supabase project", ws.id);
        }
      } else if (!ws.supabase_project_ref) {
        supabaseDone = true;
      }

      await updateWorkspace(ws.id, {
        cleanup_sandbox_done: sandboxDone,
        cleanup_supabase_done: supabaseDone,
      } as any);

      if (sandboxDone && supabaseDone) {
        await updateWorkspace(ws.id, {
          subscription_status: "canceled",
          e2b_sandbox_id: null,
          e2b_sandbox_status: "none",
          supabase_project_ref: null,
          supabase_url: null,
          supabase_anon_key: null,
          supabase_service_role_key_enc: null,
          supabase_db_password_enc: null,
        } as any);

        await logSandboxEvent(ws.id, "destroyed", {
          reason: "cancellation_grace_expired",
        });
      } else {
        console.warn("[cleanup] Partial cleanup for workspace", ws.id, {
          sandbox: sandboxDone,
          supabase: supabaseDone,
        });
        await logSandboxEvent(ws.id, "cleanup_partial", {
          sandbox_done: sandboxDone,
          supabase_done: supabaseDone,
        });
      }
    }
  }

  cleanup().catch(console.error);
  return setInterval(() => cleanup().catch(console.error), CLEANUP_INTERVAL_MS);
}
