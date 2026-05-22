# Platform Bugs Found During E2E Testing

Discovered 2026-05-22. These should be addressed before v0.2.

---

## P0 — Agent execution broken

### 1. Onboarding does not set agent model in `openclaw.json`

**Impact:** Agents can't execute any tasks after onboarding.

During onboarding, the user selects Anthropic/Claude as their LLM provider. The flow correctly saves the Anthropic API key to `~/.openclaw/agents/<slug>/agent/auth-profiles.json`, but does **not** set the `model` field in `openclaw.json`. When `model` is empty, OpenClaw falls back to its hardcoded default: `openai/gpt-5.4`. Since no OpenAI key exists, every agent wake fails with:

```
No API key found for provider "openai". Auth store: ~/.openclaw/agents/scout/agent/auth-profiles.json
```

**Fix:** The onboarding provisioning step (or `add-agent.sh`) should set the per-agent `model` field in `openclaw.json` to match the selected provider. E.g., if Anthropic is selected, set `model: "anthropic/claude-sonnet-4-20250514"`.

**Workaround:** Manually edit `openclaw.json` inside the gateway container and restart.

### 2. `OPENCLAW_GATEWAY_URL` env var bypasses gateway auth token

**Impact:** Inbox items stay `pending` forever — agents never process tasks.

**Status: FIXED** — removed `OPENCLAW_GATEWAY_URL` from `docker-compose.yml` (commit `9d764dc`).

The dispatcher entrypoint already patches `openclaw-dispatcher.json` with `gateway.mode: "remote"` and `gateway.remote.url: ws://gateway:18789`, preserving the auth token. But when `OPENCLAW_GATEWAY_URL` was set as an env var, `openclaw agent` used the env var override which bypasses config-based auth, causing `"gateway url override requires explicit credentials"`. The agent then fell back to embedded mode where hq-bootstrap isn't loaded, so inbox items never got marked done in Supabase.

### 2b. Gateway exec preflight blocks agent inbox processing

**Impact:** When the agent connects to the gateway successfully, OpenClaw's exec tool rejects `cd workspace && python3 hq_inbox_process.py` as "complex interpreter invocation." The agent can't run the inbox processing script through the gateway.

The agent falls back to embedded mode where it runs successfully but without hq-bootstrap, so Supabase doesn't get updated.

**Fix:** The hq-bootstrap plugin or the agent's system prompt should instruct using absolute paths (`python3 /absolute/path/to/hq_inbox_process.py`) instead of `cd && python3`. This is an OpenClaw security policy — it blocks shell command chaining to prevent injection.

### 3. `set_agent_model` command fails with "Missing agent_slug"

**Impact:** Can't change agent model through the UI or command queue.

The `set_agent_model` action in `command_runner.py` expects `agent_slug` in the payload, but the command queue insert from the UI only puts it on the command row (not in the payload JSONB).

**Fix:** Either read `agent_slug` from the command row when building the command, or ensure the UI puts it in the payload too.

---

## P1 — Onboarding robustness

### 4. Wizard advances before gateway is fully healthy

The wizard advances past the gateway step as soon as a `gateways` row appears in Supabase with `status: ready`. But the gateway runtime (OpenClaw, dispatcher, embedder, file processor) may not be fully up yet.

**Fix:** Poll actual service health endpoints before advancing. Show per-service health status.

### 5. Stale container conflicts on re-run

Running `docker compose --profile gateway up -d` fails if orphaned containers exist from a previous run. The wizard should clean up stale containers before starting.

### 6. Wizard state lost across browsers

When opening HQ in a different browser (no sessionStorage), the wizard state is lost. The UI sees workspace/gateway rows and assumes onboarding is complete, redirecting to login — but no auth user exists yet.

**Fix:** Check server-side onboarding completeness (e.g., whether an auth user exists), not just schema presence.

---

## P2 — UX issues

### 7. OpenAI key connected via Settings UI not synced to agent auth stores

Connecting an OpenAI key via Settings → Connections stores it in the `secrets` table and triggers `secrets_sync`, which writes per-agent `.env` files. But the OpenClaw auth store (`auth-profiles.json`) is separate from the `.env` files — the key doesn't get added to auth profiles automatically.

**Fix:** When a model provider key is saved via the connections UI, also write it to the per-agent `auth-profiles.json` via a gateway command.

### 8. `agent model: openai/gpt-5.4` displayed even when per-agent model is set

The gateway startup log always shows `agent model: openai/gpt-5.4` (the fallback default) even when per-agent models are explicitly set in `openclaw.json`. This is confusing during debugging.

**Fix:** Show the effective per-agent model in the log, or suppress the fallback display when per-agent models are configured.
