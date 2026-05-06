import { Hono } from "hono";
import { getStripe, getWebhookSecret } from "../lib/stripe.js";
import {
  getMasterSupabase,
  getWorkspace,
  updateWorkspace,
  logSandboxEvent,
} from "../lib/master-supabase.js";
import { provisionWorkspace } from "../lib/provisioner.js";
import { sendPaymentFailed } from "../lib/email.js";
import { getPublicSiteUrl } from "../lib/env.js";
import { E2BSandboxProvider } from "../providers/e2b.js";
import type Stripe from "stripe";

const app = new Hono();

const sandboxProvider = new E2BSandboxProvider();

async function claimStripeEvent(eventId: string): Promise<boolean> {
  const db = getMasterSupabase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from("idempotency_keys").insert({
    key: `stripe:${eventId}`,
    expires_at: expiresAt,
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

async function releaseStripeEvent(eventId: string): Promise<void> {
  const db = getMasterSupabase();
  await db.from("idempotency_keys").delete().eq("key", `stripe:${eventId}`);
}

async function resolveWorkspaceEmail(workspaceId: string): Promise<string | null> {
  const db = getMasterSupabase();
  const { data: ws } = await db
    .from("hosted_workspaces")
    .select("user_id")
    .eq("id", workspaceId)
    .single();
  if (!ws) return null;
  const { data: user } = await db
    .from("hosted_users")
    .select("email")
    .eq("id", ws.user_id)
    .single();
  return user?.email ?? null;
}

app.post("/webhooks/stripe", async (c) => {
  const stripe = getStripe();
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing signature" }, 400);

  const body = await c.req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, getWebhookSecret());
  } catch (err) {
    console.error("[stripe] Webhook signature verification failed");
    return c.json({ error: "Invalid signature" }, 400);
  }

  const claimed = await claimStripeEvent(event.id);
  if (!claimed) return c.json({ received: true, duplicate: true });

  const db = getMasterSupabase();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspace_id;
        if (!workspaceId) {
          console.warn("[stripe] checkout.session.completed without workspace_id metadata");
          break;
        }

        const email = session.customer_email ?? session.customer_details?.email;
        if (!email) break;

        await db
          .from("hosted_workspaces")
          .update({
            stripe_subscription_id: session.subscription as string,
            subscription_status: "provisioning",
          })
          .eq("id", workspaceId);

        const { data: ws } = await db
          .from("hosted_workspaces")
          .select("user_id")
          .eq("id", workspaceId)
          .single();
        if (ws) {
          await db
            .from("hosted_users")
            .update({ stripe_customer_id: session.customer as string })
            .eq("id", ws.user_id);
        }

        provisionWorkspace(workspaceId, email, sandboxProvider).catch((err) => {
          console.error("[stripe] Background provisioning failed");
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: ws } = await db
          .from("hosted_workspaces")
          .select("id, e2b_sandbox_id, e2b_sandbox_status")
          .eq("stripe_subscription_id", sub.id)
          .single();

        if (ws) {
          if (ws.e2b_sandbox_id && ws.e2b_sandbox_status === "running") {
            try {
              await sandboxProvider.pause(ws.e2b_sandbox_id);
              await updateWorkspace(ws.id, { e2b_sandbox_status: "paused" } as any);
              await logSandboxEvent(ws.id, "paused", { reason: "subscription_canceled" });
            } catch (err) {
              console.error("[stripe] Failed to pause sandbox on cancel");
            }
          }

          await updateWorkspace(ws.id, {
            subscription_status: "canceling",
            cancel_at: thirtyDaysFromNow,
          } as any);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (!subId) break;

        const { data: ws } = await db
          .from("hosted_workspaces")
          .select("id, label, payment_failure_count, e2b_sandbox_id, e2b_sandbox_status, subscription_status")
          .eq("stripe_subscription_id", subId)
          .single();

        if (!ws || ws.subscription_status === "canceling" || ws.subscription_status === "canceled") break;

        const newCount = (ws.payment_failure_count ?? 0) + 1;
        const shouldSuspend = newCount >= 3;

        if (shouldSuspend && ws.e2b_sandbox_id && ws.e2b_sandbox_status === "running") {
          try {
            await sandboxProvider.pause(ws.e2b_sandbox_id);
            await updateWorkspace(ws.id, { e2b_sandbox_status: "paused" } as any);
            await logSandboxEvent(ws.id, "paused", { reason: "payment_suspended" });
          } catch (err) {
            console.error("[stripe] Failed to pause sandbox on suspension");
          }
        }

        await updateWorkspace(ws.id, {
          payment_failure_count: newCount,
          ...(shouldSuspend ? { subscription_status: "suspended" } : {}),
        } as any);

        await logSandboxEvent(ws.id, shouldSuspend ? "suspended" : "payment_failed", {
          failure_count: newCount,
        });

        const email = await resolveWorkspaceEmail(ws.id);
        if (email) {
          const origin = getPublicSiteUrl();
          sendPaymentFailed(email, ws.label, `${origin}/dashboard/account`, newCount).catch(
            () => console.error("[stripe] Failed to send payment failure email"),
          );
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
        if (!subId) break;

        const { data: ws } = await db
          .from("hosted_workspaces")
          .select("id, subscription_status, payment_failure_count, e2b_sandbox_id, e2b_sandbox_status")
          .eq("stripe_subscription_id", subId)
          .single();

        if (!ws) break;

        if (ws.subscription_status === "suspended") {
          if (ws.e2b_sandbox_id && ws.e2b_sandbox_status === "paused") {
            try {
              await sandboxProvider.resume(ws.e2b_sandbox_id);
              await updateWorkspace(ws.id, { e2b_sandbox_status: "running" } as any);
              await logSandboxEvent(ws.id, "resumed", { reason: "payment_recovered" });
            } catch (err) {
              console.error("[stripe] Failed to resume sandbox after payment recovery");
            }
          }

          await updateWorkspace(ws.id, {
            subscription_status: "active",
            payment_failure_count: 0,
          } as any);

          await logSandboxEvent(ws.id, "reactivated", { reason: "payment_recovered" });
        } else if (ws.payment_failure_count > 0) {
          await updateWorkspace(ws.id, { payment_failure_count: 0 } as any);
        }
        break;
      }
    }
  } catch (err) {
    await releaseStripeEvent(event.id);
    throw err;
  }

  return c.json({ received: true });
});

export default app;
