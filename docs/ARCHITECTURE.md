# HQ — Architecture

HQ (the codebase at [`yourhq/yourhq`](https://github.com/yourhq/yourhq), hosted at [yourhq.ai](https://yourhq.ai)) is a self-hostable operations platform for running a fleet of personal AI agents. One Next.js UI manages your work — CRM, tasks, docs, automations — and one or more gateway hosts run the agents themselves inside Docker containers you control. The target user is a single operator (founder, solo team, power user) who wants their agents to do real work on their behalf, in their own environment, against their own Supabase project, without handing that work to someone else's multi-tenant cloud. This document is the top-to-bottom tour of how the pieces fit together. It assumes you've skimmed the [README](../README.md) and want to know where things actually live.

For deeper dives, see:

- [`docs/FEATURES.md`](FEATURES.md) — product tour of implemented user-facing features.
- [`docs/NETWORKING.md`](NETWORKING.md) — Tailscale, public HTTPS, and the bind-mode matrix.
- [`docs/AGENTS.md`](AGENTS.md) — agents, templates, the OpenClaw integration, and the template library.
- [`docs/CONFIGURATION.md`](CONFIGURATION.md) — full environment variable reference.
- [`docs/SCHEMA.md`](SCHEMA.md) — table groups, migrations, queues, triggers, and RLS trust model.
- [`db/migrations/`](../db/migrations/) — schema of record, applied in filename order.

---

## 1. Intro

An agent, in HQ, is a long-lived workspace consisting of a git branch, a Chrome profile, an OpenClaw session, and a Telegram bot. The UI never speaks to agents directly. Every instruction the UI gives — "create this agent", "edit this file", "restart this gateway" — travels through Supabase, where it becomes a row in a queue. Python daemons on each gateway host subscribe to that queue over Supabase Realtime and execute the work locally. The result: the UI can run on your laptop, on a VPS, or in a browser tab from a hotel Wi-Fi, and the gateways can run anywhere you have Docker, with no inbound connections needed between them.

This is a **single-user** design. RLS on Supabase is "authenticated full access". Multi-tenant isolation is out of scope — each operator runs their own Supabase project. The hosted offering will layer account management on top of this same topology rather than redesigning it.

## 2. System diagram

```
    ┌──────────────────────────────────────────────────────────────┐
    │                          Supabase                            │
    │  (YOUR project — the only shared state in the system)        │
    │                                                              │
    │   agents          agent_commands        agent_inbox_items    │
    │   gateways        tasks / contacts      workspace / ...      │
    └──────────────────────────────────────────────────────────────┘
        ▲  ▲                  ▲                       ▲
        │  │  REST + Realtime  │  REST + Realtime      │
        │  │                   │                       │
        │  │             ┌─────┴─────┐           ┌─────┴─────┐
        │  │             │  Gateway  │           │  Gateway  │
        │  │             │   host A  │   ...     │   host N  │
        │  │             │ (Docker)  │           │ (Docker)  │
        │  │             │           │           │           │
        │  │             │ ┌───────┐ │           │ ┌───────┐ │
        │  │             │ │gateway│ │           │ │gateway│ │
        │  │             │ ├───────┤ │           │ ├───────┤ │
        │  │       files │ │files- │ │ files     │ │files- │ │
        │  │         API │ │  api  │◄┼──┐    ┌──►│ │  api  │ │
        │  │             │ ├───────┤ │  │    │   │ ├───────┤ │
        │  │             │ │dispat-│ │  │    │   │ │dispat-│ │
        │  │             │ │ cher  │ │  │    │   │ │ cher  │ │
        │  │             │ ├───────┤ │  │    │   │ ├───────┤ │
        │  │             │ │runner │ │  │    │   │ │runner │ │
        │  │             │ └───────┘ │  │    │   │ └───────┘ │
        │  │             └───────────┘  │    │   └───────────┘
        │  │                            │    │
    ┌───┴──┴────────────────────────────┴────┴───┐
    │                  HQ UI (Next.js)           │
    │   (laptop, VPS, Codespaces — anywhere)     │
    └────────────────────────────────────────────┘
```

Every arrow on the left of the diagram is a Supabase API call. The only direct UI↔gateway link is the files-API (right side), which is an authenticated HTTP request from the UI's server process into each gateway's `files_api.py`. Nothing is peer-to-peer; there is no central control plane outside Supabase.

## 3. The four services

All four services live in the same monorepo ([`docker-compose.yml`](../docker-compose.yml)). The UI ships as one container and the three gateway services ship as three more, all bundled in a single Compose project by default. Larger installs can run the UI and gateway services on separate hosts against the same Supabase project.

| Service | Role | Key files | Ports | Reads from Supabase | Writes to Supabase |
|---|---|---|---|---|---|
| `ui` | The Next.js admin dashboard. Renders the CRM, tasks, agents, docs, settings, automations. Issues server actions that enqueue commands and proxy file edits. | [`apps/ui/`](../apps/ui/) — App Router under `src/app/`; server actions in `src/app/dashboard/*/actions.ts`; gateway proxy in [`src/lib/agent-repo/gateway-backend.ts`](../apps/ui/src/lib/agent-repo/gateway-backend.ts); auth middleware in [`src/middleware.ts`](../apps/ui/src/middleware.ts) | `3000` (host) | everything (uses authenticated user's session + service role for privileged inserts) | contacts, tasks, agents, `agent_commands`, `agent_inbox_items`, `audit_log`, `automation_rules`, everything |
| `gateway` | The container that hosts the agents. Runs Xtigervnc + XFCE + Chrome + OpenClaw gateway + the files-API. Exposes a remote desktop (noVNC) and a file browser (`files-api`). | [`gateway/entrypoint.sh`](../gateway/entrypoint.sh), [`gateway/files_api.py`](../gateway/files_api.py), [`gateway/Dockerfile`](../gateway/Dockerfile) | `6901` (noVNC), `18790` (files-API) | `workspace.slug` at boot to prefix branches | `gateways` row upsert at boot with reachable URLs |
| `dispatcher` | Python daemon. Subscribes to `agent_inbox_items` INSERT events and wakes the owning agent via `openclaw agent --agent …`. Only wakes agents bound to this gateway. | [`gateway/daemons/inbox_dispatcher.py`](../gateway/daemons/inbox_dispatcher.py), [`gateway/dispatcher/Dockerfile`](../gateway/dispatcher/Dockerfile) | none | `agent_inbox_items`, `agents`, `gateways`, `workspace` | `agent_inbox_items.last_wake_*` |
| `runner` | Python daemon. Subscribes to `agent_commands` INSERT events, leases via `lease_command(gateway_slug=…)`, executes `add-agent.sh` / `update-agent.sh` / `docker compose restart …`, reports back stdout/stderr/exit code. | [`gateway/daemons/command_runner.py`](../gateway/daemons/command_runner.py), [`gateway/runner/Dockerfile`](../gateway/runner/Dockerfile), [`gateway/scripts/add-agent.sh`](../gateway/scripts/add-agent.sh) | none | `agent_commands`, `workspace`, `gateways` | `agent_commands.status/stdout/stderr`, `gateways.last_seen_at` (30 s heartbeat) |

The `gateway`, `dispatcher`, and `runner` containers all share the Docker volume `gateway-state` (mounted at `/home/openclaw/.openclaw`). That volume is where OpenClaw's config, the bare git repo, per-agent worktrees, browser profiles, and the VNC state live. The runner additionally mounts `/var/run/docker.sock` so it can restart sibling containers.

## 4. Data flow: creating an agent end-to-end

This is the most "I see how it all fits" path through the system. Everything else is a variation of it.

1. **User picks "New agent"** in the UI (`Dashboard → Agents → New agent`). The agent-create wizard ([`apps/ui/src/components/agents/agent-create-wizard.tsx`](../apps/ui/src/components/agents/agent-create-wizard.tsx), referenced but owned in `apps/ui`) has three steps: template, identity, Telegram token.

2. **Templates are fetched** from [`GET /api/agents/templates`](../apps/ui/src/app/api/agents/templates/route.ts), which returns the list baked into the UI image at build time from [`templates/`](../templates/). Each template carries its `agent.json` and a `branch` field like `template/cofounder`.

3. **User submits.** The UI runs the `createAgentWithBranch` server action in [`apps/ui/src/app/dashboard/agents/actions.ts`](../apps/ui/src/app/dashboard/agents/actions.ts). That action:
   - Validates the slug (2–40 chars, `[a-z0-9-]`, no reserved names).
   - Reads the `workspace` singleton for the owner profile + `workspace.slug`.
   - Confirms the slug is free in `agents`.
   - Computes the branch name — `"${workspace.slug}/${slug}"` (e.g. `my-workspace/ricardo`).
   - Inserts an `agents` row with `meta.team`, `meta.template_branch`, `meta.emoji`, and `meta.telegram_token_env` all derived from the template.
   - Writes an `audit_log` entry.

4. **The UI enqueues a `provision` command** via `enqueueAgentCommand` (same file). That's an `INSERT` into `agent_commands` with `action='provision'`, `agent_slug=<slug>`, and `payload` containing `telegram_token`, `source_template`, `name`, `description`, `emoji`, and the owner profile fields.

5. **The runner wakes up.** In [`command_runner.py`](../gateway/daemons/command_runner.py), the Realtime listener on `agent_commands` sees the new row and calls `process_pending()`, which calls the `lease_command(p_gateway_slug=GATEWAY_ID)` RPC to atomically claim it. `lease_command` ([`001_schema.sql:1529`](../db/migrations/001_schema.sql)) does `FOR UPDATE SKIP LOCKED` so parallel runners on different gateways never steal each other's work.

6. **The runner builds the shell command** via `build_command('provision', …)`: it resolves the branch name from `workspace.slug` + `agent_slug`, then invokes [`gateway/scripts/add-agent.sh`](../gateway/scripts/add-agent.sh) with `--token`, `--source-branch`, `--slug`, and the owner-profile flags.

7. **`add-agent.sh` does the real work** in the gateway container's state volume:
   - Creates the agent's branch off the template (or `default`) inside the bare repo at `$HOME/.openclaw/repo.git`.
   - Checks out the branch as a `git worktree` at `$HOME/.openclaw/workspace-<branch>`.
   - Patches `agent.json` with the wizard inputs via `jq`.
   - Fills `USER.md` placeholder tokens (`USER_NAME_HERE`, `PREFERRED_NAME_HERE`, `TIMEZONE_HERE`) from the owner profile.
   - Rewrites `IDENTITY.md` `## Name` and `## Emoji` sections.
   - Swaps `BROWSER_PROFILE_HERE` in `TOOLS.md` for the agent's slug.
   - Commits the init patches.
   - Allocates a CDP port (18801+) for this agent's Chrome.
   - Patches `openclaw.json` to register the agent, its Telegram bot account, and the new browser profile.
   - Creates an XFCE desktop shortcut for the agent's Chrome.
   - Links the shared Codex auth profile.
   - Runs `openclaw gateway restart` so the new agent is picked up.

8. **The runner reports back.** `complete_command` writes `status='done'`, `exit_code=0`, `stdout`, and `stderr` to the `agent_commands` row; the UI's subscription on that row renders the command as green in the command history view at `/dashboard/settings/system`. On success the runner also PATCHes the `payload` to scrub `telegram_token` (the only place in the system it ever touches).

9. **The agent is online.** `openclaw gateway run` now has the agent in its session list; the agent's Telegram bot is bound; its Chrome profile is ready; its git worktree is writable both from inside the container (by openclaw itself) and from outside via the files-API.

If any step after the branch is created fails, the runner reports the failure but **does not roll back** the branch. That's a known asymmetry — the UI-side insert has a try/catch rollback for the `agents` row only. Cleanup of orphaned branches is a `remove` command on the same queue.

## 5. Data flow: incoming Telegram message

This path is mostly owned by OpenClaw (the agent runtime; see [`openclaw`](https://github.com/yourhq/openclaw)). HQ's integration surface is intentionally thin:

1. The user DMs or @-mentions the bot on Telegram.
2. Telegram hits openclaw's long-poll inside the gateway container.
3. openclaw matches the inbound account to an `agentId` via the `bindings[]` array in `openclaw.json` (written by `add-agent.sh` at step 8/7.8 above).
4. openclaw wakes that agent's session, loads its workspace (the git worktree from `add-agent.sh`), and runs the message through the agent's prompt assembly (`IDENTITY.md`, `SOUL.md`, `TOOLS.md`, `USER.md`, and skills under `skills/`).
5. The agent's response is streamed back to Telegram directly. If the agent writes to Supabase during the turn — `interactions`, `tasks`, `contacts`, `audit_log` — it does so via the `skills/hq/*` Python scripts baked into every template, which talk to Supabase with the service role key.
6. HQ's dispatcher is not involved in Telegram-originated messages. It only fires on the "background inbox" path (§4 above): when HQ itself (a trigger on `tasks` or `contacts`, or an @-mention in a task comment) enqueues an `agent_inbox_items` row.

## 6. Data flow: UI edits an agent file

The file browser at `/dashboard/agents/[id]` is the one place the UI talks directly to a gateway. That direct link is scoped to a single HTTP call:

1. User edits a file in the UI's Monaco editor and saves.
2. The UI's server action calls `saveFile(branch, path, content, sha)` from [`apps/ui/src/lib/agent-repo/gateway-backend.ts`](../apps/ui/src/lib/agent-repo/gateway-backend.ts).
3. `gateway-backend.ts` makes an authenticated `PUT` to `${GATEWAY_URL}/branches/<branch>/files/<path>` with `Authorization: Bearer ${GATEWAY_AUTH_TOKEN}`. On the default Compose stack `GATEWAY_URL=http://gateway:18790`, so the request stays inside Docker's bridge network.
4. [`files_api.py`](../gateway/files_api.py) on the gateway validates the token (constant-time), resolves the worktree path (`$HOME/.openclaw/workspace-<branch>`), does a `safe_join()` to refuse any `..` escape, and writes the file.
5. The files-API immediately runs `git add <path> && git commit -m "edit via UI: <path>"` in the worktree. The file edit is now a git commit on the agent's branch, locally.
6. After a successful write, the UI server action then enqueues an `update` command via `enqueueAgentCommand({ action: 'update', agentId })`.
7. The runner leases that command and runs [`gateway/scripts/update-agent.sh <branch>`](../gateway/scripts/update-agent.sh), which tells openclaw to reload the agent's session so the changed file takes effect.

**Why not push straight to GitHub?** Two reasons. First, the agent's source of truth is its local worktree on the gateway, not a remote — the agent reads and writes that worktree during its turn, and conflicts are worse than stale reads. Second, the UI is decoupled from the gateway's networking model (Tailscale/public/local); going through the files-API means the UI only needs one secret (`GATEWAY_AUTH_TOKEN`) and one URL (`GATEWAY_URL`), not a GitHub PAT per operator plus a remote URL per gateway. Optional GitHub mirroring exists — set `GIT_REMOTE_URL` and the gateway will fetch on boot — but that's for off-site backup, not the live edit path.

## 7. Gateway internals

The `gateway` container is deliberately fat in Phase 1 — it's one image that runs every user-facing process. The layout, from [`gateway/entrypoint.sh`](../gateway/entrypoint.sh):

- **Xtigervnc** on `:1` — a combined X server + VNC server (replaces the older Xvfb + x0vncserver pair because the scraping-server perl wrapper on Ubuntu 24.04 is broken). Listens on `localhost:5901`.
- **XFCE** — a full desktop (panel, Whisker menu, Thunar, xfce4-terminal, xfce4-goodies). We ship the real desktop so the remote-desktop experience matches what the operator sees locally — no minimized WM, no surprises.
- **Session D-Bus** started explicitly at `$XDG_RUNTIME_DIR/bus` with a deterministic socket path; we do not rely on `dbus-launch --exit-with-session` because it's unreliable across glib/xfconf versions.
- **XDG dirs** (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_RUNTIME_DIR`) exported explicitly; some glib builds don't apply `$HOME/.config` fallbacks in containers.
- **autocutsel** × 2 — keeps CLIPBOARD and PRIMARY selections in sync so noVNC's clipboard panel reaches Chrome and the terminal.
- **Chrome (amd64) or Chromium (arm64)** — started per-agent via desktop shortcuts (`$HOME/.openclaw/Desktop/Chrome-<slug>.desktop`), one shortcut per agent, each with its own `--user-data-dir` and `--remote-debugging-port` (CDP port, 18801+).
- **websockify → noVNC** on `0.0.0.0:6901` in-container. The host port mapping (`NOVNC_HOST_PORT` in `.env`) decides whether 6901 is reachable on localhost only or on the host's tailnet/public interface.
- **files_api.py** on `0.0.0.0:18790` in-container, gated by `GATEWAY_AUTH_TOKEN`.
- **openclaw gateway run** as PID 1 under tini. Invoked with `exec` at the end of `entrypoint.sh` so signals propagate cleanly.

**Why one container for all of that?** OpenClaw, Chrome, and the window manager share a single X display and a single file system namespace — splitting them into separate containers would mean cross-container DISPLAY forwarding, shared XDG, shared user-data-dirs, and shared `openclaw.json`, all over Docker networking. Not impossible, but a lot of moving parts for little benefit when the whole stack is owned by one operator.

**Volumes.** Two named volumes per Compose project:

- `gateway-state` (mounted at `/home/openclaw/.openclaw` in gateway, dispatcher read-only, runner read-write): holds `openclaw.json`, `repo.git` (bare), `workspace-<branch>/` (worktrees), `browser/<profile>/user-data/`, `Desktop/`, `plugins/`, `shared-auth/`, `.vnc-password`.
- `gateway-chrome-profile` (mounted at `/home/openclaw/.config/google-chrome`): Chrome's own profile dir. Kept separate so you can blow it away without destroying agent workspaces.

## 8. The agent workspace model

HQ does not push to GitHub. Each gateway has a **local bare git repository** at `$HOME/.openclaw/repo.git`, seeded on first boot from [`templates/`](../templates/) (bundled into the gateway image at `/opt/templates`, or cloned from `$TEMPLATES_SOURCE` if set). Each template becomes a branch called `template/<dirname>`. A `default` template becomes branch `default`, which is the bare repo's HEAD.

When an agent is provisioned, `add-agent.sh`:

1. Creates a new branch `${workspace.slug}/<agent-slug>` off the selected template branch.
2. Adds a `git worktree` for it at `$HOME/.openclaw/workspace-${workspace.slug}/<agent-slug>`.
3. Commits the agent's personality patches (see §4 step 7).

That worktree is a real checkout. The agent reads and writes it during its turn. The files-API reads and writes it when the operator edits files in the UI. Every mutation becomes a commit — "edit via UI", "create via UI", "delete via UI", "feat: initialize agent …" — so there's a full audit trail of who touched what, even though the "who" is always one operator and a handful of agents.

**Optional remote.** If `GIT_REMOTE_URL` is set (and `GIT_DEPLOY_KEY` for SSH), the gateway adds it as `origin` and fetches on boot. Push on write is not automatic; the design intent is that the remote is a backup, not a source of truth. A nightly push is a reasonable operator cron; the platform does not assume one.

## 9. Networking model

Networking in HQ is intentionally boring: the containers publish ports to the host, and the host's network configuration decides who can reach them. Tailscale, TLS, reverse proxies — all of it lives on the host, not in any container.

Three modes are shipped:

| Mode | `HOST_REACHABLE_URL` | Host port binds | Who can reach it |
|---|---|---|---|
| `local` | `http://localhost` | `127.0.0.1:*` | Only this machine. |
| `tailscale` | `http://<host-ts-ip>` | `0.0.0.0:*` | Anyone on your tailnet; loopback still works. Tailscale is installed **on the host**, not in the container. |
| `public` | `https://<your-domain>` | `0.0.0.0:*` (fronted by host Caddy/nginx) | The internet, via your host's reverse proxy. |

The installer ([`installer/install.sh`](../installer/install.sh)) asks once, sets `NETWORKING_MODE` and `HOST_REACHABLE_URL` in `.env`, and Compose port mappings (`UI_HOST_PORT`, `NOVNC_HOST_PORT`, `FILES_API_HOST_PORT`) do the rest.

**Why do gateways register their own URLs?** In step 9 of the entrypoint, the gateway upserts its row in the `gateways` table with `meta.reachable_urls.{base,files_api,novnc}` set from `HOST_REACHABLE_URL`. That's how the UI — which may live on a completely different machine — knows what hostname to hit for this specific gateway's file browser and desktop. The UI never hard-codes a gateway URL; it reads `gateways.meta.reachable_urls`.

Full details in [`docs/NETWORKING.md`](NETWORKING.md).

## 10. Multi-machine topologies

Because the only shared state is Supabase and gateways publish their own reachable URLs, the same code handles three deployment shapes with no conditionals:

**Single-host, everything local.** UI and gateway on the same machine. `GATEWAY_URL=http://gateway:18790` (Docker DNS). `NOVNC_HOST_PORT=127.0.0.1:6901`. `docker compose up -d`. This is what the installer sets up by default.

**Split UI / gateway.** UI on your laptop, gateway on an always-on host (Mac mini, VPS, Raspberry Pi). Both hosts have Tailscale. On the gateway host: `docker compose up -d gateway dispatcher runner`. On the laptop: `docker compose up -d ui` with `GATEWAY_URL=http://100.x.y.z:18790` (the gateway host's tailnet IP). Same `GATEWAY_AUTH_TOKEN` on both sides.

**Multi-gateway.** Multiple gateway hosts against the same Supabase. Each gets its own `GATEWAY_ID` (`laptop`, `mac-mini`, `vps-eu`) and registers its own row in the `gateways` table at boot. Each agent has a `gateway_id` FK; the runner filters `lease_command` by its own gateway slug (`lease_command(p_gateway_slug=$GATEWAY_ID)`), and the dispatcher filters inbox items by caching the set of local agent IDs ([`refresh_local_agents`](../gateway/daemons/inbox_dispatcher.py) in `inbox_dispatcher.py`). No gateway ever picks up another gateway's work.

Adding another gateway is normally UI-driven:

1. Settings → Gateways → Add Gateway.
2. The UI mints a single-use registration token and renders an installer command.
3. The operator runs that command on the gateway host.
4. The gateway writes its row to Supabase and starts heartbeating.

Manual registration still works for development or advanced operators: set a unique `GATEWAY_ID`, point the host at the same Supabase project, and run `docker compose up -d gateway dispatcher runner`.

## 11. Trust model / security boundaries

HQ is a single-operator platform. The security model reflects that — there is no per-user RLS, no multi-tenant isolation, no request-signing between services. The boundaries that do exist are:

- **Supabase service role key** is fully trusted. It's in the UI container, the gateway container, the dispatcher container, and the runner container. Anyone with it can read or write any row in your Supabase. Treat it as a database admin password.
- **Supabase anon key + user session** gate the UI itself. Auth is Supabase email/password; `middleware.ts` redirects unauthenticated requests to `/login`. RLS on every table is `"Authenticated full access"` — there's only one tenant, and they get everything.
- **`GATEWAY_AUTH_TOKEN`** is the one pre-shared secret between UI and gateway. It gates the files-API exclusively. Constant-time compare in [`files_api.py`](../gateway/files_api.py). Generate with `openssl rand -hex 32`; rotate by updating `.env` on both sides and restarting.
- **noVNC password** (`VNC_PASSWORD`, auto-generated if unset) gates the remote desktop. Read it out of `/home/openclaw/.openclaw/.vnc-password` in the gateway-state volume.
- **Docker socket mount in the runner container.** The runner binds `/var/run/docker.sock` from the host so it can run `docker compose restart gateway` for the `restart_gateway` / `restart_dispatcher` / `update_all` command actions. This is a full root-equivalent on the host. Treat it as such: anyone with command-queue access (i.e. the service role key) can execute arbitrary Docker operations on the gateway host. If the runner process is ever RCE'd, the attacker owns the host. Document, don't hide.
- **Template content is trusted.** Templates are seeded into the bare repo and their files are read by agents; the wizard only substitutes a few placeholders. A malicious template is equivalent to a malicious script running on the gateway with the service role key. Only ship templates from sources you trust.
- **Per-agent Chrome profile isolation.** Each agent has its own `--user-data-dir`, so cookies and extensions don't cross agents. There is no stronger sandbox; all agents share the container user (`openclaw`), the file system, and the D-Bus session.

What HQ **does not** provide: per-agent privilege separation, user-facing audit of the service role key's usage, network egress filtering from the gateway container, or any protection against a compromised Supabase project. If any of those matter to you, they need to be layered on top — typically at the host level (container user namespacing, network policies, a secondary firewall).

## 12. Supabase as the backbone

Supabase is the backbone. Every piece of coordination — commands, inbox items, heartbeats, audit trails, realtime subscriptions, cross-agent observability — is a row in a Postgres table.

**Why not a custom backend?** Three reasons. First, Realtime + Postgres triggers + RPCs cover the entire messaging surface HQ needs (enqueue, lease, complete, fail, subscribe). Second, hosting Postgres + auth + storage + realtime in one managed service that the operator already owns removes a huge ops burden versus running Redis, Postgres, a WebSocket gateway, and an auth service ourselves. Third, the operator-owned Supabase project is the natural tenant boundary — the multi-project UI is a registry of Supabase URLs, not a multi-tenant schema redesign.

The structures to know:

- **`agent_commands`** — command queue consumed by the runner. Schema at [`001_schema.sql:1475`](../db/migrations/001_schema.sql). Action enum covers `provision`, `update`, `remove`, `approve_pairing`, `restart_gateway`, `restart_dispatcher`, `update_all`. `lease_command(p_lease_seconds, p_gateway_slug)` is the atomic claim; `start_command`, `complete_command`, `fail_command` report back. Rows persist forever (with `stdout`/`stderr`) for the command-history UI.
- **`agent_inbox_items`** — background-work queue consumed by agents, not the runner. Inserted by Postgres triggers on `tasks` (task assignment / reassignment), `comments` (@-mentions), and `contacts` (via `automation_rules`). The dispatcher wakes agents; the agent's own session claims work via `lease_inbox_item(p_agent_id, p_lease_seconds)` (see [`001_schema.sql:1286`](../db/migrations/001_schema.sql)) and reports via `complete_inbox_item` / `fail_inbox_item`. `dedup_key` + unique constraint prevents duplicates. `attempt_count < max_attempts` bounds retries before dead-lettering.
- **`gateways`** — registry of known gateway hosts. Each row has `slug`, `label`, `status`, `last_seen_at`, and `meta.reachable_urls`. Seeded with a `default` row so single-gateway installs work without setup.
- **`gateway_registration_tokens`** — single-use token records minted by the UI when adding a gateway. The plaintext token is shown once in the installer command; the database stores only the hash and expiry metadata.
- **`agent_usage` / `agent_budgets`** — usage source-of-truth and per-agent current-period rollup from [`002_usage_budget.sql`](../db/migrations/002_usage_budget.sql). Runtime usage is logged by the HQ bootstrap OpenClaw plugin; hard budget cutoffs are enforced both before replies and before dispatcher wakes.
- **`agents.reports_to_id`** — lightweight org chart from [`003_agents_reports_to.sql`](../db/migrations/003_agents_reports_to.sql). The `agent_reports_chain` RPC lets the UI prevent cycles before saving manager changes.
- **Realtime**. Both daemons open a WebSocket to `/realtime/v1/websocket` and subscribe to `postgres_changes` on `agent_commands` / `agent_inbox_items` INSERT. Fallback poll every `POLL_INTERVAL` (30 s runner) / `RECONCILE_INTERVAL` (120 s dispatcher) catches anything Realtime missed during a reconnect.
- **Triggers worth knowing**: `enqueue_task_assignment` enqueues inbox items when a task is assigned; `enqueue_comment_mentions` does the same for @-mentions; `process_contact_automation` runs `automation_rules` on contact inserts/updates. See [`001_schema.sql:1362`, `1407`, `1655`](../db/migrations/001_schema.sql).

## 13. Extensibility

The UI is designed to be configured, not coded, for most everyday changes:

- **Agent templates.** Add a directory under [`templates/`](../templates/) with `agent.json`, `IDENTITY.md`, `USER.md`, `TOOLS.md`, and a `skills/` dir. On next gateway boot it's seeded as `template/<dirname>`. No UI deploy needed. Full guidance in [`templates/README.md`](../templates/README.md) and [`docs/AGENTS.md`](AGENTS.md).
- **Custom fields.** `/dashboard/settings/fields` adds/edits rows in `field_definitions`, keyed per entity type. `DynamicFieldGroups` renders them in contact/organization forms without code changes.
- **Pipeline stages.** `/dashboard/settings/pipeline` writes to `pipeline_stages`. Status dropdowns, kanban columns, and color swatches all read from this table via `usePipelineStages(entityType)`.
- **Task streams.** Streams are runtime-created — functional, project, or custom — and hold their own colors. Tasks reference them by FK.
- **Automation rules.** `/dashboard/automations` creates `automation_rules` that the `process_contact_automation` trigger evaluates on every contact change, enqueuing inbox items when conditions match.
- **Provider connections.** Settings → Connections enqueues auth commands that the runner executes through OpenClaw. API-key, OAuth paste, device-code, CLI-reuse, and local URL flows share the same command queue.
- **Agent hierarchy.** Manager/direct-report structure is a regular column on `agents`. Runtime prompt context is assembled by the HQ bootstrap plugin, not hard-coded into templates.
- **Usage budgets.** Budget config is stored in `agent_budgets`; raw usage is append-only in `agent_usage`. New provider pricing support belongs in the bootstrap plugin's pricing map and should degrade to unmetered calls when unknown.
- **New command actions.** Add a case in [`command_runner.py`'s `build_command()`](../gateway/daemons/command_runner.py), extend the `command_action` enum in the schema migration, and expose it as a server action call in [`apps/ui/src/app/dashboard/agents/actions.ts`](../apps/ui/src/app/dashboard/agents/actions.ts). This is the extension point for anything a runner needs to do on the gateway host.

## 14. Where things are going

- **Self-hosted hardening.** Better migration tooling, stronger validation around project setup, clearer gateway health diagnostics, and more complete command/log observability.
- **Hosted offering.** Account management, automated Supabase/gateway provisioning, billing, and managed operations in front of the same core runtime.
- **Integrations.** More MCP-first integrations, richer provider auth UX, optional email/calendar/Slack/Notion flows, and deeper automation primitives.
- **Docs site.** The markdown docs in this repository should remain the source of truth and can later be rendered at `docs.yourhq.ai`.

Roadmap items should be tracked in [ROADMAP.md](ROADMAP.md) and issues, not as stale phase labels in docs.

---

**Next reads:** [`docs/FEATURES.md`](FEATURES.md) for the product tour, [`docs/NETWORKING.md`](NETWORKING.md) for the bind-mode / Tailscale / reverse-proxy details, [`docs/AGENTS.md`](AGENTS.md) for the agent runtime and template authoring, [`docs/CONFIGURATION.md`](CONFIGURATION.md) for every environment variable, and [`db/migrations/`](../db/migrations/) for the schema of record.
