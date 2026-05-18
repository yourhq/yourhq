# Changelog

All notable changes to HQ are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pinned image tags follow `v<major>.<minor>.<patch>`. Users tracking `:latest`
pick up changes on every push to `main`; pinned users see them on the next
tagged release.

## [Unreleased]

## [0.1.0] — 2026-05-17

Initial public release.

### Added

- Self-hosted stack: UI, gateway, dispatcher, runner, embedder, file processor — all multi-arch (amd64 + arm64) Docker images on GHCR.
- One-line installer (`curl install.yourhq.ai | bash`) with Docker auto-install on Linux.
- Browser-based onboarding wizard: Supabase setup, model provider, first agent.
- Multi-project registry — one UI manages many independent Supabase projects.
- Multi-gateway support — multiple gateway hosts per project, agents bound to a specific gateway.
- 17 agent templates: cofounder, designer, analytics, CMO, ghostwriter, newsletter editor, social writer, sales copywriter, and more.
- Agent runtime via OpenClaw with per-agent Chrome profile, git branch, and noVNC remote desktop.
- Operational workspace: CRM (contacts, organizations), tasks, knowledge base (pages, skills, files, sources), collections (tables / kanban / calendar), routines (scheduled + event-driven), inbox, notifications, audit log.
- File-processing pipeline (PDF, DOCX, XLSX, CSV, PPTX, TXT) with embedding + chunked vector search.
- Source connections — Notion sync (Google Drive in progress).
- Per-agent monthly usage budgets and append-only usage tracking.
- Agent reporting hierarchy (`reports_to_id`) for delegation.
- **Task relations and dependencies** — `blocked_by`, `blocks`, `relates_to`, `parent_of`, `child_of` relations between tasks. Blocker highlighting, `notify_blocker_resolved` trigger, `get_task_relations()` RPC.
- **Labels** — managed workspace labels with configurable colors and descriptions. Inline creation from task form. Label filter in task toolbar. Settings → Labels management page.
- **Deliverables** — agents submit work products to tasks via `hq_submit_deliverable.py`. Human review workflow: approve, request revision, reject.
- **Task templates** — reusable task group templates with dependency graphs. "From template" launcher spawns task groups with preserved `blocked_by` relations.
- **Overdue escalation** — pg_cron job marks overdue tasks as `missed` and creates inbox items for assigned agents.
- **Agent delegation skill** — `hq_delegate_task.py` creates subtasks assigned to direct reports with org-chart validation.
- **Plugin system** — event-driven hooks, local Python + webhook plugins, plugin runner daemon, SDK with state/secrets/supabase clients.
- **Customizable theming** — brand color, warmth, dark/light mode, per-token overrides via Settings → Appearance.
- **Encrypted secrets** — AES-256-GCM encrypted credentials with gateway .env sync.
- Tenant-scoped row-level security; single default tenant in self-hosted deployments.
- Networking modes: local-only (loopback), Tailscale, public HTTPS via Caddy + Let's Encrypt.
- Tag-pinned versioning with `update.sh` for self-hosted upgrades.
- Apache 2.0 license.

### Security

- Default port bindings are loopback-only — UI and files API are not host-exposed without explicit override.
- Vulnerability disclosure via `security@yourhq.ai`; trust model and known risks documented in [SECURITY.md](SECURITY.md).
- Gateway tokens hashed at rest; service-role key handling documented.

[Unreleased]: https://github.com/yourhq/yourhq/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourhq/yourhq/releases/tag/v0.1.0
