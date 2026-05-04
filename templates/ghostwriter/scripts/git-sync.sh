#!/usr/bin/env bash
# ── save_progress ─────────────────────────────────────────────
# Commit your workspace changes with a meaningful message. If the
# gateway has a remote configured (GITHUB_TOKEN or GIT_REMOTE_URL),
# the commit auto-pushes to origin via a post-commit hook — you
# don't need to push explicitly.
#
# Use this when you've done something worth saving: learned a new
# preference, produced an artifact, updated a skill, finished work.
#
# Usage:
#   ./scripts/git-sync.sh "learned: user prefers short replies"
#   ./scripts/git-sync.sh "done: drafted Q3 content calendar"
#   ./scripts/git-sync.sh "skill: added draft-cold-email"
#   ./scripts/git-sync.sh  # auto message with timestamp (use sparingly)
# ────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="${AGENT_SLUG:-$(git rev-parse --abbrev-ref HEAD)}"
MESSAGE="${1:-"auto: sync $(date -u +%Y-%m-%dT%H:%M:%SZ)"}"

cd "$(git rev-parse --show-toplevel)"

# Check for changes
if [ -z "$(git status --porcelain)" ]; then
  echo "[save_progress] Nothing to commit"
  exit 0
fi

# Commit locally. The gateway's post-commit hook async-pushes to origin
# if a remote is configured — we don't call `git push` here so this works
# offline and doesn't double-push.
git add -A
git commit -m "$MESSAGE"

echo "[save_progress] Committed on $BRANCH: $MESSAGE"
