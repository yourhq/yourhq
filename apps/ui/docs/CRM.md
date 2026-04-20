# CRM Module

Single-user CRM for managing contacts and the organizations they belong to. Pipeline stages and custom fields are runtime-configurable per entity type via `/dashboard/settings`, so the same module works for any workstream (sales, hiring, creator outreach, investor relations, etc.) without code changes.

Data flows in via the admin UI, via bulk CSV/Excel import, and via the Supabase API directly (agents and automation scripts).

---

## Tables

### `contacts` — Core contact records

Core, always-present fields:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Required |
| `email`, `phone` | text | |
| `linkedin_url`, `twitter_url`, `website_url` | text | |
| `company`, `title`, `location` | text | Lightweight org info — for richer organization data use the `organizations` table and `contact_organizations` link |
| `avatar_url` | text | |
| `how_we_met`, `notes` | text | |
| `tags` | text[] | Freeform tags |
| `status` | text | **Stage key** — validated at app level against `pipeline_stages` rows where `entity_type = 'contact'` |
| `status_changed_at` | timestamptz | |
| `priority` | text \| null | `urgent`, `high`, `medium`, `low` |
| `relationship_strength` | text | `stranger`, `acquaintance`, `warm`, `strong` |
| `last_contact_date` | timestamptz | |
| `source` | text | Discovery/import source |
| `campaign_id` | uuid | FK `campaigns(id)` |
| `extended` | jsonb | **Dynamic fields** — shape defined at runtime by `field_definitions` rows for entity_type = `contact` |
| `archived_at` | timestamptz | Soft delete (null = active) |

The `extended` JSONB column holds all workstream-specific data. You add a field in Settings → Fields and it immediately appears on the form, detail view, and column picker — no code change, no migration.

### `organizations` — Companies, agencies, communities, VC firms, etc.

Same pattern as contacts: core fields + `extended` JSONB driven by `field_definitions` rows for `entity_type = 'organization'`, `status` validated against `pipeline_stages` rows for orgs.

### `contact_organizations` — Many-to-many link

| Column | Notes |
|---|---|
| `contact_id`, `org_id` | FKs, cascade delete |
| `role` | Job title within the org |
| `is_current` | Still at the org? |
| `started_at`, `ended_at` | Tenure |

### `pipeline_stages` — Runtime-configurable status stages

| Column | Notes |
|---|---|
| `entity_type` | `contact` or `organization` |
| `stage_key` | Slug (stored in `contacts.status` / `organizations.status`) |
| `label` | Display label |
| `color` | Hex |
| `sort_order` | Display order |
| `is_terminal` | Dashboard counts terminal stages separately |
| `is_default` | Exactly one default per entity type |

Fetched via [usePipelineStages](../src/hooks/use-pipeline-stages.ts). Managed at `/dashboard/settings/pipeline`.

### `field_definitions` — Runtime-configurable custom fields

| Column | Notes |
|---|---|
| `entity_type` | `contact` or `organization` |
| `field_key` | Key inside the row's `extended` JSONB |
| `field_type` | `text`, `textarea`, `number`, `boolean`, `url`, `select`, `multiselect`, `date` |
| `label`, `description` | UI copy |
| `field_group` | Section heading in forms/detail view |
| `sort_order` | Display order |
| `required`, `is_active` | |
| `options` | For selects/multiselects |

Fetched via [useFieldDefinitions](../src/hooks/use-field-definitions.ts). Rendered polymorphically by [DynamicField](../src/components/shared/dynamic-field.tsx). Managed at `/dashboard/settings/fields`.

### `interactions` — Polymorphic activity timeline

A single timeline for any interaction attached to a contact or organization.

| Column | Notes |
|---|---|
| `contact_id` | FK (nullable if org-scoped) |
| `org_id` | FK (nullable) |
| `type` | `email`, `call`, `meeting`, `linkedin_message`, `dm`, `intro`, `coffee`, `event`, `note`, `other` |
| `direction` | `inbound`, `outbound` |
| `channel` | Free text (email, linkedin, twitter, etc.) |
| `subject`, `summary`, `body` | |
| `occurred_at` | |
| `next_action`, `next_action_date` | Optional follow-up pointer — used by the dashboard "Follow-ups due" card |
| `template_id` | FK templates(id) (optional) |
| `actor_type`, `actor_agent_id` | Who logged it |
| `meta` | jsonb |

Rendered by [interactions-timeline.tsx](../src/components/crm/interactions-timeline.tsx); new entries created via [interaction-form.tsx](../src/components/crm/interaction-form.tsx).

### `templates` — Reusable message templates

| Column | Notes |
|---|---|
| `name`, `body` | Required |
| `channel`, `stage` | e.g. `email` / `initial` |
| `subject` | For email templates |
| `family`, `angle`, `audience` | Optional grouping metadata |
| `overlays` | JSONB — template overrides |
| `is_active`, `use_count` | Use count auto-incremented by `increment_template_use()` trigger |

Placeholder syntax is template-defined (e.g. `{{name}}`, `{{handle}}`) — substitution happens at send time, not in the database.

### `draft_sets` — Message variants (optional)

Three-variant draft system for A/B testing outreach. One set per `(contact_id, channel, stage, version)`. Variants are an array of exactly three `{subject, body, angle, index, notes}` objects; `selected_variant_index` marks the chosen one. Revision chains supported via self-FK `based_on_draft_set_id`.

### `campaigns` — Contact grouping

Groups contacts into outreach batches. Contacts reference campaigns via `campaign_id`.

### `tags` — Tag definitions with colors

Not currently wired to autocomplete — `contacts.tags` and `organizations.tags` are plain `text[]`. Reserved for future tag library UI.

---

## Triggers

| Trigger | Purpose |
|---|---|
| `set_updated_at()` | Keeps `updated_at` current on contacts, organizations, templates, campaigns, interactions |
| `increment_template_use()` | Bumps `templates.use_count` when an interaction references a template |
| `process_contact_automation()` | Evaluates active `automation_rules` on contact insert/update and enqueues `agent_inbox_items` for target agents |

---

## UI

### CRM hub — [/dashboard/crm](../src/app/dashboard/crm/page.tsx)

Tabbed (`?tab=contacts|campaigns|templates`):

- **Contacts** — [contacts-tab.tsx](../src/components/crm/contacts-tab.tsx) orchestrates three view modes:
  - Table — [contacts-table-view.tsx](../src/components/crm/contacts-table-view.tsx) (TanStack React Table, sortable, column toggling)
  - Cards — [contacts-card-view.tsx](../src/components/crm/contacts-card-view.tsx)
  - Kanban — [contacts-kanban-view.tsx](../src/components/crm/contacts-kanban-view.tsx) (drag to change pipeline stage)
- **Campaigns** — [campaigns-tab.tsx](../src/components/crm/campaigns-tab.tsx)
- **Templates** — [templates-tab.tsx](../src/components/crm/templates-tab.tsx)

Filters (URL-synced): pipeline stage, priority, relationship strength, archived toggle, global search. View mode persisted in `localStorage`.

### Contact form — [contact-form.tsx](../src/components/crm/contact-form.tsx)

Right-slide SidePanel with Linear-style progressive disclosure:

1. **Hero** — name (auto-resizing textarea)
2. **Property bar** — inline `h-6` tokens: status (pipeline stage), priority, relationship strength, campaign, last contact date
3. **Core fields** — email, phone, company, title, location, LinkedIn/Twitter/website
4. **Dynamic sections** — grouped `field_definitions` rendered via [DynamicFieldGroups](../src/components/shared/dynamic-field-group.tsx). Groups collapse by default on create, auto-expand when editing with existing data.

### Contact detail — [contact-detail-view.tsx](../src/components/crm/contact-detail-view.tsx)

Full-page view with:
- Inline-editable core fields
- **Organizations** — linked orgs via `contact_organizations` with role and tenure
- **Interactions timeline**
- **Automation history** — rules that fired for this contact
- **Draft sets** — message variants by channel/stage
- Custom field groups (read + edit)

---

## Agent API examples

### Upsert a contact (generic)

```python
supabase.table("contacts").upsert({
    "name": "Sam Rivera",
    "email": "sam@example.com",
    "company": "Acme Inc",
    "status": "researched",           # must match a pipeline_stages.stage_key for entity_type=contact
    "priority": "high",
    "relationship_strength": "warm",
    "source": "linkedin",
    "tags": ["founder", "b2b"],
    "extended": {                     # keys must match field_definitions.field_key
        "funding_stage": "seed",
        "last_funding_amount": 2500000
    }
}, on_conflict="email").execute()
```

### Log an interaction

```python
supabase.table("interactions").insert({
    "contact_id": contact_id,
    "type": "email",
    "direction": "outbound",
    "channel": "email",
    "subject": "Intro",
    "body": "...",
    "occurred_at": datetime.utcnow().isoformat(),
    "next_action": "Send pricing deck",
    "next_action_date": "2026-05-01",
    "actor_type": "agent",
    "actor_agent_id": agent_id,
}).execute()
```

### Discover the current schema before writing

Since pipeline stages and custom fields are runtime-configurable, agents should discover them at startup:

```python
stages  = supabase.table("pipeline_stages").select("*").eq("entity_type", "contact").execute()
fields  = supabase.table("field_definitions").select("*").eq("entity_type", "contact").eq("is_active", True).execute()
```

Use the resulting `stage_key` and `field_key` values when writing — any unknown values will surface as stale filters in the UI and can break kanban columns.

---

## Dashboard integration

- Pipeline card groups contacts by `pipeline_stages` rows for `entity_type = contact`, with terminal stages shown separately.
- "Follow-ups due" shows interactions where `next_action_date <= now()` and no later inbound interaction exists.
- Automation rule fires increment the activity feed.
