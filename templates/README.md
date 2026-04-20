# Agent templates

Each subdirectory here is an agent template — a starting point that gets copied into a new agent's workspace branch when the user picks "Create agent from template" in the HQ UI.

## Layout

```
templates/
├── default/              # Base template. Every new agent starts from this
│                         # unless a different template is selected.
├── cofounder/
├── designer/
├── ...
└── README.md             # This file.
```

## What's in a template

At minimum:

- `agent.json` — manifest. Contains placeholder tokens like `AGENT_SLUG_HERE`, `TEAM_HERE`, and `TELEGRAM_TOKEN_AGENT_SLUG_HERE` that the agent-create wizard substitutes when creating an agent from this template.
- `IDENTITY.md`, `SOUL.md`, `HEARTBEAT.md`, `USER.md` — personality and memory scaffolding.
- `AGENTS.md`, `TOOLS.md`, `MEMORY.md` — operational docs the agent reads to understand its own role.
- `skills/hq/` — the Supabase-backed integration scripts (`hq_*.py`) every agent needs.
- `scripts/` — per-agent helpers.

Typical workflow for adding a template:

1. Copy `default/` to `your-template-name/`.
2. Edit `agent.json` to set `team` and any template-specific defaults.
3. Edit `IDENTITY.md`, `SOUL.md`, and any other files to capture the template's personality/role.
4. Leave `AGENT_SLUG_HERE` placeholders untouched — the wizard fills those in at provision time.
5. Open a PR.

## How templates end up on a gateway

On first boot, the gateway container seeds each template directory here into its local bare git repo as a branch called `template/<dirname>`. After that, the local repo is the source of truth for per-agent branches.

If `TEMPLATES_SOURCE=git+<url>` is set on the gateway, it clones that repo's `templates/` directory instead of using the bundled copy. This is how advanced users run their own template library without forking the whole platform.

## What *not* to put here

- Per-user content (that lives in per-agent branches on the gateway's local repo, not here).
- Credentials or API keys (templates are public; secrets are env-var-driven on the gateway).
- Host-specific config (templates should be portable across any gateway).
