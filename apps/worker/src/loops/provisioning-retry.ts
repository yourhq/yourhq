import {
  getMasterSupabase,
  getUser,
  updateWorkspace,
} from "../lib/master-supabase.js";
import { provisionWorkspace } from "../lib/provisioner.js";
import { reportLoopRun } from "../lib/loop-status.js";
import { getStripe } from "../lib/stripe.js";
import type { SandboxProvider } from "../providers/types.js";

const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 2 * 60 * 1000;
const PENDING_STALE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export function startProvisioningRetryLoop(provider: SandboxProvider): NodeJS.Timeout {
  const running = new Set<string>();

  async function retryErrors() {
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

  async function rescueStuckPending() {
    const db = getMasterSupabase();
    const staleBefore = new Date(Date.now() - PENDING_STALE_MS).toISOString();

    const { data: pending } = await db
      .from("hosted_workspaces")
      .select("id, user_id, stripe_subscription_id")
      .eq("subscription_status", "pending")
      .lt("updated_at", staleBefore)
      .limit(5);

    if (!pending?.length) return;

    const stripe = getStripe();

    for (const ws of pending) {
      if (running.has(ws.id)) continue;

      if (ws.stripe_subscription_id) {
        running.add(ws.id);
        try {
          const user = await getUser(ws.user_id);
          if (!user?.email) continue;
          await updateWorkspace(ws.id, { subscription_status: "provisioning" } as any);
          await provisionWorkspace(ws.id, user.email, provider);
        } catch {
          console.error("[provisioning-retry] Rescue failed for", ws.id);
        } finally {
          running.delete(ws.id);
        }
        continue;
      }

      try {
        const sessions = await stripe.checkout.sessions.list({ limit: 10 });
        const match = sessions.data.find(
          (s) => s.metadata?.workspace_id === ws.id && s.status === "complete",
        );
        if (!match) continue;

        const email = match.customer_email ?? match.customer_details?.email;
        if (!email) continue;

        running.add(ws.id);
        try {
          await updateWorkspace(ws.id, {
            stripe_subscription_id: match.subscription as string,
            subscription_status: "provisioning",
          } as any);

          if (match.customer) {
            await db
              .from("hosted_users")
              .update({ stripe_customer_id: match.customer as string })
              .eq("id", ws.user_id);
          }

          await provisionWorkspace(ws.id, email, provider);
        } catch {
          console.error("[provisioning-retry] Rescue provision failed for", ws.id);
        } finally {
          running.delete(ws.id);
        }
      } catch {
        console.error("[provisioning-retry] Stripe lookup failed for", ws.id);
      }
    }
  }

  const run = () =>
    Promise.all([retryErrors(), rescueStuckPending()])
      .then(() => reportLoopRun("provisioning-retry", true))
      .catch((err) => {
        reportLoopRun("provisioning-retry", false, err instanceof Error ? err.message : String(err));
        console.error("[provisioning-retry]", err);
      });
  run();
  return setInterval(run, RETRY_INTERVAL_MS);
}
