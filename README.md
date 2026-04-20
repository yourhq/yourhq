# HQ

Self-hostable agent operations platform. One UI manages your projects, agents, and gateway hosts; agents live in containers you control.

Website: [yourhq.ai](https://yourhq.ai)

> **Status**: Phase 1 (monorepo + Docker stack + installer). Multi-project UI and UI-driven gateway management are Phase 2 and Phase 3.

## What this is

- **UI** — Next.js app (`apps/ui/`) where you manage contacts, tasks, agents, and everything the agents touch.
- **Gateway** — a container (`gateway/`) that runs OpenClaw + Chrome + two Python daemons. Hosts your agents and executes work.
- **Agent templates** — a library of starting points (`templates/`) for new agents (Cofounder, Designer, Analytics, etc.).
- **Supabase** — your own Supabase project. The UI and gateways both talk to it; it's the only shared state.

You can run everything on one machine, or split the UI onto a laptop and gateways onto a VPS, Mac mini, Raspberry Pi — any host that runs Docker.

## Quick start (non-technical)

You need a free Supabase project first. Create one at [supabase.com](https://supabase.com), open the SQL editor, and paste the contents of [`db/migrations/001_schema.sql`](db/migrations/001_schema.sql). Copy the URL and both keys from Settings → API.

Then, on any Linux/macOS host with Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/yourhq/yourhq/main/installer/install.sh | bash
```

The installer will ask for:

1. Your Supabase URL + anon key + service role key.
2. A networking path — Tailscale (recommended), public HTTPS, or local-only.
3. Whether to use the bundled agent templates (yes, in almost all cases).

It writes a `.env`, pulls the images, runs `docker compose up -d`, and opens `http://localhost:3000` in your browser. Complete the workspace setup wizard, pick a template, and you have your first agent.

## Quick start (technical)

```bash
git clone https://github.com/yourhq/yourhq.git
cd yourhq
cp .env.example .env
# edit .env — fill in Supabase and (optionally) Tailscale, GitHub, etc.
docker compose up -d
```

For live-reload development:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Edit any file under `apps/ui/` and the UI reloads automatically. Edit `gateway/entrypoint.sh` or `gateway/daemons/*` and restart the relevant service (`docker compose restart gateway dispatcher runner`).

## Architecture at a glance

```
┌─────────────────┐
│   UI (Next.js)  │  runs anywhere — laptop, VPS, cloud
└────────┬────────┘
         │         All coordination flows through Supabase.
         │         Nothing connects directly to the gateway.
         ▼
┌─────────────────┐
│    Supabase     │  your project
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Gateway host   │  wherever you want — Mac mini, VPS, Pi...
│   (Docker)      │
│                 │
│  ├ gateway      │  OpenClaw + Chrome + noVNC + Tailscale
│  ├ dispatcher   │  wakes agents on new inbox items
│  └ runner       │  executes lifecycle commands (add-agent, update, etc.)
└─────────────────┘
```

You can run multiple gateways against the same Supabase (each with its own `GATEWAY_ID`). Each gateway owns its own local git repo for per-agent workspaces; an optional `GIT_REMOTE_URL` lets you sync to GitHub/Gitea for backup.

## Repository layout

```
yourhq/
├── apps/ui/              # The HQ UI (Next.js).
├── gateway/              # Gateway runtime — Dockerfiles, entrypoint, daemons.
│   ├── daemons/          # inbox_dispatcher.py, command_runner.py.
│   ├── dispatcher/       # Dockerfile for the dispatcher service.
│   ├── runner/           # Dockerfile for the runner service.
│   └── scripts/          # Shell helpers (add-agent.sh, update-agent.sh, ...).
├── templates/            # Agent template library — one directory per template.
├── db/migrations/        # SQL migrations. Run 001_schema.sql first.
├── installer/            # install.sh (curl | bash target).
├── docker-compose.yml    # OSS/self-host default stack.
├── docker-compose.dev.yml# Live-reload overlay.
├── .env.example          # Every env var the stack reads.
└── README.md             # You are here.
```

## Adding a second gateway

Once the UI is up, go to Settings → Gateways → Add Gateway *(Phase 3 — not yet shipped)*. For now, the manual process is:

1. On the new host: clone this repo, `cp .env.example .env`.
2. In `.env`, set a unique `GATEWAY_ID` (e.g. `mac-mini`) and the same Supabase URL + keys.
3. `docker compose up -d gateway dispatcher runner` (skip the `ui` service).

The new gateway registers itself automatically in the `gateways` table and the UI sees it within ~30s.

## Contributing

See [`templates/README.md`](templates/README.md) for adding agent templates. Platform contributions welcome — clone, build with `docker compose -f docker-compose.dev.yml up`, iterate.

## License

TBD — see LICENSE file.
