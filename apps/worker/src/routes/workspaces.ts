import { Hono } from "hono";
import {
  findUserByEmail,
  createUser,
  getMasterSupabase,
  getWorkspace,
  getWorkspacesForUser,
  updateWorkspace,
} from "../lib/master-supabase.js";
import { createCheckoutSession, createBillingPortalSession, getStripe } from "../lib/stripe.js";

const app = new Hono();

// Lookup user + workspaces by email (used by hosted login flow)
app.get("/users/by-email/:email", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const user = await findUserByEmail(email);
  if (!user) return c.json({ error: "User not found" }, 404);

  const workspaces = await getWorkspacesForUser(user.id);
  return c.json({
    user: { id: user.id, email: user.email, display_name: user.display_name },
    workspaces: workspaces.map((w) => ({
      id: w.id,
      label: w.label,
      emoji: w.emoji,
      status: w.subscription_status,
      supabase_url: w.supabase_url,
      supabase_anon_key: w.supabase_anon_key,
      supabase_service_role_key: w.supabase_service_role_key_enc,
    })),
  });
});

// Get workspace provisioning status (polled by /provision page)
app.get("/workspaces/:id/status", async (c) => {
  const ws = await getWorkspace(c.req.param("id"));
  if (!ws) return c.json({ error: "Not found" }, 404);

  return c.json({
    provision_stage: ws.provision_stage,
    provision_error: ws.provision_error,
    subscription_status: ws.subscription_status,
    e2b_sandbox_status: ws.e2b_sandbox_status,
  });
});

// List workspaces for a user
app.get("/users/:userId/workspaces", async (c) => {
  const workspaces = await getWorkspacesForUser(c.req.param("userId"));
  return c.json(workspaces);
});

// List sibling workspaces (same user as the given workspace)
app.get("/workspaces/:id/siblings", async (c) => {
  const ws = await getWorkspace(c.req.param("id"));
  if (!ws) return c.json({ error: "Not found" }, 404);

  const all = await getWorkspacesForUser(ws.user_id);
  return c.json({
    workspaces: all.map((w) => ({
      id: w.id,
      label: w.label,
      emoji: w.emoji,
      subscription_status: w.subscription_status,
      e2b_sandbox_status: w.e2b_sandbox_status,
    })),
  });
});

// Create Stripe Checkout session for a new workspace
app.post("/checkout", async (c) => {
  const body = await c.req.json<{
    email: string;
    ownerName?: string;
    workspaceLabel?: string;
    workspaceEmoji?: string;
    contextPreset?: string;
  }>();

  const email = body.email?.toLowerCase().trim();
  if (!email) return c.json({ error: "email is required" }, 400);

  let user = await findUserByEmail(email);
  if (!user) {
    user = await createUser(email, body.ownerName);
  }

  const db = getMasterSupabase();
  const { data: ws, error } = await db
    .from("hosted_workspaces")
    .insert({
      user_id: user.id,
      label: body.workspaceLabel || "My Workspace",
      emoji: body.workspaceEmoji || "🏠",
      subscription_status: "pending",
      setup_metadata: {
        ownerName: body.ownerName || "",
        contextPreset: body.contextPreset || "other",
      },
    })
    .select("id")
    .single();
  if (error || !ws) {
    return c.json({ error: error?.message ?? "Failed to create workspace" }, 500);
  }

  const origin = c.req.header("origin") ?? "https://yourhq.ai";
  const url = await createCheckoutSession({
    customerEmail: email,
    workspaceId: ws.id,
    successUrl: `${origin}/provision/${ws.id}`,
    cancelUrl: `${origin}/signup`,
  });

  return c.json({ url });
});

// Cancel a workspace (30-day grace period)
app.post("/workspaces/:id/cancel", async (c) => {
  const ws = await getWorkspace(c.req.param("id"));
  if (!ws) return c.json({ error: "Not found" }, 404);
  if (ws.subscription_status !== "active") {
    return c.json({ error: "Workspace is not active" }, 400);
  }

  const cancelAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (ws.stripe_subscription_id) {
    const stripe = getStripe();
    await stripe.subscriptions.update(ws.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }

  await updateWorkspace(ws.id, {
    subscription_status: "canceling",
    cancel_at: cancelAt,
  } as Record<string, unknown>);

  return c.json({ ok: true, cancel_at: cancelAt });
});

// Create Stripe billing portal session
app.post("/workspaces/:id/billing-portal", async (c) => {
  const ws = await getWorkspace(c.req.param("id"));
  if (!ws) return c.json({ error: "Not found" }, 404);

  const db = getMasterSupabase();
  const { data: user } = await db
    .from("hosted_users")
    .select("stripe_customer_id")
    .eq("id", ws.user_id)
    .single();

  if (!user?.stripe_customer_id) {
    return c.json({ error: "No billing account found" }, 400);
  }

  const origin = c.req.header("origin") ?? "https://yourhq.ai";
  const url = await createBillingPortalSession(
    user.stripe_customer_id,
    `${origin}/dashboard/account`,
  );

  return c.json({ url });
});

export default app;
