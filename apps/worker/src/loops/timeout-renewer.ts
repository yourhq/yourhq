import { getMasterSupabase, logSandboxEvent } from "../lib/master-supabase.js";
import type { SandboxProvider } from "../providers/types.js";

const RENEWAL_INTERVAL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 24 * 60 * 60 * 1000;

export function startTimeoutRenewer(provider: SandboxProvider): NodeJS.Timeout {
  async function renew() {
    const db = getMasterSupabase();
    const { data: workspaces } = await db
      .from("hosted_workspaces")
      .select("id, e2b_sandbox_id")
      .eq("e2b_sandbox_status", "running")
      .in("subscription_status", ["active", "provisioning"]);

    if (!workspaces?.length) return;

    for (const ws of workspaces) {
      if (!ws.e2b_sandbox_id) continue;
      try {
        await provider.renewTimeout(ws.e2b_sandbox_id, TIMEOUT_MS);
      } catch {
        console.warn(`[timeout-renewer] Renewal failed for ${ws.id}, checking actual status`);
        const actual = await provider.status(ws.e2b_sandbox_id).catch(() => "unknown" as const);
        if (actual === "stopped") {
          await db
            .from("hosted_workspaces")
            .update({ e2b_sandbox_status: "error" })
            .eq("id", ws.id);
          await logSandboxEvent(ws.id, "timeout_renewal_failed", {
            sandbox_id: ws.e2b_sandbox_id,
            actual_status: actual,
          });
        }
        // If "unknown" (E2B API unreachable) or "paused", skip — the health loop will handle it
      }
    }
  }

  renew().catch(console.error);
  return setInterval(() => renew().catch(console.error), RENEWAL_INTERVAL_MS);
}
