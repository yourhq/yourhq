# Contributing to HQ

Thanks for wanting to help. This doc covers the contribution flow — code, templates, docs, and bug reports.

## Quick links

- [Good first issues](https://github.com/yourhq/yourhq/labels/good%20first%20issue)
- [Help wanted](https://github.com/yourhq/yourhq/labels/help%20wanted)
- [Roadmap](https://docs.yourhq.ai/getting-started/roadmap)

## Ways to contribute

1. **Agent templates** — add a new starting point for a role/persona (see below)
2. **Bug fixes** — check existing issues, open a PR
3. **UI improvements** — Next.js + Tailwind + shadcn; changes go in `apps/ui/`
4. **Gateway plugins** — openclaw plugins or integrations (MCP, CDP, custom)
5. **Documentation** — if something confused you, a doc PR will save the next person
6. **Translations** — not shipped yet, but we'll accept i18n contributions when the framework is in

## Before you start

**For small changes** (typos, obvious bugs, template tweaks): open a PR directly.

**For bigger changes**: open an issue first so we can discuss approach. We don't want you to spend days on a PR that doesn't match the project direction.

## Development setup

Prerequisites:

- Docker + Docker Compose
- Node.js 24+ (for UI development)
- A Supabase project for testing

```bash
# Clone and set up
git clone https://github.com/yourhq/yourhq.git
cd yourhq
cp .env.example .env
# Leave Supabase empty for browser onboarding, or set env overrides for gateway-only testing

# Live-reload dev mode
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Edit any file under `apps/ui/` and the UI reloads automatically. Edit `gateway/entrypoint.sh` or `gateway/daemons/*` and restart the relevant service:

```bash
docker compose restart gateway dispatcher runner embedder file-processor
```

Gateway services are behind a Compose `gateway` profile. Use `docker compose --profile gateway up -d` to start them, or name them explicitly.

### Running just the UI

If you're only working on the UI:

```bash
cd apps/ui
npm install --legacy-peer-deps
npm run dev
```

Complete browser onboarding against the local dev server, or set `HQ_CONFIG_DIR` to a local directory with compatible `projects.json` and `secrets.json` files. You won't have a gateway in this setup, so gateway-dependent pages will error; that's expected.

### Running just the gateway

Useful when iterating on the agent runtime without touching the UI:

```bash
docker compose --profile gateway up -d
docker compose logs -f gateway
```

## Adding an agent template

1. Copy an existing template as a starting point:
   ```bash
   cp -r templates/default templates/my-new-role
   ```
2. Edit `templates/my-new-role/agent.json` to match the role (name, description, team, model, etc.)
3. Customize the identity files:
   - `IDENTITY.md` — personality, voice, domain knowledge
   - `SOUL.md` — core beliefs and goals
   - `USER.md` — the owner profile template
   - `MEMORY.md` — starting memories
4. Add role-specific skills in `skills/`
5. Test: create an agent from this template in the UI, verify it behaves as expected
6. Rebuild the templates index:
   ```bash
   node apps/ui/scripts/build-templates-index.mjs
   ```
7. Open a PR with the new template + the updated generated index

Templates live in the monorepo so they're versioned together. Breaking changes to the template format show up as PRs touching multiple templates.

## PR checklist

Before opening a PR:

- [ ] `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` still boots the stack
- [ ] `npx tsc --noEmit` passes (zero TS errors) in `apps/ui/`
- [ ] `npm run lint` passes in `apps/ui/` (warnings OK, errors fail CI)
- [ ] For gateway changes: `shellcheck gateway/entrypoint.sh gateway/scripts/*.sh` passes
- [ ] You haven't committed secrets, `.env`, or `*.pem` files
- [ ] Commit messages describe *why*, not just *what*

Open your PR against `main`. CI runs automatically. A maintainer will review within a few days.

## Code style

- **UI**: ESLint + Prettier config in `apps/ui/`. Run `npm run lint -- --fix` before committing.
- **Python**: PEP 8, no specific linter pinned yet. Keep to what's in `gateway/daemons/*.py`.
- **Shell**: shellcheck-clean. Use `set -euo pipefail` in new scripts.
- **TypeScript**: strict mode. No `any` unless there's a reason; then a comment explaining.
- **Commits**: conventional-commits style preferred but not required. One PR = one logical change.

## Architecture decisions

Before proposing big architectural changes, read:

- [Architecture docs](https://docs.yourhq.ai/concepts/architecture) — current system design
- [Roadmap](https://docs.yourhq.ai/getting-started/roadmap) — shipped areas and planned work
- Recent issues labeled `design`

Big changes go through an issue first. We prefer small, iterative PRs to big refactors.

## What "accepted" means

Once merged to `main`:

- Docker images get rebuilt and published to GHCR automatically
- Users who track `:latest` pick up the change on their next `docker compose pull`
- Pinned users (`v0.1.0` etc.) don't see it until we cut the next release

We don't do per-PR release notes. Significant changes get called out in the GitHub release notes when we cut a tag.

## Code of conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0 (see [LICENSE](LICENSE)).

## Questions

- General: [Discussions](https://github.com/yourhq/yourhq/discussions)
- Bug reports: [Issues](https://github.com/yourhq/yourhq/issues)
- Security: `security@yourhq.ai` — don't use issues

Thanks for helping.
