import { Hono } from "hono";
import { getStripe, getWebhookSecret } from "../lib/stripe.js";
import { getMasterSupabase } from "../lib/master-supabase.js";
import { provisionWorkspace } from "../lib/provisioner.js";
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

        // Update workspace with Stripe IDs
        await db
          .from("hosted_workspaces")
          .update({
            stripe_subscription_id: session.subscription as string,
            subscription_status: "provisioning",
          })
          .eq("id", workspaceId);

        // Update user with Stripe customer ID
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

        // Fire-and-forget provisioning (runs in background)
        provisionWorkspace(workspaceId, email, sandboxProvider).catch((err) => {
          console.error("[stripe] Background provisioning failed");
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        await db
          .from("hosted_workspaces")
          .update({
            subscription_status: "canceling",
            cancel_at: thirtyDaysFromNow,
          })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "invoice.payment_failed": {
        console.warn("[stripe] invoice.payment_failed received");
        // TODO: send payment failed email, suspend after 3 failures
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
