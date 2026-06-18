---
name: hq
description: Connect to the HQ via Supabase. Use when you need to register yourself, search knowledge, create/update pages and skills, claim tasks, post comments, manage contacts and organizations, log interactions, or query the audit trail. Also use at session startup to register and load boot knowledge.
---

# HQ

You are connected to a Supabase-backed HQ. This skill provides helper scripts for all operations.

**Important:** Run all commands exactly as shown — do not wrap them in `cd`, `bash -c`, or shell chaining (`&&`, `;`). Your working directory is already set to your workspace.

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

### 2. Load boot knowledge
```bash
python3 skills/hq/scripts/hq_boot_docs.py
```
This fetches workspace-scoped knowledge items (shared context for all agents) and your agent-scoped items (index only). Read the output — it's your shared context.

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

## Knowledge

### Search knowledge (semantic + full-text fallback)
```bash
python3 skills/hq/scripts/hq_search_docs.py "your natural language query"
```
Optional flags: `--tags tag1,tag2` `--folder-id UUID` `--kind page` `--limit 5`

Kind filter: `page`, `skill`, `file`, `source`. Returns matched knowledge items ranked by similarity.

### Create a knowledge item
```bash
python3 skills/hq/scripts/hq_create_doc.py --title "Title" --content "Content here" --tags tag1,tag2
```
Optional: `--kind skill` (default: page), `--scope agent` (default: workspace), `--folder-id UUID`

Automatically requests a local embedding on creation.

### Update a knowledge item
```bash
python3 skills/hq/scripts/hq_update_doc.py ITEM_ID --title "New title" --content "New content" --tags tag1,tag2
```
Automatically re-embeds on update.

### Get a specific knowledge item
```bash
python3 skills/hq/scripts/hq_get_doc.py ITEM_ID
```

### Get knowledge items by tag
```bash
python3 skills/hq/scripts/hq_get_docs_by_tag.py TAG_NAME
```

### List connected sources
```bash
python3 skills/hq/scripts/hq_list_sources.py
```
Shows what external systems (Notion, Google Drive, etc.) are connected to the workspace, whether they support writes, and how many items are synced from each.

### Write to a connected source
```bash
python3 skills/hq/scripts/hq_write_source.py \
  --connection-id UUID \
  --action create_item \
  --params '{"title": "Meeting Notes", "content": "# Summary\n...", "parent_id": "PARENT_UUID"}'
```
Creates content in the connected external system. Only works if the connection is writable. Check `hq_list_sources.py` first. The command is routed through the gateway command queue.

### Knowledge vs source decision
- **Search results include sources.** When you search knowledge, source items appear with their provider and source URL. Read them like any knowledge item.
- **Don't duplicate.** If content already exists as a synced source (e.g., a Notion page), don't create a duplicate knowledge page. Reference the source item instead.
- **Write to the right place.** If the user's workflow lives in Notion and the connection is writable, prefer writing there over creating a knowledge page. If the connection is read-only, create a knowledge page and mention that the user may want to move it to Notion.

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

### Attach a reference to a task
```bash
python3 skills/hq/scripts/hq_attach_to_task.py TASK_ID --type knowledge_item --entity-id DOC_UUID
python3 skills/hq/scripts/hq_attach_to_task.py TASK_ID --type url --url "https://example.com" --label "Reference"
```
Use this for references — existing documents, links, or contacts that provide context for the task. These are NOT deliverables and don't go through review.

### Submit a deliverable for review
```bash
python3 skills/hq/scripts/hq_submit_deliverable.py --task-id TASK_ID --type page --title "Blog post draft" --content "Your markdown content"
python3 skills/hq/scripts/hq_submit_deliverable.py --task-id TASK_ID --type url --url "https://github.com/org/repo/pull/42" --title "PR #42"
```
Use this when the task asks you to **produce something** — a document, a draft, a report, a PR. The human will review it (approve, request revision, or reject). Deliverables appear in a dedicated review section on the task.

**When to use deliverables vs knowledge:**
- You produced content for a task (any task, any content) → **deliverable** (`hq_submit_deliverable.py`). This includes research summaries, drafts, reports, guides — anything the human should be able to review.
- You're saving something independent of any task (learned a skill, noting reference material for later) → **knowledge** (`hq_create_doc.py`)
- You need to attach an existing document or link as context for a task → **attachment** (`hq_attach_to_task.py`)

### Revise a deliverable after feedback
```bash
python3 skills/hq/scripts/hq_submit_deliverable.py --task-id TASK_ID --update --deliverable-id LINK_UUID --title "Blog post draft" --content "Revised content"
```
This updates the knowledge item content and resets the review status to `draft` so the human can re-review.

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
3. Do the work — if you produce any content (documents, drafts, reports), submit it as a deliverable (`hq_submit_deliverable.py`)
4. If you submitted deliverables: **STOP — do NOT call `hq_complete_task.py`**. Leave the task in `in_progress`, comment that you've submitted your work for review, mark the inbox item done, and exit. The human reviews and approves deliverables; the system auto-completes the task when all are approved.
5. If no deliverables (e.g. a simple action or question): complete it directly with `hq_complete_task.py TASK_ID`
6. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

**IMPORTANT**: When you submit a deliverable, you MUST NOT complete the task. Completing a task that has pending deliverables bypasses human review. Only call `hq_complete_task.py` when the task has zero deliverables.

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

For **routine_schedule** and **routine_event** items:
See the **Routines** section below for handling details.

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
Sets task to `blocked`, posts a comment mentioning the workspace owner, sends Telegram notification. Then mark the inbox item done and move on.

### Inbox discipline
- **"Done" means the intake was handled**, not that the underlying task is finished. Triage it, acknowledge it, start it — then mark the inbox item done.
- **Process sequentially.** Lease one item, handle it, mark it, then lease the next.
- **Don't stall.** If stuck for more than ~2 minutes, escalate and move on.
- **Batch up to 3 items per wake** or up to 2 minutes of processing, whichever comes first.
- **Foreground stays clean.** Never inject inbox work into a live human conversation.

## Routines

Routines are recurring agent behaviors — scheduled checks and event-driven reactions. When a routine fires, it creates an inbox item that wakes you.

### Handling routine inbox items

For **deliverable_review** items:
1. Read `context.review_status` and `context.review_note`
2. If `revision_requested`: revise the deliverable using `hq_submit_deliverable.py --update --deliverable-id DELIVERABLE_ID --title "..." --content "revised content"` incorporating the feedback from `review_note`
3. If `rejected`: read the note, comment on the task acknowledging the feedback
4. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

Note: when all deliverables on a task are approved, the task is auto-completed by the system. You don't need to handle the `approved` case.

For **routine_schedule** items:
1. Read the instruction from `context.instruction` — it tells you what to do
2. Execute the instruction
3. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

For **routine_event** items:
1. Read the instruction from `context.instruction` and the entity context (`context.entity_type`, `context.entity_id`, `context.field`, `context.old_value`, `context.new_value`)
2. Execute the instruction using the provided context — for contact events, the full contact record is enriched automatically
3. Mark inbox item done: `python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID`

### When to create a routine

- User asks for something **recurring** ("every 30 minutes", "daily at 9am", "every Monday") → create a **schedule** routine
- User asks you to **react** to changes ("whenever a new contact is created", "when a task status changes") → create an **event** routine
- You discover a pattern you should monitor → **propose** the routine to the user first, don't create silently
- User asks for a **one-time** action → just do it, don't create a routine

### Create or update a routine

Schedule routine:
```bash
python3 skills/hq/scripts/hq_routine_upsert.py \
  --name "Check email" \
  --instruction "Check inbox for emails from john@acme.com and create tasks for action items" \
  --trigger-type schedule \
  --cadence-type every_n_minutes --interval-n 30 \
  --timezone America/New_York
```

Event routine:
```bash
python3 skills/hq/scripts/hq_routine_upsert.py \
  --name "New contact alert" \
  --instruction "Research {name} and update their profile with LinkedIn data" \
  --trigger-type event \
  --entity-type contact --condition created
```

Update an existing routine:
```bash
python3 skills/hq/scripts/hq_routine_upsert.py \
  --routine-id UUID \
  --name "Check email" \
  --instruction "Check inbox for emails from john@acme.com" \
  --trigger-type schedule \
  --cadence-type every_n_hours --interval-n 1 \
  --timezone America/New_York
```

Schedule cadence types: `every_n_minutes`, `every_n_hours`, `daily`, `weekdays`, `weekly`, `monthly`, `every_n_days`

Event entity types: `contact`, `collection_record`, `knowledge_item`, `task`

Event conditions: `created`, `changed_to`, `changed_from`, `any_change`

Additional event flags: `--field FIELD_NAME`, `--value VALUE` (for changed_to/changed_from), `--collection-id UUID` (for collection_record)

### List your routines
```bash
python3 skills/hq/scripts/hq_routine_list.py
python3 skills/hq/scripts/hq_routine_list.py --active-only
python3 skills/hq/scripts/hq_routine_list.py --trigger-type schedule
```

### Delete a routine
```bash
python3 skills/hq/scripts/hq_routine_delete.py ROUTINE_ID
```

### Routine discipline
- **Confirm before creating.** Tell the user what routine you're about to create and get a thumbs-up, especially for high-frequency schedules.
- **Set clear instructions.** The instruction field is what you'll see when the routine fires — make it actionable.
- **Use appropriate cadences.** Don't set every_n_minutes to 1 — that's 1,440 wakes per day. Match frequency to urgency.
- **Check existing routines first.** Run `hq_routine_list.py` before creating to avoid duplicates.
- **Clean up when asked.** If the user says to stop a recurring behavior, delete the routine — don't just ignore inbox items.

## Learning & Skills

You maintain skills — reusable procedures for work you do repeatedly. Your human can see what you've learned on your agent detail page.

### When to create a new skill
- You've done the same sequence 3+ times successfully
- You figured out a non-obvious method through trial and error (e.g. discovered that YouTube research requires checking channel "About" pages)
- The user gave you a reusable instruction that isn't already documented

### When to update an existing skill
- You discovered a better approach than what's documented
- The user corrected you — encode their preference immediately
- A step no longer works and you found a fix

### When NOT to update
- You're still experimenting / the approach isn't proven yet
- It's a one-off edge case unlikely to recur
- The user is actively editing your skills (wait until they're done)

### Create a new skill
```bash
python3 skills/hq/scripts/hq_skill_upsert.py \
  --title "Research Skill" \
  --content "## Finding Decision Makers\n1. Start with LinkedIn..." \
  --reason "Codified after 3 successful research tasks" \
  --tags research,linkedin
```

### Update an existing skill
```bash
python3 skills/hq/scripts/hq_skill_upsert.py \
  --item-id SKILL_UUID \
  --title "Research Skill" \
  --content "## Finding Decision Makers\n1. Start with YouTube..." \
  --reason "Added YouTube channel research method"
```

### Find your existing skills
```bash
python3 skills/hq/scripts/hq_search_docs.py "research" --kind skill
```

The `--reason` is important: it's shown to your human on the agent detail page so they can see what you learned and why. Keep it to one sentence.

## Rules

- **Every write must be audited.** Use the audited helpers, not raw Supabase queries.
- **Embeddings are local.** Use the knowledge scripts; no embedding API key is required.
- **Search knowledge before asking.** The knowledge base is in Supabase and search returns matched items ranked by similarity.
- **Discover fields before writing.** Fetch `field_definitions` to know what extended fields exist and what they mean.
- **Use valid pipeline stages.** Fetch `pipeline_stages` before setting a contact's status.
- **When you claim a task, read its attachments.** They're fetched automatically.
- **Create knowledge items for reusable info.** Use `--kind skill` for SOPs and instructions, `--kind page` for general notes.
- **Learn as you work.** When you discover a reusable method, save it as a skill using `hq_skill_upsert.py`.
- **Process your inbox without babysitting.** When woken, work through items before going idle.
- **Escalate to unblock.** Don't sit on a stuck item — escalate and move to the next one.
