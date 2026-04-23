# Development

Setting up a local development environment for HQ.

## Prerequisites

- Docker + Docker Compose
- Node.js 24 (UI)
- Git
- A Supabase project for testing (a free one is fine)

On macOS: `brew install node@24 docker` (or install Docker Desktop).
On Ubuntu: `curl -fsSL https://get.docker.com | sudo sh` and install Node from nodesource.

## Clone and setup

```bash
git clone https://github.com/yourhq/yourhq.git
cd yourhq
cp .env.example .env
```

Fill in `.env`:

- `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key from Supabase → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — service role key from the same page
- `WORKSPACE_SLUG` — any slug, e.g. `dev`
- `GATEWAY_AUTH_TOKEN` — generate with `openssl rand -hex 32`

Run the migration in your Supabase project:

1. Open Supabase Studio → SQL Editor
2. Paste `db/migrations/001_schema.sql`
3. Run

Create an auth user: Supabase → Authentication → Users → Add user (check "Auto Confirm User").

## Run the stack in dev mode

Live-reload overlay mounts source directories so changes pick up without rebuilding:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- UI at `http://localhost:3000`
- Gateway's noVNC at `http://localhost:6901/vnc.html`
- Logs stream to stdout

Changes under `apps/ui/` reload automatically. Changes to `gateway/entrypoint.sh` or the daemons require a restart:

```bash
docker compose restart gateway dispatcher runner
```

## Working on just the UI

If you only touch UI code and don't need a gateway, run Next.js directly:

```bash
cd apps/ui
npm install --legacy-peer-deps
npm run dev
```

Create `apps/ui/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GATEWAY_AUTH_TOKEN=...
```

Pages that depend on a gateway will error — expected.

## Working on just the gateway

```bash
docker compose up -d gateway dispatcher runner
docker compose logs -f gateway
```

UI won't be running, so you drive the gateway via direct Supabase inserts or `docker compose exec`.

## Project structure

```
yourhq/
├── apps/ui/                    # Next.js app
│   ├── src/app/                # App Router pages + server actions
│   ├── src/components/         # React components (shadcn-based)
│   ├── src/hooks/              # Custom hooks
│   ├── src/lib/                # Supabase clients, types, utilities
│   ├── src/middleware.ts       # Auth guard
│   └── scripts/                # Build-time template index generator
├── gateway/
│   ├── Dockerfile              # Gateway image
│   ├── entrypoint.sh           # Container boot sequence
│   ├── files_api.py            # Files-API (Python stdlib HTTP server)
│   ├── daemons/                # inbox_dispatcher.py, command_runner.py
│   ├── dispatcher/Dockerfile
│   ├── runner/Dockerfile
│   ├── scripts/                # Shell helpers (add-agent.sh, etc.)
│   └── xfce-defaults/          # XFCE theme XMLs
├── templates/                  # Agent templates (one dir each)
├── db/migrations/              # Single schema migration
├── installer/install.sh        # The curl | bash target
├── docker-compose.yml          # Production stack
├── docker-compose.dev.yml      # Live-reload overlay
└── .github/workflows/          # CI and image publishing
```

## Common tasks

### Rebuild the UI image after a dependency change

```bash
docker compose build --no-cache ui
docker compose up -d ui
```

Needed when you add npm packages or change `NEXT_PUBLIC_*` env vars.

### Reset the gateway state

```bash
docker compose down -v  # DELETES the gateway-state volume — per-agent git branches, Chrome profile, etc.
docker compose up -d
```

Use sparingly. Better: start a fresh Supabase project + a fresh Compose project name (`COMPOSE_PROJECT=yourhq-test`) in `.env` so you don't destroy your real data.

### Add a dependency to the UI

```bash
cd apps/ui
npm install <package> --legacy-peer-deps
```

Commit `package.json` and `package-lock.json`. CI will use the lock.

### Run linting / type-checking

```bash
cd apps/ui
npx tsc --noEmit      # zero errors expected
npm run lint          # warnings ok, errors fail CI
```

### Run shellcheck

```bash
shellcheck gateway/entrypoint.sh gateway/scripts/*.sh installer/install.sh
```

Shellcheck also runs in CI (severity: warning).

## Tests

Today there's no automated test suite — CI runs typecheck + lint + shellcheck only. Contributions of test infrastructure welcome.

For manual testing, see [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) for known failure modes to verify against.

## Publishing images

CI publishes `ghcr.io/yourhq/yourhq-{ui,gateway,dispatcher,runner}:latest` on every push to `main`, and versioned tags on `v*` git tags.

To cut a release:

```bash
git tag v0.x.y
git push origin v0.x.y
```

The `docker-publish.yml` workflow's `type=semver` rule publishes `:0.x.y` tags automatically.

## Getting help

- Questions: [GitHub Discussions](https://github.com/yourhq/yourhq/discussions)
- Bugs: [GitHub Issues](https://github.com/yourhq/yourhq/issues)
- Security: see [SECURITY.md](../SECURITY.md)
