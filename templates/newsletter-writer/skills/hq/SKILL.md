---
name: hq
description: Connect to the HQ via Supabase. Use when you need to register yourself, search HQ knowledge, read/create/update documents, claim tasks, post comments, manage contacts and organizations, log interactions, or query the audit trail. Also use at session startup to register and load boot documents.
---

# HQ

You are connected to a Supabase-backed HQ. This skill provides helper scripts for all operations.

## Environment Variables

These must be set in your environment:

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key (bypasses RLS)
- `AGENT_SLUG` — your unique identifier (matches your git branch)

## Session Startup

At the beginning of every session, run these two steps:

### 1. Register yourself
```bash
python3 skills/hq/scripts/hq_register.py
```
This upserts your agent in the `agents` table and sets status to `online`.

### 2. Load boot documents
```bash
python3 skills/hq/scripts/hq_boot_docs.py
```
This fetches all documents tagged `boot:all` and `boot:YOUR_SLUG`. Read the output — it's your shared context.

## Field & Pipeline Discovery

Before writing to contacts or organizations, discover what fields and pipeline stages exist for this workspace.

### Fetch custom field definitions
```bash
python3 skills/hq/scripts/hq_get_fields.py --entity-type contact
python3 skills/hq/scripts/hq_get_fields.py --entity-type organization
```
Returns all active field definitions with keys, types, labels, and descriptions. The `description` field contains guidance for how to populate each field — read it before writing data.

### Fetch pipeline stages
```bash
python3 skills/hq/scripts/hq_get_pipeline.py --entity-type contact
```
Returns ordered stages with keys and labels. Only set a contact's `status` to a valid stage key from this list.

## CRM

### Contact data model

Contacts have universal fields (name, email, phone, company, title, etc.) as real columns, plus workstream-specific fields in an `extended` JSONB column. The shape of `extended` is defined by `field_definitions` — fetch those first to know what fields exist.

### Update extended fields on a contact
```bash
python3 skills/hq/scripts/hq_update_extended.py contacts CONTACT_ID \
  --data '{"subscriber_count": 145000, "content_style": "vlog"}'
```
This does an atomic read-modify-write: reads the current `extended`, merges your new fields, validates keys against `field_definitions`, and writes back. Unknown field keys are rejected.

To skip validation (for ad-hoc fields): `--no-validate`

### Log an interaction
```bash
python3 skills/hq/scripts/hq_log_interaction.py CONTACT_ID \
  --type email --direction outbound \
  --summary "Sent initial outreach" \
  --next-action "Follow up if no reply" --next-action-days 7
```
Types: `email`, `call`, `meeting`, `linkedin_message`, `dm`, `intro`, `coffee`, `event`, `note`, `other`

Direction: `inbound`, `outbound`, or omit for neutral (meetings, events).

Optional: `--channel`, `--subject`, `--body`, `--org-id`, `--template-id`

### Create an organization
```bash
python3 skills/hq/scripts/hq_create_org.py --name "Acme Corp" --type company \
  --website "https://acme.com" --industry "Aviation"
```
Optional: `--location`, `--description`, `--tags tag1,tag2`, `--extended '{"key": "val"}'`

### Link a contact to an organization
```bash
python3 skills/hq/scripts/hq_link_contact_org.py CONTACT_ID ORG_ID --role "CEO"
```

### Update extended fields on an organization
```bash
python3 skills/hq/scripts/hq_update_extended.py organizations ORG_ID \
  --data '{"deal_value": 50000}'
```

## Knowledge & Documents

### Search HQ knowledge (semantic chunks + full-text fallback)
```bash
python3 skills/hq/scripts/hq_search_docs.py "your natural language query"
```
Optional flags: `--tags tag1,tag2` `--folder-id UUID` `--source-type document` `--limit 5`

Returns grouped sources with matched chunks/snippets. It uses local BGE semantic search when the embedder is available and indexed PostgreSQL full-text chunk search as the fallback.

### Get an indexed knowledge source
```bash
python3 skills/hq/scripts/hq_get_knowledge_source.py SOURCE_ID
```
Use the `knowledge_source_id` returned by search or task attachments.

### Get chunks for a knowledge source
```bash
python3 skills/hq/scripts/hq_get_knowledge_chunks.py SOURCE_ID
python3 skills/hq/scripts/hq_get_knowledge_chunks.py SOURCE_ID --query "specific topic"
```
Use this when a task or search result references a long document and you need more surrounding sections without loading the full native document.

### Get a specific document
```bash
python3 skills/hq/scripts/hq_get_doc.py DOCUMENT_ID
```

### Get documents by tag
```bash
python3 skills/hq/scripts/hq_get_docs_by_tag.py TAG_NAME
```

### Create a document
```bash
python3 skills/hq/scripts/hq_create_doc.py --title "Title" --content "Content here" --tags tag1,tag2
```
Optional: `--folder-id UUID`

Automatically requests a local HQ embedding on creation; the background embedder indexes it if unavailable.

### Update a document
```bash
python3 skills/hq/scripts/hq_update_doc.py DOCUMENT_ID --title "New title" --content "New content" --tags tag1,tag2
```
Automatically requests a local HQ embedding; the background embedder reindexes it if unavailable.

## Tasks

### List tasks
```bash
python3 skills/hq/scripts/hq_list_tasks.py
python3 skills/hq/scripts/hq_list_tasks.py --mine --status todo,in_progress
python3 skills/hq/scripts/hq_list_tasks.py --assignee-type human
python3 skills/hq/scripts/hq_list_tasks.py --stream-id STREAM_UUID --tag product
```
Useful filters: `--status`, `--stream-id`, `--assignee-type`, `--agent-id`, `--mine`, `--tag`, `--limit`

### List my assigned tasks
```bash
python3 skills/hq/scripts/hq_my_tasks.py
```
Optional: `--status todo,in_progress`

### Claim a task
```bash
python3 skills/hq/scripts/hq_claim_task.py TASK_ID
```
Sets status to `in_progress`, assigns you, and fetches attached source metadata plus top relevant chunks for document attachments. Use `hq_get_knowledge_chunks.py SOURCE_ID` or `hq_get_doc.py DOCUMENT_ID` if you need more context.

### Assign a task
```bash
python3 skills/hq/scripts/hq_assign_task.py TASK_ID --agent-id AGENT_UUID
python3 skills/hq/scripts/hq_assign_task.py TASK_ID --human
```
Assigns a task to either an agent or marks it as assigned to a human.

### List tasks for humans
```bash
python3 skills/hq/scripts/hq_my_human_tasks.py
```
Optional: `--status todo,in_progress`

Note: `hq_list_tasks.py --assignee-type human` is the more general version.

### Complete a task
```bash
python3 skills/hq/scripts/hq_complete_task.py TASK_ID
```

### Attach a document/asset/URL to a task
```bash
python3 skills/hq/scripts/hq_attach_to_task.py TASK_ID --type document --entity-id DOC_UUID
python3 skills/hq/scripts/hq_attach_to_task.py TASK_ID --type url --url "https://example.com" --label "Reference"
```

## Comments

### Post a comment on any entity
```bash
python3 skills/hq/scripts/hq_comment_on.py task TASK_ID "Your comment here"
python3 skills/hq/scripts/hq_comment_on.py contact CONTACT_ID "Research notes from browser verification"
python3 skills/hq/scripts/hq_comment_on.py organization ORG_ID "Meeting summary"
```
Optional: `--parent-id COMMENT_UUID` for replies.

@mentions are parsed automatically from the comment body.

## Audited Writes

### Insert a record (any table)
```bash
python3 skills/hq/scripts/hq_insert.py TABLE --data '{"field": "value"}' --module MODULE --entity-type TYPE
```

### Update a record (any table)
```bash
python3 skills/hq/scripts/hq_update.py TABLE RECORD_ID --data '{"field": "value"}' --module MODULE --entity-type TYPE
```

Both commands automatically create audit_log entries with your agent identity.

## Heartbeat

### Send a heartbeat
```bash
python3 skills/hq/scripts/hq_heartbeat.py
```
Updates `last_seen_at` and sets status to `online`. Run this during heartbeat polls.

### Set status
```bash
python3 skills/hq/scripts/hq_heartbeat.py --status paused
```

## Background Inbox

You have a durable inbox. When tasks are assigned to you, you're @mentioned in a comment, or a contact automation fires, an inbox item is created automatically. A background dispatcher wakes you when new items arrive.

Your foreground conversation with your human is never interrupted. Inbox work happens in a separate background session.

### Check inbox status
```bash
python3 skills/hq/scripts/hq_inbox_process.py --status
```
Shows pending, failed, and leased item counts.

### Process inbox items
```bash
python3 skills/hq/scripts/hq_inbox_process.py
```
Leases the next pending item and returns it with full context. Process up to 3 items per wake:
```bash
python3 skills/hq/scripts/hq_inbox_process.py --batch 3
```

### Handle each item

For **task_assignment** and **task_reassignment** items:
1. Read the task description and attachments (provided in context)
2. Claim the task: `python3 skills/hq/scripts/hq_claim_task.py TASK_ID`
3. Do the work
4. Complete it: `python3 skills/hq/scripts/hq_complete_task.py TASK_ID`
5. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

For **task_comment_mention** items:
1. Read the comment and context (provided in context — includes entity_type and entity_id)
2. Respond: `python3 skills/hq/scripts/hq_comment_on.py task TASK_ID "Your response"`
3. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

For **contact_status_changed** items:
1. Read the contact record (provided in context — custom fields are in `extended`)
2. Fetch field definitions if needed: `python3 skills/hq/scripts/hq_get_fields.py --entity-type contact`
3. Run the appropriate workflow for the new status — check your TOOLS.md for agent-specific instructions
4. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

For **contact_created** items:
1. Read the contact record (provided in context)
2. Assess whether the contact needs action from you
3. Take action or skip
4. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

### Mark items done or failed
```bash
python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID
python3 skills/hq/scripts/hq_inbox_fail.py INBOX_ITEM_ID "reason"
```
Failed items retry automatically (up to 3 attempts). After that, they go to dead letter.

### Escalate
```bash
python3 skills/hq/scripts/hq_escalate.py TASK_ID "Reason you're blocked"
```
Sets task to `blocked`, posts a comment mentioning @prajoth, sends Telegram notification. Then mark the inbox item done and move on.

### Inbox discipline
- **"Done" means the intake was handled**, not that the underlying task is finished. Triage it, acknowledge it, start it — then mark the inbox item done.
- **Process sequentially.** Lease one item, handle it, mark it, then lease the next.
- **Don't stall.** If stuck for more than ~2 minutes, escalate and move on.
- **Batch up to 3 items per wake** or up to 2 minutes of processing, whichever comes first.
- **Foreground stays clean.** Never inject inbox work into a live human conversation.

## Rules

- **Every write must be audited.** Use the audited helpers, not raw Supabase queries.
- **Document embeddings are local.** Use the HQ document scripts; no embedding API key is required.
- **Search HQ knowledge before asking.** The knowledge base is in Supabase and search returns exact matched sections when available.
- **Discover fields before writing.** Fetch `field_definitions` to know what extended fields exist and what they mean.
- **Use valid pipeline stages.** Fetch `pipeline_stages` before setting a contact's status.
- **When you claim a task, read its attachments.** They're fetched automatically.
- **Create documents for reusable knowledge.** Don't hoard context in chat.
- **Process your inbox without babysitting.** When woken, work through items before going idle.
- **Escalate to unblock.** Don't sit on a stuck item — escalate and move to the next one.
