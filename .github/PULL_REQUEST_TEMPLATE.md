<!-- Thanks for sending a PR. Fill in the sections below; delete what isn't relevant. -->

## What this changes

<!-- One or two sentences. What does this PR do, and why? -->

## Linked issue

<!-- "Closes #123" or "Refs #123". For larger changes, please open an issue first so we can agree on direction. -->

## How I tested

<!-- Tell us how you verified this works. Concrete commands and outcomes are more useful than "tested locally". -->

- [ ] `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` boots the stack
- [ ] UI changes were exercised in a browser
- [ ] Gateway/daemon changes were exercised against a real Supabase

## Checklist

- [ ] `npx tsc --noEmit` passes in `apps/ui/` (zero TypeScript errors)
- [ ] `npm run lint` passes in `apps/ui/` (warnings ok, errors fail CI)
- [ ] For gateway changes: `ruff check gateway/` is clean
- [ ] For shell changes: `shellcheck` is clean (`gateway/entrypoint.sh`, `gateway/scripts/*.sh`, `installer/install.sh`)
- [ ] No secrets, `.env` files, or `*.pem` files committed
- [ ] If schema changed: a new file was added under `db/migrations/` (do not edit existing migrations)
- [ ] If a new template was added: `node apps/ui/scripts/build-templates-index.mjs` was re-run and the generated index is committed
- [ ] If user-facing behaviour changed: docs in `docs-site/` were updated in the same PR
- [ ] Commit messages describe **why**, not just **what**

## Notes for reviewers

<!-- Anything that would help the reviewer: tradeoffs you considered, things you're unsure about, follow-ups you plan to land separately. -->
