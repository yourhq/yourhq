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

# openclaw >=5.x blocks plugins in world-writable dirs. entrypoint must
# strip group/other write from the installed plugin dir or it won't load.
if grep -Eq 'chmod -R go-w "\$PLUGIN_DIR"' "$GATEWAY_DIR/entrypoint.sh"; then
  pass "entrypoint.sh hardens plugin dir permissions"
else
  fail "entrypoint.sh should chmod go-w the plugin dir (openclaw 5.x plugin block)"
fi

# Functional: chmod -R go-w must actually clear the world-writable bit that
# triggers the openclaw guard.
PERM_TMP="$(mktemp -d)"
mkdir -p "$PERM_TMP/plugin"
touch "$PERM_TMP/plugin/index.ts"
chmod -R 0777 "$PERM_TMP/plugin"
chmod -R go-w "$PERM_TMP/plugin"
# GNU stat (Linux/CI) uses -c "%a"; BSD stat (macOS) uses -f "%Lp". Try GNU first.
dir_mode="$(stat -c "%a" "$PERM_TMP/plugin" 2>/dev/null || stat -f "%Lp" "$PERM_TMP/plugin" 2>/dev/null)"
# After go-w, no group/other write bits → not world-writable (e.g. 0755).
# Mask must be octal 0022 (group-write + other-write); bare "022" is decimal.
if [ "$((0$dir_mode & 0022))" -eq 0 ]; then
  pass "chmod -R go-w clears world-writable bit (mode=$dir_mode)"
else
  fail "chmod -R go-w left world-writable bit set (mode=$dir_mode)"
fi
rm -rf "$PERM_TMP"

# openclaw >=5.x gates raw conversation hooks (llm_output usage tracking,
# before_agent_reply budget enforcement) behind allowConversationAccess for
# non-bundled plugins. entrypoint's config patch must grant it.
if grep -q 'allowConversationAccess = true' "$GATEWAY_DIR/entrypoint.sh"; then
  pass "entrypoint.sh grants hq-bootstrap conversation access"
else
  fail "entrypoint.sh should grant hq-bootstrap hooks.allowConversationAccess (openclaw 5.x hook gate)"
fi

# openclaw >=5.x requires channels.telegram.streaming to be an object; the
# legacy string form blocks gateway startup with a config validation error.
if grep -q 'channels.telegram.streaming //= "partial"' "$GATEWAY_DIR/entrypoint.sh"; then
  fail "entrypoint.sh still sets telegram.streaming to a string (breaks openclaw 5.x startup)"
elif grep -q 'mode: "partial"' "$GATEWAY_DIR/entrypoint.sh"; then
  pass "entrypoint.sh sets telegram.streaming to object form"
else
  fail "entrypoint.sh should set telegram.streaming to object form {mode: ...}"
fi

# ── Plugin manifest checks ───────────────────────────────────────────

echo ""
echo "Plugin manifest checks:"

MANIFEST="$GATEWAY_DIR/scripts/plugins/hq-bootstrap/openclaw.plugin.json"
if [ -f "$MANIFEST" ]; then
  # Must be valid JSON.
  if python3 -c "import json,sys; json.load(open('$MANIFEST'))" 2>/dev/null; then
    pass "hq-bootstrap manifest is valid JSON"
  else
    fail "hq-bootstrap manifest is not valid JSON"
  fi
  # openclaw >=5.x lazily activates plugins; without activation.onStartup the
  # plugin loads but register() never runs and no hooks fire.
  if python3 -c "import json,sys; sys.exit(0 if json.load(open('$MANIFEST')).get('activation',{}).get('onStartup') is True else 1)" 2>/dev/null; then
    pass "hq-bootstrap manifest declares activation.onStartup=true"
  else
    fail "hq-bootstrap manifest should declare activation.onStartup=true (openclaw 5.x lazy activation)"
  fi
else
  fail "hq-bootstrap manifest not found at $MANIFEST"
fi

# openclaw >=5.x renamed usage fields to camelCase; the plugin must read the
# new names or token counts record as 0.
PLUGIN_TS="$GATEWAY_DIR/scripts/plugins/hq-bootstrap/index.ts"
if [ -f "$PLUGIN_TS" ] && grep -q 'usage.input ??' "$PLUGIN_TS" && grep -q 'usage.totalTokens ??' "$PLUGIN_TS"; then
  pass "hq-bootstrap reads openclaw 5.x camelCase usage fields"
else
  fail "hq-bootstrap should read usage.input/usage.totalTokens (openclaw 5.x field rename)"
fi

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  echo -e "\nFailures:$ERRORS"
  exit 1
fi
