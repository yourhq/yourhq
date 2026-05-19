#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# HQ release script
#
# Usage:
#   ./scripts/release.sh 0.1.1
#
# What it does:
#   1. Validates the version and checks prerequisites
#   2. Bumps version in package.json / pyproject.toml
#   3. Sets the release date in CHANGELOG.md
#   4. Commits, tags, and pushes
#   5. Creates a GitHub Release with auto-generated notes
#
# After it runs, CI handles the rest:
#   tag push → Docker images → ECR → ECS deploy → install.yourhq.ai
# ─────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { printf "${GREEN}▸${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}▸${NC} %s\n" "$*"; }
err()   { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  err "Usage: ./scripts/release.sh <version>  (e.g., 0.1.1)"
fi

# Strip leading v if provided
VERSION="${VERSION#v}"

# Validate semver format
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  err "Invalid version: $VERSION (expected semver like 0.1.1)"
fi

TAG="v${VERSION}"
DATE=$(date +%Y-%m-%d)

# ── Prerequisites ───────────────────────────────────────────

command -v gh >/dev/null || err "gh CLI not installed"
command -v jq >/dev/null || err "jq not installed"

BRANCH=$(git branch --show-current)
[ "$BRANCH" = "main" ] || err "Must be on main branch (currently on $BRANCH)"

git diff --quiet || err "Working directory has uncommitted changes"
git diff --cached --quiet || err "Staging area has uncommitted changes"

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] || err "Local main is not up to date with origin"

git tag -l "$TAG" | grep -q "$TAG" && err "Tag $TAG already exists"

info "Releasing $TAG ($DATE)"

# ── Bump versions ───────────────────────────────────────────

info "Bumping versions to $VERSION ..."

# apps/ui/package.json
jq --arg v "$VERSION" '.version = $v' apps/ui/package.json > apps/ui/package.json.tmp
mv apps/ui/package.json.tmp apps/ui/package.json

# apps/worker/package.json
jq --arg v "$VERSION" '.version = $v' apps/worker/package.json > apps/worker/package.json.tmp
mv apps/worker/package.json.tmp apps/worker/package.json

# apps/migrate/package.json
jq --arg v "$VERSION" '.version = $v' apps/migrate/package.json > apps/migrate/package.json.tmp
mv apps/migrate/package.json.tmp apps/migrate/package.json

# pyproject.toml
sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" pyproject.toml
rm -f pyproject.toml.bak

# ── Update CHANGELOG ────────────────────────────────────────

info "Updating CHANGELOG.md ..."

if grep -q "## \[Unreleased\]" CHANGELOG.md; then
  # Add new version header after [Unreleased], move items down
  sed -i.bak "s/## \[Unreleased\]/## [Unreleased]\n\n## [$VERSION] — $DATE/" CHANGELOG.md
  rm -f CHANGELOG.md.bak
else
  warn "No [Unreleased] section found in CHANGELOG.md — skipping"
fi

# Update comparison links at bottom of CHANGELOG
if grep -q "\[Unreleased\]: https://github.com" CHANGELOG.md; then
  PREV_TAG=$(grep -o '\[Unreleased\]: https://github.com/yourhq/yourhq/compare/v[^.]*\.[^.]*\.[^.]*' CHANGELOG.md | head -1 | sed 's/.*compare\/v//')
  if [ -n "$PREV_TAG" ]; then
    sed -i.bak "s|\[Unreleased\]: https://github.com/yourhq/yourhq/compare/v.*\.\.\.HEAD|[Unreleased]: https://github.com/yourhq/yourhq/compare/v${VERSION}...HEAD\\
[${VERSION}]: https://github.com/yourhq/yourhq/compare/v${PREV_TAG}...v${VERSION}|" CHANGELOG.md
    rm -f CHANGELOG.md.bak
  fi
fi

# ── Commit, tag, push ───────────────────────────────────────

info "Committing ..."
git add \
  apps/ui/package.json \
  apps/worker/package.json \
  apps/migrate/package.json \
  pyproject.toml \
  CHANGELOG.md

git commit -m "chore: prepare v${VERSION} release"

info "Tagging $TAG ..."
git tag -a "$TAG" -m "$TAG"

info "Pushing to origin ..."
git push origin main
git push origin "$TAG"

# ── GitHub Release ──────────────────────────────────────────

info "Creating GitHub Release ..."
gh release create "$TAG" --generate-notes --title "$TAG"

info "Done! Release $TAG is live."
info ""
info "CI will now:"
info "  1. Build + publish Docker images to GHCR + ECR"
info "  2. Deploy hosted (after images publish)"
info "  3. Rebuild E2B template"
info "  4. install.yourhq.ai serves from $TAG (within 5 min)"
