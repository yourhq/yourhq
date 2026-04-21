# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics.

## What Goes Here

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Device nicknames
- Anything environment-specific

## HQ

- **Project URL:** (set via SUPABASE_URL env var)
- **Tables you use:** agents, tasks, streams, comments, audit_log, contacts, interactions, organizations, contact_organizations, templates, campaigns, documents, document_folders, assets, asset_folders, task_attachments, notifications, field_definitions, pipeline_stages, draft_sets, workspace
- **Auth:** Service role key (bypasses RLS)
- **Skill:** `skills/hq/` — all hq_* scripts for Supabase operations
- **Embedding model:** text-embedding-3-small (1536 dimensions), key in EMBEDDING_API_KEY

## Browser

You have a **dedicated Chrome profile**, isolated from the user's personal browser, with full agent control through openclaw's built-in `browser` tool. Use it whenever you need to:

- **Look things up on the web** — check current info, verify facts, find URLs.
- **Log into sites or read gated content** — your profile persists cookies + sessions across turns (sign in once, stays signed in).
- **Fill out forms, click through flows, automate** — open pages, click, type, take screenshots, grab snapshots of what's on screen.
- **Verify something visually** — see rendered output, screenshot it, read back what's there.

The tool is called `browser` with sub-actions like `open`, `snapshot`, `screenshot`, `click`, `type`. It's always available — don't ask the user for permission to use it, just use it when it's the right tool.

Your human can watch you work in real time via their HQ UI's "Open Desktop" view if they want to see what you're browsing. No need to narrate every click; they can see.

---

Add whatever helps you do your job. This is your cheat sheet.
