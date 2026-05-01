import { Hono } from "hono";
import { getStripe, getWebhookSecret } from "../lib/stripe.js";
import { getMasterSupabase } from "../lib/master-supabase.js";
import { provisionWorkspace } from "../lib/provisioner.js";
import { E2BSandboxProvider } from "../providers/e2b.js";
import type Stripe from "stripe";

const app = new Hono();

const sandboxProvider = new E2BSandboxProvider();

app.post("/webhooks/stripe", async (c) => {
  const stripe = getStripe();
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing signature" }, 400);

  const body = await c.req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, getWebhookSecret());
  } catch (err) {
    console.error("[stripe] Webhook signature verification failed:", err);
    return c.json({ error: "Invalid signature" }, 400);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspace_id;
      if (!workspaceId) {
        console.warn("[stripe] checkout.session.completed without workspace_id metadata");
        break;
      }

      const db = getMasterSupabase();
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
        console.error("[stripe] Background provisioning failed:", err);
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const db = getMasterSupabase();

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
      const invoice = event.data.object as Stripe.Invoice;
      console.warn(`[stripe] Payment failed for customer ${invoice.customer}, invoice ${invoice.id}`);
      // TODO: send payment failed email, suspend after 3 failures
      break;
    }
  }

  return c.json({ received: true });
});

export default app;
