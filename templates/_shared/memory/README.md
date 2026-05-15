# Memory Usage Guide

Use the memory system in three layers.

## 1) `MEMORY.md`
Curated long-term memory.

Put only:
- durable preferences
- architecture decisions
- stable workflow lessons
- important context about your human
- rules future sessions should remember

Do not put:
- raw transcripts
- temporary debugging output
- one-off artifacts
- secrets

## 2) `memory/YYYY-MM-DD.md`
Daily notes and recent continuity.

Put:
- what happened today
- temporary context for the next session
- unresolved follow-ups
- fresh discoveries that may later be promoted

Keep entries compact and factual.

## 3) `history/YYYY-MM-DD_<topic>.md`
Durable operational writeups.

Use for:
- multi-step changes
- architecture moves
- debugging breakthroughs
- meaningful runs
- reusable lessons

## Promotion checklist

When reviewing a session or recent notes, ask:
1. Did we make a lasting decision?
2. Did we learn a repeated reliability lesson?
3. Did the human express a preference that should stick?
4. Did the architecture, workflow, or system boundary change?
5. Is there a mistake future-you should avoid repeating?

If yes to any, promote the distilled lesson into `MEMORY.md`.

## Rule of thumb
- Source of truth for how things work → Supabase documents, scripts, skills
- Durable memory of what should be remembered → `MEMORY.md`
- Recent continuity → `memory/YYYY-MM-DD.md`
- Operational narrative → `history/`
- Shared knowledge → Supabase documents (not git)