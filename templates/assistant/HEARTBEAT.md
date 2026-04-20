# HEARTBEAT.md

Use heartbeats for light maintenance, not constant writing.

## Periodic checks
# Check for tasks assigned to me that are still in 'todo' status.
# Check for @mentions in task comments I haven't responded to.

## Memory + history maintenance
- On ordinary heartbeats: do a cheap check only. If nothing meaningful changed, reply `HEARTBEAT_OK`.
- Every 1-2 days: check whether meaningful work happened without a `history/` summary. Write one if so.
- Every 2-3 days: review recent `memory/` and `history/` files; promote durable lessons into `MEMORY.md`.
- Every 5-7 days: prune stale or superseded items from `MEMORY.md`.

## Rules
- Prefer small, deliberate edits over frequent noisy updates.
- Do not create history files for trivial work.
- Do not dump raw logs into `MEMORY.md`.
- If a session produced reusable value and lacks a summary, write one concise `history/YYYY-MM-DD_<topic>.md` file.

## Git-aware maintenance
- After a real maintenance pass with meaningful tracked changes, commit and push a clean change set.
- Do not force commits when the change boundary is noisy or mixed.
