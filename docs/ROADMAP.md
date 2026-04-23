# Roadmap

This doc captures the phased delivery plan for HQ. The full planning doc lives internally; this is the public-facing summary.

## Phase 1 — Foundations (✅ shipped)

The monorepo, Docker stack, and installer.

- One repo (`yourhq/yourhq`) for UI, gateway, dispatcher, runner, templates, migrations
- `docker-compose.yml` stack with four services
- Interactive `installer/install.sh` — three networking modes (local / Tailscale / public)
- Gateway runtime: OpenClaw + Chrome + Xtigervnc + XFCE + noVNC
- Agent templates bundled into the image
- Multi-arch GHCR builds (amd64 + arm64) via GitHub Actions
- Multi-gateway support at the database level (`gateways` table, `gateway_id` FK on agents)
- File browser via the gateway files-API
- Codex OAuth flow
- Tailscale lives on the host, not in containers

## Phase 2 — Multi-project UI + config-less first boot (🔄 next)

The UI image should boot with zero user config and walk the user through connecting their first Supabase project in-app, instead of requiring them to bake values into `.env` before starting.

This bundles two improvements that touch the same code:

- **Project registry** — one UI manages N Supabase projects. Registry stored in `/config/projects.json` on a mounted volume. Switcher in the sidebar.
- **Runtime Supabase config** — Supabase creds move out of `NEXT_PUBLIC_*` build-time and into runtime config served by the UI's own `/api/config` endpoint. The published UI image works for anyone without a rebuild.
- **Onboarding screen** — empty registry is the valid first-boot state. UI shows "Connect your first Supabase project" → paste URL + anon key + service key → validate → save → reload.
- **File browser abstraction** — selects between GitHub backend (per-project token) and gateway backend (files-API) based on project config.
- **Per-project GitHub config** — tokens move out of env into the project registry.

After Phase 2: `curl install.yourhq.ai | bash` gives you a working UI with no Supabase config needed. Everything else happens in the browser.

## Phase 3 — UI-driven gateway management (⏳ planned)

Everything you'd do in a terminal becomes a UI action.

- **Connections** — generic UI for adding any openclaw provider's auth (Codex OAuth, Anthropic API key, Gemini, etc.). Uses a two-way `agent_commands` interactive pattern: runner captures the provider's URL output, writes it to the command row, UI displays it, user pastes the redirect/key back, runner completes the flow.
- **Add Gateway from UI** — Settings → Gateways → Add. UI mints a single-use token, shows a one-liner `curl | bash` with the token embedded. User runs it on the new host. Gateway boots, registers itself, appears in UI.
- **Update from UI** — per-gateway "Update" button runs `docker compose pull && docker compose up -d` via the runner.
- **Project management UI** — add/edit/delete Supabase projects with validation.
- **Templates source UI** — switch between bundled templates and a custom git URL per project.
- **Observability** — log tails, command history, inbox history, heartbeat history in the UI.
- **Open Desktop modal** — noVNC iframe wrapped in the UI with signed session tokens, fullscreen toggle, clipboard sync.
- **Pretty tailnet URLs via Tailscale Serve** — installer offers `http://hq` (port 80, no port suffix) via `tailscale serve` when you pick Tailscale mode.
- **Public access via Cloudflare Tunnel** — optional wizard for users who want a custom domain without opening host ports. Zero open ports on the host, DDoS protection, optional Cloudflare Access.

After Phase 3: a user only ever touches the terminal for the initial one-liner install.

## Phase 4 — Hosted offering (⏳ separate track)

`yourhq.ai` signup flow for users who don't want to self-host. This is a business-layer addition, not a product change — the self-hosted code stays the same.

- Account management service (landing page + signup + billing)
- Automated Supabase project provisioning per tenant
- Automated gateway provisioning on our hosts
- Registry source swap: hosted UI reads project registry from account DB instead of `/config/projects.json`

Ships when there's demand.

## Longer-term ideas (not scheduled)

- Per-agent view in the Open Desktop modal (pause / takeover / resume)
- Agent-to-agent workflows (one agent's output triggers another)
- Native apps (macOS menu bar, iOS Shortcuts integration)
- Marketplace for community templates
- MCP-first integrations (replace direct plugins with MCP servers where possible)

## How to influence the roadmap

- Open issues labeled `feature-request` with a clear use case
- Start discussions in `github.com/yourhq/yourhq/discussions`
- Send PRs for things in Phase 1-3 scope — we'll triage and merge
- For things outside the phases, propose in an issue first — we may push back, may be enthusiastic
