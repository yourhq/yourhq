import {
  getMasterSupabase,
  getUser,
} from "../lib/master-supabase.js";
import { provisionWorkspace } from "../lib/provisioner.js";
import type { SandboxProvider } from "../providers/types.js";

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export function startProvisioningRetryLoop(provider: SandboxProvider): NodeJS.Timeout {
  const running = new Set<string>();

  async function retry() {
    const db = getMasterSupabase();
    const retryBefore = new Date(Date.now() - RETRY_DELAY_MS).toISOString();

    const { data: workspaces } = await db
      .from("hosted_workspaces")
      .select("id, user_id, provision_attempts, updated_at")
      .eq("subscription_status", "provisioning")
      .eq("provision_stage", "error")
      .lt("updated_at", retryBefore)
      .lt("provision_attempts", MAX_ATTEMPTS)
      .limit(5);

    if (!workspaces?.length) return;

    for (const ws of workspaces) {
      if (running.has(ws.id)) continue;
      running.add(ws.id);
      try {
        const user = await getUser(ws.user_id);
        if (!user?.email) continue;
        await provisionWorkspace(ws.id, user.email, provider);
      } catch {
        console.error("[provisioning-retry] Retry failed");
      } finally {
        running.delete(ws.id);
      }
    }
  }

  retry().catch(console.error);
  return setInterval(() => retry().catch(console.error), RETRY_INTERVAL_MS);
}
