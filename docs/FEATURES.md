# Features

HQ is an agent operations system, not just an agent chat UI. It gives one operator a workspace for CRM, tasks, documents, automations, and a fleet of long-lived AI agents that run on infrastructure the operator controls.

This page is the product tour. For system internals, read [ARCHITECTURE.md](ARCHITECTURE.md). For installation, read [INSTALL.md](INSTALL.md).

## Workspace

Every HQ install connects to one or more Supabase projects. A project contains the workspace data: agents, tasks, CRM records, documents, settings, gateway registrations, command history, and usage data.

The first boot flow is intentionally config-light:

1. Start the Docker stack.
2. Open the UI.
3. Paste Supabase URL, anon key, and service role key.
4. Create or sign in to a Supabase auth user.
5. Finish the workspace setup wizard.

After setup, the project can be managed from Settings. The UI stores project metadata in `/config/projects.json` and project secrets in `/config/secrets.json` on the `ui-config` volume. The active project is selected at runtime, so the published UI image does not need a rebuild for each user's Supabase project.

## Onboarding and Setup

The onboarding flow covers the infrastructure-level setup:

- Connect a Supabase project.
- Validate that the required schema exists.
- Create or sign in to an auth user.
- Choose networking mode.
- Register or bootstrap the first gateway.
- Finish workspace setup.

The workspace setup wizard then seeds:

- Workspace name, slug, and owner profile.
- Pipeline stages.
- Custom field definitions.
- Initial task streams.

Presets are available for common use cases such as outreach, job search, recruiting, sales, client work, networking, personal operations, and blank/custom workspaces.

## Dashboard

The dashboard is the operating view for the workspace. It summarizes:

- Agent fleet health.
- Gateway status.
- Open tasks and streams.
- Recent activity.
- Notifications.
- Fleet usage and budget status.

The dashboard is backed by Supabase realtime subscriptions, so most operational changes appear without a full refresh.

## Agents

An HQ agent is a long-lived workspace with:

- A Supabase `agents` row for metadata and status.
- A git branch in the gateway's local bare repository.
- A per-agent worktree containing identity, memory, skills, and artifacts.
- A per-agent Chrome profile.
- An OpenClaw runtime session.
- A Telegram bot binding.
- Optional manager/direct-report relationships.
- Optional usage budget configuration.

Agents are created from templates under `templates/`. The creation wizard lets the operator choose a template, set identity fields, select a manager, provide a Telegram bot token, and then watches the gateway provisioning command.

The agent detail page includes:

- Overview, status, capabilities, and activity.
- Boot context documents.
- Direct reports and manager assignment.
- Trigger and inbox history.
- File browser/editor for the agent branch.
- Operations and command history.
- Usage and budget controls.
- Remote desktop access through the assigned gateway.
- Inline default model/provider selection.

## Agent Templates

Templates are role-specific starting points for agents. The repository ships templates for roles such as assistant, analytics, chief of staff, CMO, cofounder, CRM researcher, designer, market researcher, newsletter editor, newsletter writer, sales copywriter, script writer, social strategist, and social writer.

Each template includes files such as:

- `agent.json` for runtime metadata.
- `IDENTITY.md` for role, voice, and domain behavior.
- `SOUL.md` for goals and non-negotiables.
- `USER.md` for owner profile placeholders.
- `MEMORY.md` and `memory/` for persistent context.
- `TOOLS.md` for tool-use guidance.
- `skills/` for repeatable procedures and scripts.

When the gateway boots for the first time, it seeds each template into the local bare repo as a `template/<name>` branch. Provisioning an agent creates a new branch from the selected template and commits the personalized files.

## Agent Files and Memory

Agent source of truth is the gateway worktree. Agents can update their own files during work, and the operator can edit files from the UI.

The file browser talks to the gateway files API. Every create, edit, or delete is committed to git, then the UI enqueues an update command so the gateway reloads the agent.

Typical memory files:

- `MEMORY.md` for curated long-term memory.
- `memory/YYYY-MM-DD.md` for daily notes.
- `history/` files for longer work narratives.
- Skills under `skills/` for reusable procedures.

Optional git remote sync can push commits to GitHub or another git host for backup.

## Agent Organization and Delegation

Agents can report to other agents through `agents.reports_to_id`. The UI prevents self-reporting and cycle creation.

The hierarchy is visible on the agent list and on each agent detail page. Runtime boot context includes:

- The agent's manager.
- The agent's direct reports.
- Delegation rules.

The intended operating model is:

- Delegate to direct reports by assigning tasks.
- Escalate to a manager by creating a high-priority task.
- Ask the human before routing work to peers outside the direct hierarchy.

## Usage Tracking and Budgets

HQ records LLM usage in `agent_usage` and rolls it up into `agent_budgets`.

The budget system tracks:

- Provider and model.
- Input, output, cache-read, and cache-write tokens.
- Estimated cost when pricing is known.
- Current monthly spend.
- Metered and unmetered calls.
- Soft threshold warnings.
- Hard cutoff status.

Budgets can be configured per agent. When a hard cutoff is enabled and an agent exceeds its monthly limit, the runtime blocks further replies and the inbox dispatcher stops waking that agent for background work. Budget transitions also create notifications.

## CRM

The CRM stores people, organizations, interactions, campaigns, message templates, and draft sets.

Core capabilities include:

- Contacts and organizations.
- Contact-organization relationships.
- Interaction timeline.
- Dynamic custom fields.
- Pipeline stages and kanban views.
- Import wizard with mapping and duplicate handling.
- Campaign and draft workflows.
- Automation triggers that can assign work to agents.

CRM records are regular Supabase rows. Agents can read and update them through the bundled HQ skills.

## Tasks

Tasks are the main coordination primitive between the human and agents.

Tasks support:

- Human, agent, or system assignees.
- Streams for grouping work.
- Statuses such as todo, in progress, blocked, done, cancelled, and missed.
- Priorities and due dates.
- Recurrence rules.
- Comments and mentions.
- Attachments.
- Agent inbox wakeups on assignment and reassignment.

Mentioning an agent in a comment creates an inbox item for that agent. Assigning a task to an agent does the same.

## Documents and Assets

Documents are the shared knowledge base. They support folders, tags, pinned state, rich editing, markdown import/export, and boot-context tagging.

Agents can receive documents in boot context by tag:

- `boot:all` includes a document for every agent.
- `boot:<agent-slug>` includes a document for one agent.

Assets are a related library for operational files and references: SOPs, research, images, videos, audio, templates, scripts, spreadsheets, links, and other workspace artifacts.

## Automations and Inbox

Automations convert workspace events into agent work.

Supported patterns include:

- Contact created.
- Contact status changed.
- Contact fields updated.
- Task assigned or reassigned.
- Agent mentioned in a comment.

Automations create `agent_inbox_items`. The gateway dispatcher leases pending inbox items, checks whether the target agent belongs to that gateway, verifies budget status, and wakes the agent through OpenClaw.

Inbox items have retry state, attempt counts, lease fields, done/failed/dead-letter statuses, and deduplication keys.

## Gateways

A gateway is a Docker host that runs agents. One workspace can have multiple gateways.

The gateway stack includes:

- Gateway container with OpenClaw, Chrome/Chromium, XFCE, noVNC, and the files API.
- Dispatcher daemon for agent inbox work.
- Runner daemon for lifecycle and operations commands.
- A shared `gateway-state` volume for OpenClaw config, git repo, worktrees, browser profiles, desktop files, plugins, and auth state.

The Settings -> Gateways UI supports:

- Viewing gateway status and stale heartbeats.
- Adding a gateway with a single-use registration token.
- Generating a `curl | bash` installer command for a remote host.
- Removing gateways.
- Editing labels and reachable URL overrides.
- Opening the noVNC desktop modal.

## Provider Connections and Models

Model provider auth is managed from Settings -> Connections and from the agent rail.

HQ supports the providers exposed by the OpenClaw model auth layer, including OpenAI, Anthropic, Gemini, OpenRouter, local OpenAI-compatible servers, and other API-key or CLI/device-code based providers.

The command runner handles provider auth through `agent_commands`, including API-key storage, interactive auth flows, pasted redirects, provider listing, removal, refresh, and default model selection.

Agents can have default providers/models selected inline from their detail page.

## Networking

HQ's default networking model is host-controlled:

- Local mode binds services to loopback.
- Tailscale mode installs or uses Tailscale on the host, not inside containers.
- Public mode expects a host-level reverse proxy or tunnel.

Gateways register their reachable URLs in Supabase so the UI can open the correct files API and noVNC endpoint for each gateway.

## Notifications and Activity

HQ records important workspace events in `notifications`, `audit_log`, command history, inbox history, and activity feeds. Examples include:

- Budget warnings and exceedances.
- Command completion or failure.
- Agent lifecycle actions.
- Task and CRM events.
- Gateway state changes.

This gives the operator a single place to understand what happened and why.

## Extensibility

Most customization does not require changing code:

- Add templates under `templates/`.
- Add skills to templates.
- Configure fields, pipeline stages, streams, and automation rules in the UI.
- Add model providers through connections.
- Add gateways through Settings.

Code extension points include:

- New UI pages under `apps/ui/src/app`.
- New gateway command actions in `gateway/daemons/command_runner.py`.
- New automation behavior in database functions/triggers.
- New agent skills under template `skills/`.
- New OpenClaw plugins in `gateway/scripts/plugins/`.
