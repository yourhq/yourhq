import { getMasterSupabase } from "../lib/master-supabase.js";
import type { SandboxProvider } from "../providers/types.js";

const RENEWAL_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
const TIMEOUT_MS = 24 * 60 * 60 * 1000; // Reset to 24h

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
      } catch (err) {
        console.error(`[timeout-renewer] Failed for sandbox ${ws.e2b_sandbox_id}:`, err);
        // Mark as error if sandbox is gone
        await db
          .from("hosted_workspaces")
          .update({ e2b_sandbox_status: "error" })
          .eq("id", ws.id);
      }
    }
  }

  renew().catch(console.error);
  return setInterval(() => renew().catch(console.error), RENEWAL_INTERVAL_MS);
}
