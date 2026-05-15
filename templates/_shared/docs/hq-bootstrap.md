# HQ Session Bootstrap

Automatic session-level bootstrap that connects agents to HQ without requiring an explicit user prompt.

## How it works

A global OpenClaw plugin hooks into `before_prompt_build` — a gateway-level hook that runs before the model sees the prompt. On the first prompt build of each session, it:

1. Runs `scripts/hq_session_bootstrap.py` **from the agent's workspace** which:
   - Validates HQ env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
   - Registers/updates the agent in the `agents` table (sets status=online)
   - Fetches pinned knowledge items scoped to workspace (all agents) and agent (this specific agent)
   - Writes a per-session cache to `state/session-bootstrap/{session-id}.json`

2. Injects the pinned knowledge item content into the system prompt via `appendSystemContext`

On subsequent prompt builds in the same session, the cached result is reused — no repeated Supabase calls.

## Architecture

The plugin is installed **globally** at `~/.openclaw/plugins/hq-bootstrap/` (not per-workspace). It runs for all agents. The Python bootstrap script lives in each agent's workspace (inherited from the default branch via `scripts/hq_session_bootstrap.py`), so each agent registers and fetches pinned knowledge items using its own identity.

```
~/.openclaw/plugins/hq-bootstrap/   ← global plugin (one copy)
    index.ts                                     ← before_prompt_build hook
    openclaw.plugin.json
    package.json

~/.openclaw/workspace-{branch}/                  ← per-agent workspace
    scripts/hq_session_bootstrap.py              ← runs per-agent (uses hq_base.py)
    skills/hq/scripts/hq_base.py     ← Supabase HTTP helpers
    state/session-bootstrap/{session-id}.json    ← per-session cache (gitignored)
```

## Error handling

- If bootstrap fails, the plugin retries on the next prompt build (up to 3 attempts)
- After 3 failures, it stops retrying and injects an error notice into context
- Stale state files older than 24 hours are cleaned up automatically

## OpenClaw config

The plugin and its load path are configured automatically by `finalize.sh` during instance setup:

```json
{
  "plugins": {
    "load": {
      "extraDirs": ["~/.openclaw/plugins"]
    },
    "entries": {
      "hq-bootstrap": {
        "enabled": true
      }
    }
  }
}
```

## Dependencies

- Python 3 with access to `skills/hq/scripts/hq_base.py` (Supabase HTTP helpers)
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (set via `~/.openclaw-env`)
- `AGENT_SLUG` is derived from the workspace directory name (cwd)
