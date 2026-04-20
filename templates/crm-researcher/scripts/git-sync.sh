#!/usr/bin/env bash
# ── git-sync.sh ─────────────────────────────────────────────────
# Commits and pushes workspace changes to the agent's git branch.
# Called by heartbeat, cron, or manually.
#
# Usage:
#   ./scripts/git-sync.sh "memory: updated after research session"
#   ./scripts/git-sync.sh  # uses default message with timestamp
# ────────────────────────────────────────────────────────────────
set -euo pipefail

BRANCH="${AGENT_SLUG:-$(git rev-parse --abbrev-ref HEAD)}"
MESSAGE="${1:-"auto: sync $(date -u +%Y-%m-%dT%H:%M:%SZ)"}"

cd "$(git rev-parse --show-toplevel)"

# Check for changes
if [ -z "$(git status --porcelain)" ]; then
  echo "[git-sync] Nothing to commit"
  exit 0
fi

# Commit and push
git add -A
git commit -m "$MESSAGE"
git push origin "$BRANCH"

echo "[git-sync] Pushed to $BRANCH: $MESSAGE"
