# Changelog

All notable changes to HQ are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pinned image tags follow `v<major>.<minor>.<patch>`. Users tracking `:latest`
pick up changes on every push to `main`; pinned users see them on the next
tagged release.

## [Unreleased]

## [0.1.4] — 2026-05-26

## [0.1.3] — 2026-05-21

### Added

- **Personality tab** — agent detail page now surfaces IDENTITY.md and SOUL.md as rich-text editors. Edit your agent's identity and soul inline, save commits to git, and the agent restarts automatically with the new personality applied.
- **Deliverable auto-complete** — when all deliverables on a task are approved, the task auto-completes. Revision requests and rejections notify the assigned agent via inbox.
- **Clickable deliverables** — approved deliverables render as links in task detail; draft/pending ones show the review card.
- **Task model overrides** — override the model and thinking budget per-task from the task form.
- **Org chart always visible** — removed the 4-agent minimum for the org chart toggle. Shows an empty state with guidance when no reporting structure exists.

### Fixed

- **Slug-based agent URLs** — agent pages now live at `/agents/[slug]` instead of `/agents/[id]`. Old UUID links redirect automatically (activity feed, notifications, bookmarks all keep working).
- **Create wizard simplified** — removed the channel setup step entirely. Gateway selector moved to the identity step. After creation, navigates directly to the new agent's detail page.
- **Secrets sync** — `secrets_sync.py` now preserves existing gateway.env credentials (Supabase URL, keys) instead of overwriting them. Fixes agents losing database access after a secret is added.
- **Agent detail page** — fixed desktop modal, live browser viewport, CDP screenshot capture, and provision name display.
- **Remote gateway registration** — fixed token exchange flow and polished the add-gateway dialog.
- **Collection cells** — datetime and boolean cells now render correctly; task relations mapping fixed.
- **Dispatcher reliability** — agent wake was failing silently due to wrong agent ID lookup and broken remote config path.
- **Login bounce** — prevented redirect loop after account creation in OSS onboarding.
- **Docker networking** — allow plaintext ws:// between sidecar containers on the Docker bridge network.
- **Task edits** — changes now reflect immediately in the list and modal after closing the editor.

### Changed

- **Dependencies** — React 19.2.6, Next.js 16.2.6, Tailwind 4.3, @supabase/supabase-js 2.106, @supabase/ssr 0.10, Zod 4.4, Vitest 4.1.7, and 15+ other updates.
- **CDN session safety** — middleware and auth callback now forward cache-busting headers from @supabase/ssr 0.10, preventing CDN-cached auth responses from leaking sessions between users.

## [0.1.2] — 2026-05-19

### Fixed

- **API key provisioning** — `auth_set_api_key` now writes `auth-profiles.json` directly instead of piping to openclaw's interactive TUI prompt, which silently dropped keys. API keys set during onboarding (and from Settings → Connections) now reliably propagate to all agents.
- **Gateway credential resolution** — `registry_config.py` read from `projects.json` but the UI writes `workspaces.json`. Gateway daemons (dispatcher, runner, embedder) would spin forever with "waiting for onboarding" on a fresh install. Added backward-compatible fallbacks for both naming conventions.
- **Onboarding wizard flow** — connecting the gateway no longer prematurely finalizes onboarding, which was bouncing users to the login screen before they could set up a provider or create an agent.
- **Installer portability** — replaced `grep -oP` (GNU-only) with portable `grep -o` + `sed` in `install.sh` and `update.sh`. Fixes version detection on macOS and minimal Linux installs.
- **Docker socket detection** — installer now uses `sudo -n` (non-interactive) for Docker socket access, preventing hangs when run via `curl | bash` pipe.
- **Auth propagation after provision** — `sync_to_shared_auth()` is now called after agent provisioning and uses a recursive filesystem walk to find auth files regardless of where openclaw writes them.

### Changed

- **E2B template build** — entrypoint detects hosted mode without Supabase credentials and exits cleanly for template snapshots instead of crashing. Dockerfile.e2b now copies the latest entrypoint.
- **CI** — `deploy-hosted.yml` triggers Vercel UI deployment after worker deploy via Deploy Hook.

## [0.1.1] — 2026-05-18

### Added

- **Comprehensive test suite** — 2215 tests across hooks, lib, components, API routes, and gateway daemons. Vitest + React Testing Library for UI, pytest for Python.
- **Release tooling** — `scripts/release.sh` automates version bumps, changelog, tagging, and GitHub Release creation. `update.sh` for self-hosted upgrades.
- **Install script routing** — `install.yourhq.ai/gateway` serves the gateway-only installer alongside the main installer.
- **Setup guide in onboarding** — enhanced database connection UI in StepInfrastructure with step-by-step Supabase setup guidance.

### Changed

- **Onboarding redesign** — updated wizard flow, new agent templates with refined roles and descriptions, improved auth form styling.
- **Theme refinements** — updated color tokens for improved accessibility and consistency, new icons, manifest updates for theming support.
- **Analytics scoped to production** — PostHog initialization restricted to production environments only.
- **Responsive improvements** — component styles updated for better mobile and accessibility support.

### Fixed

- **CI pipeline** — deploy-hosted now waits for image publish to complete (fixes race condition). E2B Dockerfile fixed for SDK compatibility. Database migrations updated for improved extension handling.
- **Docker images now public** — GHCR packages set to public for OSS install without authentication.

### Infrastructure

- Tag-only Docker image builds and deployments (no more builds on every push to main).
- Branch protection on main: CI checks required, linear history enforced, no force pushes.
- Dependabot tuned: monthly for Docker/pip/Actions, grouped updates, major versions ignored.
- Sentry error tracking integrated across worker and gateway daemons (hosted-only).

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

[Unreleased]: https://github.com/yourhq/yourhq/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/yourhq/yourhq/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/yourhq/yourhq/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/yourhq/yourhq/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/yourhq/yourhq/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yourhq/yourhq/releases/tag/v0.1.0
