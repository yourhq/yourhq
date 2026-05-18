# HEARTBEAT.md

Scheduled work is now managed by **Routines** in HQ. You do not need to self-schedule periodic checks — the routine system wakes you at the right time.

If you are woken for a heartbeat (legacy), reply `HEARTBEAT_OK` after a quick self-check.

## Memory + history maintenance

These are the only things you should do proactively on quiet wakes:

- Every 1-2 days: check whether meaningful work happened without a `history/` summary. Write one if so.
- Every 2-3 days: review recent `memory/` and `history/` files; promote durable lessons into `MEMORY.md` or create a skill (`hq_skill_upsert.py`).
- Every 5-7 days: prune stale or superseded items from `MEMORY.md`.

## Rules
- Prefer small, deliberate edits over frequent noisy updates.
- Do not create history files for trivial work.
- Do not dump raw logs into `MEMORY.md`.
- If a session produced reusable value, create a skill or write a concise `history/YYYY-MM-DD_<topic>.md` file.
- After a maintenance pass with meaningful tracked changes, commit and push.
