# Installation

Every install path, in detail.

## TL;DR

On any Linux or macOS host with Docker:

```bash
curl -fsSL install.yourhq.ai | bash
```

Answers four prompts, runs `docker compose up -d`, opens your browser. Takes about 5 minutes.

The rest of this doc covers prerequisites, the different install paths, and how to deploy across multiple machines.

## Prerequisites

### Docker

- **Linux**: the installer auto-installs Docker for you via `get.docker.com` if it's missing.
- **macOS**: [download Docker Desktop](https://docs.docker.com/desktop/install/mac-install/) first.
- **Windows**: install [WSL2](https://learn.microsoft.com/windows/wsl/install) + [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/), then run the installer from a WSL shell.

### Supabase

You need a Supabase project before running the installer.

1. Sign up at [supabase.com](https://supabase.com) (free tier is fine for personal use).
2. Create a new project. Wait ~2 minutes for provisioning.
3. Open SQL Editor, paste the full contents of [`db/migrations/001_schema.sql`](../db/migrations/001_schema.sql), hit Run.
4. Go to Authentication → Users → Add user (check "Auto Confirm User"). Remember the email/password.
5. Go to Project Settings → API. Copy three values:
   - Project URL
   - Anon public key
   - Service role key (the secret one)

### (Optional) Tailscale

If you plan to access HQ from a second device (phone, laptop, another machine), sign up for [Tailscale](https://tailscale.com) before installing. Generate a reusable auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys) and paste it when the installer asks.

## Paths

### Path 1: one-line install (recommended for most users)

```bash
curl -fsSL install.yourhq.ai | bash
```

The installer:

1. Checks that Docker is present; prompts to install it if not (Linux only).
2. Prompts for Supabase URL, anon key, service role key, workspace slug.
3. Asks which networking mode you want:
   - **Local-only** (default) — HQ is reachable only on this machine.
   - **Tailscale** — installs Tailscale on the host; reachable from any device on your tailnet.
   - **Public HTTPS** — advanced; requires you to set up a reverse proxy (Caddy, nginx, etc.) yourself. HQ does not bundle one.
4. If you pick Tailscale, asks for your auth key and optionally an exit node.
5. Writes `.env`, pulls images from GHCR, runs `docker compose up -d`.
6. Opens your browser to `http://localhost:3000`.

On a fresh machine: about 5 minutes. Most of that is image pulls.

### Path 2: clone and run (recommended for developers)

```bash
git clone https://github.com/yourhq/yourhq.git
cd yourhq
cp .env.example .env
# edit .env with your Supabase URL + keys, set GATEWAY_AUTH_TOKEN=$(openssl rand -hex 32)
docker compose up -d
```

Same outcome as Path 1 without the interactive prompts. Best when you already have Tailscale set up and don't need the installer to do it for you.

### Path 3: development mode

For contributors — live-reload the UI as you edit source:

```bash
git clone https://github.com/yourhq/yourhq.git
cd yourhq
cp .env.example .env
# edit .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

UI reloads on file changes under `apps/ui/`. See [docs/DEVELOPMENT.md](DEVELOPMENT.md) for full dev setup.

## After install

1. Open `http://localhost:3000` in your browser.
2. Log in with the Supabase auth user you created.
3. Complete the setup wizard (workspace name, pipeline stages, custom fields, task streams).
4. Authenticate at least one model provider:
   ```bash
   docker compose exec gateway openclaw models auth login --provider openai-codex --set-default
   ```
   Paste the URL into a browser, sign in, paste the redirect URL back. (Phase 3 moves this into the UI.)
5. Create your first agent: Agents → New Agent → pick a template → name → Telegram bot token from [BotFather](https://t.me/botfather) → Create.
6. Send your bot a message on Telegram. It'll reply with a pairing code; paste that into the UI's Pair Telegram field. Next message triggers the agent.

## Multi-machine setups

### Splitting UI and gateway across machines

Phase 1 has manual multi-gateway support. Phase 3 adds a UI-driven "Add Gateway" flow.

Today's process:

1. On the UI host: run the installer normally (Tailscale mode recommended).
2. On the gateway host: clone the repo, copy `.env`, and set:
   - A unique `GATEWAY_ID` (e.g. `mac-mini`, `vps-eu`)
   - The same `SUPABASE_URL` + keys as the UI host
   - `GATEWAY_AUTH_TOKEN` matching the UI's
3. On the gateway host: install Tailscale and join the same tailnet as the UI host.
4. Set `HOST_REACHABLE_URL=http://<gateway-host-tailscale-ip>` in the gateway's `.env`.
5. `docker compose up -d gateway dispatcher runner` (skip `ui`).
6. The gateway registers itself in Supabase's `gateways` table. The UI sees it within 30 seconds.

See [docs/NETWORKING.md](NETWORKING.md) for the networking model and topology diagrams.

## Troubleshooting install

- **"Docker is not installed"** on macOS/Windows: install Docker Desktop (GUI app), not the Linux installer.
- **"Internal Server Error" on the UI** after install: `NEXT_PUBLIC_SUPABASE_*` weren't set when the image was built. Run `docker compose build --no-cache ui` then `docker compose up -d ui`.
- **"Pull access denied" on GHCR**: only relevant if the repo is private. `docker login ghcr.io -u <your-gh-user>` with a PAT that has `read:packages` scope.
- **`docker compose up` fails with "port already in use"**: something else is on port 3000 or 6901 on your host. Change `UI_HOST_PORT` / `NOVNC_HOST_PORT` in `.env`.
- **Setup wizard 500s on "Complete setup"**: CSRF origin mismatch. Set `ALLOWED_ORIGINS` in `.env` to match the host you're accessing from. Restart the UI.
- **UI loads but login fails**: wrong Supabase creds or user doesn't exist. Re-check `.env`, re-create the user in Supabase.

See [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more.

## Updating

```bash
cd ~/.yourhq  # or wherever you installed
git pull       # if you cloned
docker compose pull
docker compose up -d
```

For UI image rebuilds (NEXT_PUBLIC changes, dependency updates):

```bash
docker compose build --no-cache ui
docker compose up -d ui
```

## Uninstalling

```bash
cd ~/.yourhq
docker compose down -v    # DELETES volumes — all agent state gone
cd ..
rm -rf .yourhq
```

Also: go to your Supabase dashboard and delete the project.
