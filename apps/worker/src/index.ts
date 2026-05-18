import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import healthRoutes from "./routes/health.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import workspaceRoutes from "./routes/workspaces.js";
import { E2BSandboxProvider } from "./providers/e2b.js";
import { startTimeoutRenewer } from "./loops/timeout-renewer.js";
import { startCleanupLoop } from "./loops/cleanup.js";
import { startProvisioningRetryLoop } from "./loops/provisioning-retry.js";
import { startSandboxHealthLoop } from "./loops/sandbox-health.js";
import { validateWorkerEnv } from "./lib/env.js";
import { shutdownAnalytics } from "./lib/analytics.js";

validateWorkerEnv();
const app = new Hono();

app.route("/", healthRoutes);
app.route("/", stripeWebhookRoutes);

const internalToken = process.env.WORKER_INTERNAL_TOKEN!;
app.use("/users/*", bearerAuth({ token: internalToken }));
app.use("/workspaces/*", bearerAuth({ token: internalToken }));
app.use("/checkout", bearerAuth({ token: internalToken }));

app.route("/", workspaceRoutes);

// Background loops
const sandboxProvider = new E2BSandboxProvider();
startTimeoutRenewer(sandboxProvider);
startCleanupLoop(sandboxProvider);
startProvisioningRetryLoop(sandboxProvider);
startSandboxHealthLoop(sandboxProvider);

const port = Number(process.env.PORT ?? 3001);
console.log(`[worker] Starting on port ${port}`);

import { serve } from "@hono/node-server";

serve({ fetch: app.fetch, port }, () => {
  console.log(`[worker] Listening on http://localhost:${port}`);
});

process.on("SIGTERM", async () => {
  await shutdownAnalytics();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await shutdownAnalytics();
  process.exit(0);
});
