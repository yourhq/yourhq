# @yourhq/worker

The control-plane worker for **HQ Hosted** — the managed deployment of HQ at [yourhq.ai](https://yourhq.ai).

It handles workspace provisioning (E2B sandboxes), Stripe billing, and lifecycle background loops (timeout renewals, cleanup). It's not used by self-hosted installs — `docker compose up` does not start it.

## Why is this in the open-source repo?

The same codebase powers both the self-hosted and hosted variants. Keeping the hosted control plane in this repo means:

- The hosted offering builds on the same migrations, schema, and UI you can audit yourself.
- If you want to run your own multi-tenant deployment of HQ (managed for your team, your customers, etc.), the worker is here as a starting point.
- We can't ship hosted-only behaviour that diverges silently from the self-hosted code.

You can ignore this directory entirely if you're self-hosting.

## What it does

- `routes/health.ts` — `/healthz` for the load balancer.
- `routes/stripe-webhook.ts` — receives Stripe events, updates workspace billing state.
- `routes/workspaces.ts` — internal API for the UI to provision/decommission workspaces.
- `providers/e2b.ts` — wraps [E2B](https://e2b.dev) sandboxes (where each customer's gateway runs in the hosted product).
- `loops/timeout-renewer.ts` — keeps long-lived sandboxes alive past E2B's default timeout.
- `loops/cleanup.ts` — reclaims sandboxes for inactive workspaces.

## Running it

You don't need to. If you do (because you're working on the hosted control plane):

```bash
cd apps/worker
npm install
cp ../../.env.hosted.example ../../.env  # set Stripe / E2B / Supabase master keys
npm run dev
```

`tsx watch src/index.ts` will reload on changes. The worker listens on `:3001` by default.

## Deployment shape

In production, the worker runs as a standalone Hono service behind an internal load balancer. The UI calls it with a bearer token (`WORKER_INTERNAL_TOKEN`) for workspace operations. Stripe and the E2B control plane reach it directly over the public internet on the unauthenticated routes (`/healthz`, `/stripe/webhook`).

## License

Same as the rest of HQ — Apache 2.0. See [LICENSE](../../LICENSE).
