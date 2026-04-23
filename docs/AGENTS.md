# Agents

How the agent system works, how to provision agents, and how to write custom templates.

## What an agent is

In HQ, an agent is a long-lived workspace made of:

- A **git branch** on the gateway's local repo (`workspace-slug/agent-slug`). Holds the agent's identity files, memory, skills, and any artifacts it produces.
- A **Chrome profile** on the gateway (persistent cookies, logged-in sessions, extensions).
- An **OpenClaw session** — the runtime. Handles prompt assembly, tool calls, conversation state.
- A **Telegram bot** — each agent has its own bot, its own token. Primary I/O channel.
- A row in the Supabase `agents` table — the metadata, including `gateway_id` (which gateway runs it) and `meta` JSONB for template-specific config.

Agents run on **one gateway**. If a gateway goes down, its agents go down with it. Moving an agent to another gateway is manual (re-provision, or Phase 3 adds a UI flow).

## The template library

`templates/` is the catalog of starting points:

- `default/` — minimal baseline that every custom agent inherits from
- `analytics/`, `assistant/`, `chief-of-staff/`, `cmo/`, `cofounder/`, `crm-researcher/`, `designer/`, `market-researcher/`, `newsletter-editor/`, `newsletter-writer/`, `sales-copywriter/`, `script-writer/`, `social-strategist/`, `social-writer/`

Each template directory is the starting file tree for a new agent's git branch. The gateway seeds every template as a `template/<name>` branch in its local bare repo on first boot.

### Template structure

```
templates/cofounder/
├── agent.json        # runtime config: name, emoji, model, team, capabilities
├── IDENTITY.md       # personality, voice, domain knowledge
├── SOUL.md           # core beliefs, goals, non-negotiables
├── USER.md           # owner profile (placeholder text filled in at provision)
├── MEMORY.md         # initial memories (e.g. past context)
├── TOOLS.md          # what tools the agent has access to
├── AGENTS.md         # instructions for Claude-style sub-agents (if any)
└── skills/           # role-specific scripts/procedures
```

At provision time, `add-agent.sh` forks the chosen template branch into the agent's personal branch, then patches:

- `agent.json` — sets `slug`, `name`, `description`, `emoji`, `telegram_token_env`
- `USER.md` — replaces `USER_NAME_HERE`, `PREFERRED_NAME_HERE`, `TIMEZONE_HERE` with the workspace owner's profile
- `IDENTITY.md` — updates the Name/Emoji section to the new agent's identity

The rest of the template (role-specific skills, IDENTITY prose, MEMORY, etc.) is kept verbatim. Users can customize further by editing files via the file browser — each save enqueues an `update` command so the gateway reloads the agent with fresh config.

## Provisioning flow

1. UI → Agents → New Agent.
2. Wizard step 1: pick a template. Templates load from `/api/agents/templates` (baked into the UI image from the `templates/` directory at build time).
3. Step 2: name, slug (auto-generated from name), emoji, optional description override.
4. Step 3: paste a Telegram bot token (from BotFather).
5. Click Create.

UI-side:
- `createAgentWithBranch` in `apps/ui/src/app/dashboard/agents/actions.ts` validates the slug, checks uniqueness, inserts the `agents` row, and enqueues an `agent_commands` row with `action=provision`.

Gateway-side:
- The runner's Supabase Realtime subscription fires.
- Runner calls `lease_command(p_gateway_slug=<gateway-id>)` to atomically claim it.
- Runner builds the shell command and invokes `gateway/scripts/add-agent.sh`.
- `add-agent.sh`:
  1. Creates a new branch from the template branch in the bare repo.
  2. Creates a git worktree at `/home/openclaw/.openclaw/workspace-<agent-slug>/`.
  3. Patches `agent.json`, `USER.md`, `IDENTITY.md`.
  4. Appends a bindings entry to `openclaw.json` for the Telegram account.
  5. Creates a Chrome desktop shortcut for the new browser profile.
  6. Links shared auth directories (so all agents share model tokens).
- Runner restarts the gateway container so openclaw picks up the new agent.
- Agent appears as `online` in the UI within ~60 seconds.

## Telegram pairing

After provisioning:

1. Send `/start` to your bot on Telegram.
2. Bot replies with a 6-digit pairing code.
3. In the UI, open the agent's detail page → Pair Telegram field → paste code → Submit.
4. Runner executes `openclaw pairing approve`.
5. Next Telegram message triggers the agent.

If the agent doesn't respond to the first real message, check:
- Runner logs: `docker compose logs runner | grep pairing`
- Gateway logs: `docker compose logs gateway | grep telegram`
- openclaw.json in the gateway-state volume has the correct `bindings` entry

## Customizing agents after creation

Two paths:

**In the UI file browser** (Phase 1):
- Agents → [agent] → Files tab → browse the agent's git branch.
- Edit `IDENTITY.md`, `MEMORY.md`, `TOOLS.md`, any skill file.
- Save. The UI auto-enqueues an `update` command. Gateway reloads the agent.

**In Telegram, conversationally**:
- "Remember that I prefer short-form responses." → agent updates its own `MEMORY.md` (with your approval).
- "Learn to summarize in three bullets." → agent updates `SKILL.md` or adds a new skill.

The second is the eventual happy path. The first is the escape hatch when you want direct control.

## Sync model (git)

Every agent lives on its own git branch. File changes land on disk immediately, but aren't saved to git until someone commits. HQ's sync model is **event-driven, not polled**.

**Commits are triggered by meaningful events:**

1. **Provisioning** — `add-agent.sh` commits the initial branch when an agent is created ("feat: initialize agent `<slug>`").
2. **UI file-browser edits** — `files_api.py` commits on every file write ("edit via UI: `<path>`") or create/delete.
3. **Agent-initiated saves** — the agent calls `save_progress` (alias for `./scripts/git-sync.sh`) when it does something meaningful: learned a preference, produced an artifact, updated a skill. Commit messages like `learned: <what>`, `done: <what>`, `skill: <what>`.

**Pushes are automatic.** The gateway installs a `post-commit` git hook on the bare repo that async-pushes every commit to `origin` if a remote is configured. You never call `git push` manually. Works offline — commits land locally, push retries next boot or sweep.

**The backup sweep** runs inside the runner every `GIT_SYNC_INTERVAL` seconds (default 30 min). It:

- Commits any dirty worktrees with "autosync: uncommitted changes at `<timestamp>`"
- Pushes all branches (belt-and-suspenders — catches missed pushes)
- Fetches from origin and fast-forwards branches that moved on the remote (only when the local worktree is clean; we never stomp on in-progress edits)

**Conflict strategy: local wins.** If both local and remote have diverged, the sweep logs a warning and skips the pull. This isn't a collaboration tool — same user, different machines, not multiple editors.

**Configuring the remote:** either `GIT_REMOTE_URL` (any git host), or `GITHUB_TOKEN` + `GITHUB_REPO_OWNER` + `GITHUB_REPO_NAME` (GitHub shorthand). See [CONFIGURATION.md → Git remote sync](CONFIGURATION.md) for details.

**Disabling the sweep:** set `GIT_SYNC_INTERVAL=0`. Event-driven commits and the post-commit push hook still work; only the periodic safety net turns off.

## Writing a new template

1. Copy `templates/default/`:
   ```bash
   cp -r templates/default templates/your-role
   ```

2. Edit `templates/your-role/agent.json`:
   ```json
   {
     "slug": "your-role",
     "name": "Your Role",
     "emoji": "🎯",
     "team": "ops",
     "model": "openai/gpt-5.4",
     "description": "One-sentence role description."
   }
   ```

3. Edit `IDENTITY.md` — this is the prose that gets prepended to every prompt. Voice, domain knowledge, how they talk. See `templates/cofounder/IDENTITY.md` for a good example.

4. Edit `SOUL.md` — core beliefs. Goals. Non-negotiables. What the agent refuses to do.

5. Leave `USER.md` alone — the placeholder tokens (`USER_NAME_HERE`, etc.) are filled in at provision time.

6. Write starting memories in `MEMORY.md` — e.g. "The user's company is in early-stage SaaS. They prefer short outputs."

7. Add role-specific skills in `skills/`. A skill is a markdown file describing a procedure. Examples:
   - `skills/outreach/draft-cold-email.md`
   - `skills/content/weekly-newsletter.md`
   - `skills/research/competitor-analysis.md`

8. Rebuild the templates index so the UI sees your new template:
   ```bash
   node apps/ui/scripts/build-templates-index.mjs
   ```
   Commit the updated `apps/ui/src/generated/templates.ts`.

9. Build and test (only needed if developing; `docker compose up -d` alone is fine for published images):
   ```bash
   docker compose build ui    # rebuild only when you edit UI source
   docker compose up -d ui gateway
   ```
   Go to Agents → New Agent → your template should appear.

10. Provision a test agent against it. Iterate on `IDENTITY.md` and skills until it behaves right.

11. Open a PR if it's generally useful.

## Skills and tools

Agents have access to (via openclaw):

- **Browser** — a dedicated Chrome profile they can drive. Visit pages, screenshot, click, type. Persistent cookies.
- **Telegram** — send/receive messages with their paired user.
- **HQ database** — read/write contacts, tasks, documents, interactions via the service role.
- **Voice / calling** — phone-control plugin (Phase 3).
- **MCP servers** — any MCP server you configure. Slack, GitHub, Notion, Google Calendar, etc.
- **Shell** — scoped to their workspace directory.

`TOOLS.md` in a template documents which tools the agent should reach for in which situations. The browser tool, for example, is automatically registered as a capability (openclaw's browser plugin is always loaded), and `TOOLS.md` tells the agent when to use it without being asked.

## Agent memory model

Agents wake up fresh each session. Continuity comes from files in their branch:

- **`MEMORY.md`** — curated long-term memory. Durable truths: user preferences, ongoing projects, important context. Updated sparingly.
- **`memory/YYYY-MM-DD.md`** — daily notes. What happened today. Updated every session.
- **`history/YYYY-MM-DD_topic.md`** — operational narratives for meaningful work. Multi-step changes, architecture decisions, lessons learned.

The default `AGENTS.md` prompts the agent to read these on every session start. The agent maintains them itself — the user doesn't usually touch them.

For shared knowledge across agents, use Supabase documents (agents read/write the `documents` table).

## Agent-to-agent

Agents see the same database, so they can see each other's tasks and documents. Coordination patterns:

- **@-mentions in comments** — mentioning `@agent-slug` in a task or document comment enqueues an inbox item for that agent via the `enqueue_comment_mentions` trigger. Dispatcher wakes the agent.
- **Automation rules** — `automation_rules` table can fire inbox items on CRM events. Agent A writes a contact update → rule creates inbox item for agent B.
- **Task assignment** — assigning a task to an agent enqueues an inbox item (via `enqueue_task_assignment` trigger).

Phase 2+ may add more direct invocation patterns.

## Debugging an agent

- **Check the agent's Chrome window** — noVNC into the gateway; you'll see Chrome with the agent's profile. Right-click → Agents → click their window.
- **Check command history** — Settings → System → Agent Commands. Filter by agent.
- **Check inbox history** — Settings → System → Agent Inbox Items. See what triggered each wake.
- **Tail runner logs** — `docker compose logs -f runner` while the agent works.
- **Tail gateway logs** — `docker compose logs -f gateway | grep <agent-slug>` for openclaw-side traces.
- **Read the agent's branch** — file browser in the UI, or `docker compose exec gateway bash` → `cd ~/.openclaw/workspace-<slug>` → inspect directly.

See [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common agent-related failure modes.
