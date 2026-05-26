<div align="center">

# HQ

### Self-hostable agent operations platform

One UI, many AI agents, your infrastructure.

[Website](https://yourhq.ai) · [Install](#install) · [Docs](https://docs.yourhq.ai) · [Why HQ](https://docs.yourhq.ai/concepts/why-hq) · [Roadmap](https://docs.yourhq.ai/getting-started/roadmap)

[![CI](https://img.shields.io/github/actions/workflow/status/yourhq/yourhq/ci.yml?branch=main&label=CI)](https://github.com/yourhq/yourhq/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/yourhq/yourhq?include_prereleases&label=release&sort=semver)](https://github.com/yourhq/yourhq/releases)
[![License](https://img.shields.io/github/license/yourhq/yourhq)](LICENSE)
[![Discussions](https://img.shields.io/github/discussions/yourhq/yourhq)](https://github.com/yourhq/yourhq/discussions)

</div>

<p align="center">
  <video src="https://github.com/yourhq/yourhq/raw/main/docs-site/images/demo.mp4" width="800" autoplay loop muted playsinline>
    Your browser doesn't support video — <a href="docs-site/images/demo.mp4">download the demo</a>.
  </video>
</p>

---

HQ is a self-hosted dashboard for running AI agents that do real work on your behalf: drafting outreach, managing contacts, handling tasks, browsing the web, talking over Telegram, Discord, or Slack, coordinating with each other, and keeping durable memory in their own workspaces. Your Supabase, your Docker hosts, your agents.

No vendor lock-in. No per-seat pricing. No data leaving your infrastructure.

## Why HQ

- **Your data stays yours.** Supabase is the only backend, and it's your Supabase. HQ has no cloud.
- **Run anywhere Docker runs.** Laptop, Raspberry Pi, Mac mini, VPS, EC2 — same code, same experience.
- **One UI, many gateways.** Run the UI on your laptop, gateways anywhere. Agents provision on the host you pick.
- **Agents are real programs**, not chat wrappers. They browse, send messages, edit files, call APIs — with real memory across sessions.
- **Operational workspace included.** CRM, tasks, knowledge base, collections, routines, inbox, activity, notifications, usage budgets, and gateway management live in one UI.
- **Template library included.** 16 templates — cofounder, designer, analytics, CMO, ghostwriter, newsletter editor, and more — starting points you customize in-place.

## How HQ compares

| | HQ | CrewAI | OpenAI Agents SDK | n8n |
|---|---|---|---|---|
| Shape | Self-hosted product (UI + workspace + agent fleet) | Python framework | Python SDK (OpenAI-only) | Workflow automation tool |
| Agents | Long-lived, persistent, on your infra | Ephemeral crews in your process | Ephemeral runs via API | Steps inside a workflow |
| Workspace included | CRM, tasks, knowledge, routines, budgets | No (you build it) | No (you build it) | No (rich integrations) |
| Self-hosted | Yes (BYO Supabase) | Library — runs wherever | API-dependent | Yes |
| License | Apache 2.0 | Enterprise License | MIT | Sustainable Use |

If you want a *framework* to build a multi-agent app in code, use CrewAI or OpenAI's SDK. If you want a workflow builder for SaaS automation, use n8n. If you want a workspace your team logs into to run a fleet of long-lived agents on your infrastructure, that's HQ. Long version: [Why HQ](https://docs.yourhq.ai/concepts/why-hq).

## Install

### One-line install

On any Linux/macOS host with Docker:

```bash
curl -fsSL install.yourhq.ai | bash
```

The installer:
1. Installs Docker if missing (Linux)
2. Optionally configures GitHub sync for agent file backup
3. Starts the UI container (`docker compose up -d ui`)
4. Opens your browser to `http://localhost:3000`

Then in the browser: paste your Supabase URL + keys in the onboarding screen, sign in, and the wizard walks you through connecting a gateway (on the same machine or a remote host). Takes about 5 minutes on a fresh machine.

### Prerequisites

- Docker (installer can install it for you on Linux)
- A Supabase project — [create a free one](https://supabase.com). You paste the URL + keys into the UI once it's up; migrations run automatically during onboarding.

### Manual install

Prefer to inspect the code first?

```bash
git clone https://github.com/yourhq/yourhq.git
cd yourhq
cp .env.example .env  # leave Supabase empty to set up in the browser
docker compose up -d ui
```

See [the installation docs](https://docs.yourhq.ai/self-host/installation) for every install path in detail.

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

Each gateway host runs six services:
- **Gateway** — OpenClaw agent runtime, Chrome, XFCE desktop, noVNC, and the files API
- **Dispatcher** — wakes agents when new inbox work arrives
- **Runner** — executes lifecycle commands (provision, update, remove, auth)
- **Embedder** — indexes knowledge items into searchable chunks
- **File processor** — extracts text from uploaded files (PDF, DOCX, XLSX, etc.)
- Plus the **UI** on whatever host you choose

Agents get their own git branch, their own Chrome profile, and a shared workspace. No two agents stomp on each other.

Read the full breakdown in [the architecture docs](https://docs.yourhq.ai/concepts/architecture).

## Project structure

```
apps/ui/         Next.js dashboard (App Router, Tailwind, shadcn)
apps/migrate/    Database migration runner CLI
gateway/         Gateway image, files API, daemons, lifecycle scripts
templates/       Agent template library (16 templates)
db/migrations/   Supabase SQL migrations (001–037)
installer/       Interactive install scripts (install.sh + install-gateway.sh)
docs-site/       Documentation source (docs.yourhq.ai)
scripts/         Operational scripts (diagnostic bundle)
```

See [the repo structure docs](https://docs.yourhq.ai/development/repo-structure) for details.

## What agents can do

Out of the box, agents have access to:

- **Web browsing** — a dedicated Chrome profile they can drive autonomously
- **Your workspace** — contacts, organizations, tasks, interactions, knowledge items, collections
- **Messaging channels** — Telegram, Discord, or Slack — each agent gets its own channel binding
- **Model-agnostic** — any provider: OpenAI, Anthropic, Gemini, Ollama, and many others via OpenClaw
- **Calendar, email, Slack, Notion** — via MCP or custom plugins

They have persistent memory across sessions, can report to and delegate to each other, can be governed by monthly usage budgets, and can write their own workflow improvements back to files.

See [the feature tour](https://docs.yourhq.ai/concepts/features) and [agent docs](https://docs.yourhq.ai/concepts/agents) for the agent model and custom templates.

## Deploying

HQ scales up as your needs grow, without re-architecting anything:

| Setup | How |
|---|---|
| **Laptop only** | `curl install.yourhq.ai \| bash`, pick local-only |
| **Laptop + remote gateway** | Local install, then run the gateway installer on another host |
| **Multi-gateway** | Any number of gateways, each on its own host, all point at the same Supabase |
| **Fully cloud** | UI on one VPS, gateways on others |

All of these use the same installer and the same Docker images. The only difference is where Docker is running.

See [the networking docs](https://docs.yourhq.ai/self-host/networking) for deployment topologies.

## Current status

HQ is in active development at v0.1. The self-hosted stack, hosted offering at [app.yourhq.ai](https://app.yourhq.ai), and full operational workspace (CRM, tasks, knowledge, collections, routines, agent management, usage budgets, encrypted secrets, plugin system, and source connections) are all shipped and in use.

Next up: more source connectors (Google Drive, Gmail), test coverage hardening, deeper OpenClaw integration, and agent-to-agent workflows. See [the roadmap](https://docs.yourhq.ai/getting-started/roadmap).

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

