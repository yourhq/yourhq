<!-- Thanks for sending a PR. Fill in the sections below; delete what isn't relevant. -->

## What this changes

<!-- One or two sentences. What does this PR do, and why? -->

## Linked issue

<!-- "Closes #123" or "Refs #123". For larger changes, please open an issue first so we can agree on direction. -->

## How I tested

<!-- Tell us how you verified this works. Concrete commands and outcomes are more useful than "tested locally". -->

- [ ] `make test` passes (unit + component tests, no Docker needed)
- [ ] UI changes were exercised in a browser
- [ ] Gateway/daemon changes were exercised against a real Supabase

## Checklist

- [ ] `make test` passes locally
- [ ] `make test-lint` passes (TypeScript, ESLint, Ruff, ShellCheck)
- [ ] Added/updated tests for changed behavior
- [ ] No secrets, `.env` files, or `*.pem` files committed
- [ ] If schema changed: a new file was added under `db/migrations/` (do not edit existing migrations)
- [ ] If a new source connector was added: `node scripts/build-source-manifests.mjs` was re-run
- [ ] If user-facing behaviour changed: docs in `docs-site/` were updated in the same PR
- [ ] Commit messages describe **why**, not just **what**

## Notes for reviewers

<!-- Anything that would help the reviewer: tradeoffs you considered, things you're unsure about, follow-ups you plan to land separately. -->
