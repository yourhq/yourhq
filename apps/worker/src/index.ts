import { Hono } from "hono";
import { logger } from "hono/logger";
import healthRoutes from "./routes/health.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import workspaceRoutes from "./routes/workspaces.js";
import { E2BSandboxProvider } from "./providers/e2b.js";
import { startTimeoutRenewer } from "./loops/timeout-renewer.js";
import { startCleanupLoop } from "./loops/cleanup.js";

const app = new Hono();
app.use("*", logger());

app.route("/", healthRoutes);
app.route("/", stripeWebhookRoutes);
app.route("/", workspaceRoutes);

// Background loops
const sandboxProvider = new E2BSandboxProvider();
startTimeoutRenewer(sandboxProvider);
startCleanupLoop(sandboxProvider);

const port = Number(process.env.PORT ?? 3001);
console.log(`[worker] Starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
