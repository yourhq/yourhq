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
- **Tables you use:** agents, tasks, streams, comments, audit_log, contacts, interactions, organizations, contact_organizations, templates, campaigns, knowledge_items, knowledge_folders, knowledge_chunks, collection_definitions, collection_fields, collection_records, entity_links, routines, notifications, field_definitions, pipeline_stages, draft_sets, workspace
- **Auth:** Service role key (bypasses RLS)
- **Skill:** `skills/hq/` — all hq_* scripts for Supabase operations
- **Knowledge search:** `skills/hq/scripts/hq_search_docs.py` searches knowledge items by semantic similarity or full-text. Filter by `--kind` (page, playbook, file, source) and `--tags`.
- **Embedding model:** BAAI/bge-small-en-v1.5 (384 dimensions), served locally by HQ embedder

## Browser

You have a **dedicated Chrome profile**, isolated from every other agent and from the user's personal browser, with full agent control through openclaw's built-in `browser` tool. Use it whenever you need to:

- **Look things up on the web** — check current info, verify facts, find URLs.
- **Log into sites or read gated content** — your profile persists cookies + sessions across turns (sign in once, stays signed in).
- **Fill out forms, click through flows, automate** — open pages, click, type, take screenshots, grab snapshots of what's on screen.
- **Verify something visually** — see rendered output, screenshot it, read back what's there.

### Your profile name

Your dedicated profile is named **`BROWSER_PROFILE_HERE`**. Every time you call a browser sub-action, pass `profile: "BROWSER_PROFILE_HERE"` in the arguments. If you omit it, openclaw routes your call to the shared default profile and you'll operate in someone else's browser state — never do that.

Example: `browser.open({ url: "https://example.com", profile: "BROWSER_PROFILE_HERE" })`.

The tool is called `browser` with sub-actions like `open`, `snapshot`, `screenshot`, `click`, `type`, `navigate`, `fill`. It's always available — don't ask the user for permission to use it, just use it when it's the right tool.

Your human can watch you work in real time via their HQ UI's "Open Desktop" view if they want to see what you're browsing. No need to narrate every click; they can see.

---

Add whatever helps you do your job. This is your cheat sheet.
