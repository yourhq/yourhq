# Configuration

This is the authoritative reference for every environment variable and configuration knob in yourhq. If you're trying to figure out what a variable does, whether you need to set it, or why a change you made didn't take effect, start here.

Related reading:
- `docs/NETWORKING.md` — deep dive on `NETWORKING_MODE` and host vs container networking
- `docs/AGENTS.md` — agent-specific runtime config (not covered here; lives in `agent.json` per branch)
- `docs/PUBLIC_DEPLOY.md` — reverse-proxy + TLS topology for `NETWORKING_MODE=public`

---

## 1. Where configuration lives

All stack-level config lives in a single file: **`.env` at the repo root** (or at `$YOURHQ_HOME/.env`, typically `~/.yourhq/.env`, if you installed via the curl installer). Docker Compose loads this file automatically — the values are substituted into `docker-compose.yml` (and the dev overlay `docker-compose.dev.yml`) at `docker compose up` time.

The installer (`installer/install.sh`) prompts for the minimum required values and writes `.env` for you with sensible defaults for everything else. `.env.example` is the canonical list of supported keys — if a variable isn't there, it isn't read by the stack.

There are two flavors of variable that behave very differently:

- **Runtime variables** — read by the container process when it starts. Change the value in `.env`, run `docker compose up -d <service>`, and the new value takes effect. Most variables are runtime.
- **Build-time variables** — baked into the container image when `docker compose build` runs. Changing the value in `.env` does nothing until the image is rebuilt. In this stack, **every `NEXT_PUBLIC_*` variable is build-time** because Next.js inlines them into the client-side JS bundle. See section 3 for the gory details.

The installer always runs `docker compose pull` (and falls back to `build` if the image isn't in the registry), so on a fresh install the distinction is invisible. It only matters when you edit `.env` later.

---

## 2. Grouped environment variable reference

Each variable below lists: **Name / Required / Default / What it does / When to override**.

### 2.1 Supabase (required)

The entire stack is a front-end + daemons over a Supabase Postgres database. These four keys are non-negotiable.

- **`SUPABASE_URL`** — **Required**. No default. The `https://xxxxxxxx.supabase.co` URL of your Supabase project. Used server-side by the gateway, dispatcher, and runner to talk to the REST API and log into the Postgres connection pool. Override if you migrate to a new Supabase project.

- **`NEXT_PUBLIC_SUPABASE_URL`** — **Required (build-time)**. Defaults to `${SUPABASE_URL}` in `docker-compose.yml`. The URL the UI's browser bundle uses to reach Supabase. Almost always identical to `SUPABASE_URL`. Only override if the browser has to reach Supabase through a different hostname than the server (e.g. a custom domain in front of Supabase).

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — **Required (build-time)**. No default. The public anon JWT from Supabase Project Settings → API. Baked into the UI image. Safe to expose in the browser because RLS enforces auth — but treat it as semi-public: rotating it requires rebuilding the UI image.

- **`SUPABASE_SERVICE_ROLE_KEY`** — **Required, secret**. No default. The service-role JWT from Supabase Project Settings → API. Bypasses RLS, used by the gateway/dispatcher/runner for privileged writes and by the UI's server actions. **Never commit this.** Rotate it in the Supabase dashboard if leaked, then update `.env` and restart every service.

- **`EMBEDDING_API_KEY`** — **Optional**. Empty. OpenAI API key used by the gateway to embed documents when the knowledge-base vector search is enabled. Override to enable embeddings; leave empty to disable.

### 2.2 Gateway identity

These let one Supabase project host multiple independent gateway hosts (your laptop, a Mac mini, a VPS) without them stepping on each other.

- **`GATEWAY_ID`** — **Required**. Default `default`. Unique slug per gateway within a Supabase project. Becomes the `slug` column in the `gateways` table. Override when you bring up a second gateway against the same Supabase (e.g. `mac-mini`, `vps-eu`).

- **`GATEWAY_LABEL`** — **Optional**. Default `Primary gateway`. Human-readable label shown in the UI's gateway picker. Override for anything you'd show a person.

- **`WORKSPACE_SLUG`** — **Required**. Default `my-workspace`. The workspace slug you pick in the setup wizard. Used as the prefix for per-agent git branches in the gateway's local repo (branches are named `${WORKSPACE_SLUG}/${agent_slug}`). **Must match the slug in the UI's workspace record** — if you change it after install, rename branches accordingly.

- **`COMPOSE_PROJECT`** — **Optional**. Default `yourhq`. Namespaces Compose containers and volumes (you'll see `yourhq-ui`, `yourhq-gateway`, etc.). Override if you're running two parallel stacks on one host (e.g. `yourhq-staging`).

### 2.3 Networking

Host-level networking decisions: local-only vs Tailscale vs public HTTPS. The installer sets all five of these together based on the mode you pick. See `docs/NETWORKING.md` for the full topology.

- **`NETWORKING_MODE`** — **Required**. Default `local`. One of `local` / `tailscale` / `public`. Purely informational for the containers — it's written into the `gateways.meta.networking_mode` column so the UI knows how to build URLs. The actual binding behavior is controlled by the `*_HOST_PORT` variables below.

- **`HOST_REACHABLE_URL`** — **Required**. Default `http://localhost`. The URL users hit in their browser, minus the port. Installer sets this to `http://localhost` for `local`, `http://<host-ts-ip>` for `tailscale`, or `https://<your-domain>` for `public`. The gateway writes it into Supabase so the UI can build links to noVNC and the files-API.

- **`UI_HOST_PORT`** — **Optional**. Default `127.0.0.1:3000` (loopback-only, safe). The installer flips this to `0.0.0.0:3000` when you pick Tailscale or Public mode. Manually override to `0.0.0.0:3000` when you want the host's network interfaces (Tailscale, public) to decide reachability.

- **`NOVNC_HOST_PORT`** — **Optional**. Same shape as `UI_HOST_PORT`, default `127.0.0.1:6901`. Installer flips to `0.0.0.0:6901` for Tailscale/Public modes. Keep loopback-only unless you trust the host's network — noVNC only has a generated VNC password as auth and should never be on the public internet without a reverse proxy.

- **`FILES_API_HOST_PORT`** — **Optional**. Default `127.0.0.1:18790` (loopback-only). The files-API only needs to be reachable from outside the host when the UI lives on a different machine (Tailscale cross-host). Single-host installs can leave it on loopback — the UI reaches it internally via Docker DNS (`http://gateway:18790`).

- **`NOVNC_BIND`** — **Optional**. Default `local`. One of `local` (websockify binds `0.0.0.0:6901` inside the container, Docker port-mapping decides real exposure) or `off` (don't start noVNC at all). Override to `off` if you don't need remote desktop.

- **`VNC_PASSWORD`** — **Optional, secret**. Empty. The VNC password for the in-container desktop. Auto-generated on first boot if empty; the generated value is saved to `$OPENCLAW_HOME/.vnc-password` inside the `gateway-state` volume. Override if you want a specific known password.

### 2.4 Files-API (UI file browser)

The gateway runs an HTTP API (`files_api.py`) that the UI calls to read/write files inside per-agent git worktrees. Auth is a shared bearer token.

- **`GATEWAY_AUTH_TOKEN`** — **Required (secret) if you want the file browser**. Empty by default. Shared secret between the UI and the gateway's files-API. Generate with `openssl rand -hex 32`. Must be identical in both the `ui` and `gateway` services — since both read the same `.env`, this is automatic. If empty, the gateway doesn't start the files-API at all.

- **`GATEWAY_URL`** — **Optional**. Default `http://gateway:18790`. Where the UI reaches the files-API. Leave at the default for same-host Compose stacks (uses Docker's internal DNS). Override to `http://<gateway-host-ts-ip>:18790` when UI and gateway live on different machines connected over Tailscale.

- **`FILES_API_BIND`** — **Optional**. Default `docker`. One of `docker` (listens on the Docker internal network only — UI reaches via `gateway:18790`), `any` (binds `0.0.0.0` inside container; host port-mapping decides exposure), or `off` (disable the files-API). Override to `any` when the UI is on a remote host.

- **`FILES_API_PORT`** — **Optional**. Default `18790`. In-container port for the files-API. Rarely worth changing.

### 2.5 Templates

- **`TEMPLATES_SOURCE`** — **Optional**. Empty. When empty, the gateway seeds its bare repo from the templates bundled in `/opt/templates` inside the image. Override with `git+https://github.com/your-org/your-templates.git` to seed from your own repo instead. Only read on **first boot** when the gateway creates its bare repo — changing it later won't re-seed existing branches.

### 2.6 Git remote sync (optional, backup)

Lets the gateway push per-agent branches to an external git remote so your agents' memory and skills are backed up and optionally reachable from other devices. Two configuration paths — pick one.

**Path A: generic remote** (works for any git host — GitHub, Gitea, self-hosted)

- **`GIT_REMOTE_URL`** — **Optional**. Empty. If set, added as the `origin` remote of the gateway's bare repo. Examples: `https://x-access-token:$TOKEN@github.com/org/repo.git`, `git@github.com:org/repo.git`, `https://git.example.com/agents.git`.

- **`GIT_DEPLOY_KEY`** — **Optional, secret**. Empty. SSH private key (full multiline PEM, keep surrounding double-quotes in `.env` so newlines survive). Only needed for SSH remotes.

**Path B: GitHub shorthand** (for GitHub only, no URL construction)

If `GIT_REMOTE_URL` is empty AND all three `GITHUB_*` vars below are set, the gateway synthesizes `https://x-access-token:$GITHUB_TOKEN@github.com/$GITHUB_REPO_OWNER/$GITHUB_REPO_NAME.git` at boot.

- **`GITHUB_TOKEN`** — **Optional, secret**. Empty. Fine-grained PAT with Contents: Read and write on the target repo. Classic PATs with `repo` scope also work.

- **`GITHUB_REPO_OWNER`** — **Optional**. Empty. GitHub user or org that owns the repo.

- **`GITHUB_REPO_NAME`** — **Optional**. Empty. Repo name only (no owner prefix).

**How sync works.** When either path is configured, the gateway installs a `post-commit` git hook on the bare repo that async-pushes every commit to origin. No scheduled sync, no batching — every commit (from `add-agent.sh`, file-browser edits, or an agent calling `save_progress`) lands on the remote within seconds. The runner also runs a `GIT_SYNC_INTERVAL`-second backup sweep that commits dirty worktrees and fast-forwards any branches that moved on the remote.

Without a remote, all of this still works locally — commits just don't leave the gateway's volume.

### 2.8 Runtime tuning

Control loops in the dispatcher and runner daemons. Defaults are sensible; override only when instrumenting or tuning latency.

- **`POLL_INTERVAL`** — **Optional**. Default `30`. Seconds between command-queue polls by the runner. Lower for faster command pickup at the cost of more Supabase requests.

- **`COMMAND_TIMEOUT`** — **Optional**. Default `120`. Seconds a single command can run before the runner kills it and marks it failed.

- **`RECONCILE_INTERVAL`** — **Optional**. Default `60`. Seconds between dispatcher reconciliation passes (checking for orphaned inbox items, stale leases, etc.).

- **`WAKE_COOLDOWN`** — **Optional**. Default `30`. Seconds the dispatcher waits before re-waking an agent that just failed.

- **`GIT_SYNC_INTERVAL`** — **Optional**. Default `1800` (30 min). Seconds between backup-sweep passes in the runner (commits dirty worktrees, fast-forwards branches that moved on the remote). Set to `0` to disable the sweep entirely — event-driven commits and the post-commit auto-push still work.

### 2.9 Image overrides

Pin specific image tags for reproducible production deploys. All four default to `:latest`.

- **`UI_IMAGE`** — **Optional**. Default `ghcr.io/yourhq/yourhq-ui:latest`.
- **`GATEWAY_IMAGE`** — **Optional**. Default `ghcr.io/yourhq/yourhq-gateway:latest`.
- **`DISPATCHER_IMAGE`** — **Optional**. Default `ghcr.io/yourhq/yourhq-dispatcher:latest`.
- **`RUNNER_IMAGE`** — **Optional**. Default `ghcr.io/yourhq/yourhq-runner:latest`.

Override to `ghcr.io/yourhq/yourhq-<svc>:2026.04.20` (or similar date-pinned tag) for production. Don't pin in dev — you want to track `:latest`.

### 2.10 Codespaces / reverse-proxy origin allowlist

Next.js enforces an origin allowlist on server actions and form submissions. When the UI is fronted by a reverse proxy or GitHub Codespaces port-forward, the apparent origin differs from `localhost:3000` and requests get rejected as CSRF. These variables extend the allowlist.

- **`CODESPACE_NAME`** — **Auto-set** by GitHub Codespaces. Don't set manually.

- **`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`** — **Auto-set** by GitHub Codespaces. Don't set manually. Combined with `CODESPACE_NAME` by the UI to whitelist the forwarded URL.

- **`ALLOWED_ORIGINS`** — **Optional**. Empty. Comma-separated list of extra origins to allow (e.g. `https://hq.example.com,https://staging.example.com`). Set this when running behind any non-Codespaces reverse proxy with a public domain.

---

## 3. Runtime vs build-time — the `NEXT_PUBLIC_*` gotcha

Next.js inlines every `NEXT_PUBLIC_*` variable into the client-side JS at build time. Once the UI image is built, those values are frozen in the bundle. You cannot change them by editing `.env` and restarting — the container starts the same pre-built bundle.

In this stack, two variables are build-time:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The `docker-compose.yml` wires both as build args *and* runtime env:

```yaml
ui:
  build:
    args:
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL}}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
```

The runtime env is there for completeness (server-side Next.js code can still read it) but the browser bundle only sees the build-arg version.

**Why the installer builds UI locally instead of always pulling.** The prebuilt GHCR image was compiled against *somebody else's* Supabase project. If you pulled it and ran it, the browser bundle would try to connect to a Supabase instance you don't own. The installer runs `docker compose pull || build`, and when the pulled image is stamped with placeholder Supabase URLs, you have to rebuild locally to bake in yours. (In practice: the first run after editing Supabase creds needs `docker compose build ui`.)

**The practical rule:** whenever you change `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, you must rebuild the UI image:

```bash
docker compose build --no-cache ui && docker compose up -d ui
```

Not `restart`, not `up -d` alone — `build --no-cache` first.

---

## 4. Secrets handling

Every secret lives in plaintext in `.env` on disk. The installer `chmod 600` the file, which is the only layer of protection. Don't commit `.env`, don't paste it into issues, don't ship it in backups unencrypted.

If one of these leaks:

- **`SUPABASE_SERVICE_ROLE_KEY`** — bypasses RLS and can read/write every row. **High severity.** Rotate in Supabase dashboard (Project Settings → API → "Generate new service_role key"). Update `.env`, then `docker compose up -d` to restart every service. Audit `audit_log` for suspicious activity.

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** — subject to RLS, so damage is bounded by your policies. Still rotate in the Supabase dashboard. Update `.env`, then `docker compose build --no-cache ui && docker compose up -d ui` (build-time — a plain restart won't pick it up).

- **`GATEWAY_AUTH_TOKEN`** — auth between UI and files-API. Rotate by picking a new value (`openssl rand -hex 32`), writing it to `.env`, and running `docker compose up -d ui gateway` (both services must restart together so they agree on the token).

- **`GIT_DEPLOY_KEY`** — rotate in the git host (GitHub → repo settings → Deploy keys), put the new key in `.env`, then `docker compose up -d gateway`. The gateway recreates `~/.ssh/openclaw_deploy_key` if it's missing, but **it doesn't overwrite an existing one** — you may need to `docker compose exec gateway rm /home/openclaw/.ssh/openclaw_deploy_key` first.

- **`GITHUB_TOKEN`** — rotate the PAT on GitHub (or revoke it), update `.env`, then `docker compose up -d gateway` so the entrypoint rebuilds the remote URL with the new token. Existing commits stay local even if the token is revoked — they push to the new remote on the next boot.

- **`VNC_PASSWORD`** — rotate by changing the value in `.env`, then delete the existing hash: `docker compose exec gateway rm /home/openclaw/.vnc/passwd`, then `docker compose up -d gateway`.

- **`TAILSCALE_AUTH_KEY`** — **host-level, not container-level.** The stack no longer runs Tailscale inside any container. The auth key is used once by the installer to run `tailscale up` on the host. If leaked, revoke in the Tailscale admin console (Settings → Keys) and generate a new one — no container restart needed. Use single-use keys in production and reusable keys only for convenience during setup.

---

## 5. Configuring for development

`docker-compose.dev.yml` is an overlay that runs the UI in `next dev` mode with source mounted for live-reload, and mounts the gateway daemons from source so edits take effect on restart (no rebuild). Usage:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

**No environment variables change between production and development** — the dev overlay only changes volume mounts, commands, and the UI image (`node:24-slim` instead of the prebuilt UI image). Your `.env` works as-is. In particular, `NEXT_PUBLIC_SUPABASE_*` still need to be correct, but in dev they're picked up at `next dev` startup rather than baked in — so editing `.env` and restarting the `ui` service *does* pick them up in dev mode.

---

## 6. First-boot setup (non-env configuration)

A lot of yourhq's configuration is runtime-configurable via the UI, not via environment variables. Once the stack is up and you've logged in, visit:

- **`/setup`** — the six-step workspace setup wizard. Seeds `workspace` (name, slug, owner profile), `pipeline_stages`, `field_definitions`, and initial `streams` in one RPC call. New workspaces are redirected here automatically until `workspace.initialized = true`.

- **`/dashboard/settings`** — add or edit pipeline stages, custom field definitions, streams, automations, and agent identities after the initial setup. Most per-workspace behavior lives here, not in `.env`.

- **`/dashboard/agents`** — the agent creation wizard (three steps: template → identity → Telegram). See `docs/AGENTS.md` for agent-specific configuration (each agent has its own `agent.json` committed to its git branch).

Rule of thumb: if it varies between workspaces of the same deployment, it's probably in the DB and configured in the UI. If it's infrastructure-level (where Supabase lives, how the host is networked, which git remote to back up to), it's in `.env`.

---

## 7. Changing configuration after install

Edit `.env`, then run the appropriate Compose command to pick up the change. The right command depends on which service owns the variable and whether it's build-time or runtime.

### UI runtime variables (non-`NEXT_PUBLIC_*`)

`SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_URL`, `GATEWAY_AUTH_TOKEN`, `ALLOWED_ORIGINS`:

```bash
docker compose up -d ui
```

### UI build-time variables (`NEXT_PUBLIC_*`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`:

```bash
docker compose build --no-cache ui && docker compose up -d ui
```

A plain `up -d` is **not** enough — the old image has the old values baked in.

### Gateway variables

`TEMPLATES_SOURCE`, `GIT_REMOTE_URL`, `GIT_DEPLOY_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GATEWAY_AUTH_TOKEN`, `FILES_API_BIND`, `FILES_API_PORT`, `NOVNC_BIND`, `VNC_PASSWORD`, `NETWORKING_MODE`, `HOST_REACHABLE_URL`:

```bash
docker compose up -d gateway
```

Note: `TEMPLATES_SOURCE` is only read on *first boot* when the bare repo is seeded. Changing it later has no effect unless you also wipe the `gateway-state` volume (destructive — you lose all agent branches).

### Dispatcher / runner variables

`POLL_INTERVAL`, `COMMAND_TIMEOUT`, `RECONCILE_INTERVAL`, `WAKE_COOLDOWN`:

```bash
docker compose up -d dispatcher runner
```

### Networking / port-binding changes

`UI_HOST_PORT`, `NOVNC_HOST_PORT`, `FILES_API_HOST_PORT` — changing a port binding doesn't register with a plain `up -d`; Compose considers the container "already running" with no relevant change. Force recreation:

```bash
docker compose up -d --force-recreate
```

### Compose project / gateway identity

`COMPOSE_PROJECT`, `GATEWAY_ID` — changing either creates *new* containers and (for `COMPOSE_PROJECT`) *new* volumes. Your old stack's state is orphaned but not deleted. Only change these when you actually want a fresh namespace; otherwise the safer path is to leave them alone.

### Image overrides

`UI_IMAGE`, `GATEWAY_IMAGE`, `DISPATCHER_IMAGE`, `RUNNER_IMAGE`:

```bash
docker compose pull && docker compose up -d
```

### Supabase keys — the whole stack

Changing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` affects every service. Rebuild the UI (because of the linked `NEXT_PUBLIC_*` defaults) and restart everything:

```bash
docker compose build --no-cache ui
docker compose up -d
```

---

## Troubleshooting checklist

- **"The UI loads but login fails"** — your `NEXT_PUBLIC_SUPABASE_*` got out of sync with the server-side values. Rebuild `ui` (section 3).
- **"File browser says 401 / auth error"** — `GATEWAY_AUTH_TOKEN` differs between UI and gateway, or is empty. Set it identically in `.env` and run `docker compose up -d ui gateway`.
- **"Changed the port but the old one still works"** — port bindings need `--force-recreate` (section 7).
- **"Changed `TEMPLATES_SOURCE` but I still see old templates"** — it's only read on first boot. See section 2.5.
- **"Gateway keeps trying to reach the wrong URL"** — `HOST_REACHABLE_URL` is written into Supabase by the gateway at startup; fix `.env` and restart the gateway, not the UI.
