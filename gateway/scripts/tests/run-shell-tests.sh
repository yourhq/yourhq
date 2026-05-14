#!/usr/bin/env bash
# Shell smoke tests for gateway scripts and installers.
# No external deps — just bash. Validates syntax and arg handling.
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GATEWAY_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"
REPO_DIR="$(cd "$GATEWAY_DIR/.." && pwd)"

PASS=0
FAIL=0
ERRORS=""

pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); ERRORS="${ERRORS}\n  ✗ $1"; echo "  ✗ $1"; }

echo "Shell smoke tests"
echo "═══════════════════════════════════════"

# ── Syntax validation ────────────────────────────────────────────────

echo ""
echo "Syntax checks (bash -n):"

for script in \
  "$SCRIPTS_DIR/add-agent.sh" \
  "$SCRIPTS_DIR/remove-agent.sh" \
  "$SCRIPTS_DIR/update-agent.sh" \
  "$SCRIPTS_DIR/update-all-agents.sh" \
  "$SCRIPTS_DIR/list-agents.sh" \
  "$GATEWAY_DIR/entrypoint.sh"; do
  name="$(basename "$script")"
  if bash -n "$script" 2>/dev/null; then
    pass "$name syntax valid"
  else
    fail "$name syntax invalid"
  fi
done

if [ -f "$REPO_DIR/installer/install.sh" ]; then
  if bash -n "$REPO_DIR/installer/install.sh" 2>/dev/null; then
    pass "install.sh syntax valid"
  else
    fail "install.sh syntax invalid"
  fi
fi

# ── Argument validation ──────────────────────────────────────────────

echo ""
echo "Argument validation:"

# remove-agent.sh --help should exit 0
if bash "$SCRIPTS_DIR/remove-agent.sh" --help >/dev/null 2>&1; then
  pass "remove-agent.sh --help exits 0"
else
  fail "remove-agent.sh --help should exit 0"
fi

# remove-agent.sh with no args should exit 1
if bash "$SCRIPTS_DIR/remove-agent.sh" 2>/dev/null; then
  fail "remove-agent.sh with no args should exit 1"
else
  pass "remove-agent.sh with no args exits non-zero"
fi

# add-agent.sh with no args should exit non-zero
if bash "$SCRIPTS_DIR/add-agent.sh" 2>/dev/null; then
  fail "add-agent.sh with no args should exit non-zero"
else
  pass "add-agent.sh with no args exits non-zero"
fi

# ── Entrypoint checks ───────────────────────────────────────────────

echo ""
echo "Entrypoint checks:"

if grep -q "set -euo pipefail" "$GATEWAY_DIR/entrypoint.sh"; then
  pass "entrypoint.sh uses set -euo pipefail"
else
  fail "entrypoint.sh should use set -euo pipefail"
fi

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\nFailures:$ERRORS"
  exit 1
fi
