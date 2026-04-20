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

---

Add whatever helps you do your job. This is your cheat sheet.
