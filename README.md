<div align="center">

# HQ

### Self-hostable agent operations platform

One UI, many AI agents, your infrastructure.

[Website](https://yourhq.ai) · [Install](#install) · [Docs](docs/) · [Roadmap](#roadmap)

</div>

---

HQ is a self-hosted dashboard for running AI agents that do real work on your behalf: drafting outreach, managing contacts, handling tasks, browsing the web, talking over Telegram, coordinating with each other, and keeping durable memory in their own workspaces. Your Supabase, your Docker hosts, your agents.

No vendor lock-in. No per-seat pricing. No data leaving your infrastructure.

## Why HQ

- **Your data stays yours.** Supabase is the only backend, and it's your Supabase. HQ has no cloud.
- **Run anywhere Docker runs.** Laptop, Raspberry Pi, Mac mini, VPS, EC2 — same code, same experience.
- **One UI, many gateways.** Run the UI on your laptop, gateways anywhere. Agents provision on the host you pick.
- **Agents are real programs**, not chat wrappers. They browse, send messages, edit files, call APIs — with real memory across sessions.
- **Operational workspace included.** CRM, tasks, docs, assets, automations, activity, notifications, usage budgets, and gateway management live in one UI.
- **Template library included.** Cofounder, designer, analyst, CMO, newsletter editor, and more — starting points you customize in-place.

## Install

### One-line install

On any Linux/macOS host with Docker:

```bash
curl -fsSL install.yourhq.ai | bash
```

The installer:
1. Installs Docker if missing (Linux)
2. Picks your networking mode (local / Tailscale / public)
3. Runs `docker compose up -d`
4. Opens your browser to `http://localhost:3000`

Then in the browser: paste your Supabase URL + keys in the onboarding screen, sign in, done. The gateway auto-picks up your creds in the background — no second terminal step. Takes about 5 minutes on a fresh machine.

### Prerequisites

- Docker (installer can install it for you on Linux)
- A Supabase project — [create a free one](https://supabase.com), then run the SQL migrations in [`db/migrations/`](db/migrations/) in order. You paste the URL + keys into the UI once it's up.

### Manual install

Prefer to inspect the code first?

```bash
git clone https://github.com/yourhq/yourhq.git
cd yourhq
cp .env.example .env  # leave Supabase empty to set up in the browser
docker compose up -d ui
```

See [docs/INSTALL.md](docs/INSTALL.md) for every install path in detail.

## Screenshots

_Coming soon — see [yourhq.ai](https://yourhq.ai) for screenshots and demo._

## Architecture

```
                     ┌────────────────────┐
                     │  HQ UI (Next.js)   │ ← your laptop, a VPS, anywhere
                     └──────────┬─────────┘
                                │
                                ▼
                     ┌────────────────────┐
                     │   Your Supabase    │ ← single source of truth
                     └──────────┬─────────┘
                                │
                  ┌─────────────┼─────────────┐
                  ▼             ▼             ▼
           ┌──────────┐  ┌──────────┐  ┌──────────┐
           │ Gateway  │  │ Gateway  │  │ Gateway  │  ← run agents here
           │  (VPS)   │  │ (Mac mini)│ │  (Pi)    │
           └──────────┘  └──────────┘  └──────────┘
```

Each gateway host runs:
- **OpenClaw** — the agent runtime
- **Chrome + noVNC** — a full desktop with a browser each agent can drive
- **Python daemons** — wake agents when there's new work; execute lifecycle commands
- **Files API** — lets the UI read and edit agent worktree files safely

Agents get their own git branch, their own Chrome profile, and a shared workspace. No two agents stomp on each other.

Read the full breakdown in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What agents can do

Out of the box, agents have access to:

- **Web browsing** — a dedicated Chrome profile they can drive autonomously
- **Your workspace** — contacts, organizations, tasks, interactions, documents, assets
- **Telegram** — each agent gets its own bot
- **Provider connections** — OpenAI, Anthropic, Gemini, local OpenAI-compatible servers, and other OpenClaw-supported providers
- **Calendar, email, Slack, Notion** — via MCP or custom plugins

They have persistent memory across sessions, can report to and delegate to each other, can be governed by monthly usage budgets, and can write their own workflow improvements back to files.

See [docs/FEATURES.md](docs/FEATURES.md) for the product tour and [docs/AGENTS.md](docs/AGENTS.md) for the agent model and custom templates.

## Deploying

HQ scales up as your needs grow, without re-architecting anything:

| Setup | How |
|---|---|
| **Laptop only** | `curl install.yourhq.ai \| bash`, pick local-only |
| **Laptop + remote gateway** | Local install, then run the gateway installer on another host |
| **Multi-gateway** | Any number of gateways, each on its own host, all point at the same Supabase |
| **Fully cloud** | UI on one VPS, gateways on others |

All of these use the same installer and the same Docker images. The only difference is where Docker is running.

See [docs/NETWORKING.md](docs/NETWORKING.md) for deployment topologies.

## Current status

HQ already includes the self-hosted stack, browser onboarding, multi-project registry, UI-driven gateway registration, provider connections, noVNC desktop access, agent templates, CRM, tasks, documents, automations, agent usage budgets, and agent reporting hierarchy.

The remaining roadmap is mostly hardening, polish, hosted deployment, and deeper integrations. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a dev environment and open a PR.

Most PR-friendly areas:
- **Agent templates** — add a new role (`templates/<name>/`) and we merge it
- **UI pages** — Next.js + Tailwind + shadcn, familiar stack
- **Gateway integrations** — MCP plugins, OpenClaw plugins

## Community & support

- **Issues**: [github.com/yourhq/yourhq/issues](https://github.com/yourhq/yourhq/issues)
- **Discussions**: [github.com/yourhq/yourhq/discussions](https://github.com/yourhq/yourhq/discussions)
- **Security reports**: see [SECURITY.md](SECURITY.md) (don't file public issues for security)

## License

Apache 2.0 — see [LICENSE](LICENSE).

You can run HQ for yourself, for your company, for your clients. You can modify it and ship your modifications. You just can't claim we endorsed your fork.

---

Built on [Next.js](https://nextjs.org), [Supabase](https://supabase.com), [OpenClaw](https://openclaw.ai), and [noVNC](https://novnc.com). Agents are real; marketing copy is not.
