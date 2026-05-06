import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import healthRoutes from "./routes/health.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import workspaceRoutes from "./routes/workspaces.js";
import { E2BSandboxProvider } from "./providers/e2b.js";
import { startTimeoutRenewer } from "./loops/timeout-renewer.js";
import { startCleanupLoop } from "./loops/cleanup.js";
import { startProvisioningRetryLoop } from "./loops/provisioning-retry.js";
import { validateWorkerEnv } from "./lib/env.js";

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

const port = Number(process.env.PORT ?? 3001);
console.log(`[worker] Starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
