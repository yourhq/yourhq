# Agent Workspace Template

Default starting point for every OpenClaw agent branch. Fork this into a new branch to create a new agent.

## Files

| File | Purpose |
|---|---|
| `agent.json` | Deployment manifest (slug, name, description, team, model, domains, capabilities, telegram token ref, browser color) |
| `AGENTS.md` | Operating rules, startup sequence, HQ integration |
| `SOUL.md` | Personality, behavioral defaults, boundaries |
| `IDENTITY.md` | Agent identity (name, creature, vibe, emoji) — fill in on first run |
| `USER.md` | Notes about the human being helped |
| `TOOLS.md` | Environment-specific notes (SSH, cameras, etc) |
| `HEARTBEAT.md` | Periodic check instructions |
| `MEMORY.md` | Curated long-term memory |
| `memory/` | Daily memory logs, heartbeat state, usage guide |
| `history/` | Durable session writeups |
| `scripts/` | Reusable helper scripts + safety guardrails |
| `skills/hq/` | Supabase integration skill (SKILL.md + hq_* helper scripts) |

## Shared Knowledge

Shared context (product overview, conventions, playbooks) lives in **Supabase documents**, not git. Tag documents for agent targeting:

- `boot:all` — loaded by every agent at startup
- `boot:{agent-slug}` — loaded by a specific agent only
- No boot tag — available on demand via `hq_search_docs.py`

## Setup a New Agent

1. Create a new branch from this template: `git checkout -b agent-slug`
2. Edit `agent.json` with the agent's identity and team
3. Fill in `IDENTITY.md` and customize `SOUL.md`
4. Push the branch: `git push origin agent-slug`
5. On the instance: `~/add-agent.sh agent-slug --token "TELEGRAM_TOKEN"`

## Environment Variables (Instance-Level)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
EMBEDDING_API_KEY=sk-...
AGENT_SLUG=agent-slug
```

Per-agent telegram tokens are set via the env var name in `agent.json`.

## Agent Manifest Fields

`agent.json` includes:
- `slug`
- `name`
- `description`
- `team`
- `model`
- `domains`
- `capabilities`
- `telegram_token_env`
- `browser_profile_color`

Current team values in use:
- `ops`
- `strategy`
- `content`
- `design`
- `analytics`
- `research`

## Supabase Dependencies

### Tables Used
agents, tasks, streams, comments, audit_log, contacts, interactions, organizations, contact_organizations, templates, campaigns, documents, document_folders, assets, asset_folders, task_attachments, notifications, field_definitions, pipeline_stages, draft_sets

### Required Migrations
- `006_documents.sql` — documents + document_folders tables
- `007_document_embeddings.sql` — pgvector extension + embedding column
- `008_document_search_rpc.sql` — `search_documents()` Postgres function
- `009_task_attachments.sql` — task attachment join table

### Required Extension
- `vector` (pgvector) — enabled via migration 007
