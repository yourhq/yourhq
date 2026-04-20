# Asset Management

File and artifact library — SOPs, research, images, videos, templates, scripts, spreadsheets, links, and anything else. Organized by hierarchical folders.

Assets are distinct from **documents** (rich-text knowledge base, see [DOCUMENTS.md](./DOCUMENTS.md)):
- Use **assets** for files and short content blobs you want to keep alongside the workspace (an SOP, a script snippet, an uploaded image, a reference URL).
- Use **documents** for editable long-form content with rich formatting and agent boot tags.

---

## Tables

### `asset_folders` — Folder hierarchy

| Column | Notes |
|---|---|
| `id` | PK |
| `parent_id` | FK self, cascade delete |
| `name` | |
| `color` | Optional hex |
| `sort_order` | |

### `assets` — Asset items

| Column | Notes |
|---|---|
| `id` | PK |
| `folder_id` | FK, nullable (null = root). SET NULL on folder delete. |
| `name` | Required |
| `description` | |
| `type` | `asset_type` enum — see below |
| `mime_type` | For uploads |
| `file_url` | Supabase Storage path or external URL |
| `file_size` | bytes |
| `content` | Inline text / markdown |
| `tags` | text[] |
| `meta` | jsonb |
| `archived_at` | Soft delete |

## Asset types

| Type | Use for |
|---|---|
| `document` | General documents |
| `sop` | Standard operating procedures |
| `research` | Research notes, analyses |
| `image` | Screenshots, diagrams |
| `video` | Recordings |
| `audio` | Voice notes, podcasts |
| `template` | Reusable formats |
| `script` | Code / automation snippets |
| `spreadsheet` | Tabular data |
| `link` | External URLs |
| `other` | Anything else |

---

## Storage

Uploads live in the Supabase `assets` storage bucket (private). The HQ generates 1-hour signed URLs on demand when rendering [asset-viewer.tsx](../src/components/assets/asset-viewer.tsx).

---

## UI

- List page — [/dashboard/assets](../src/app/dashboard/assets/page.tsx)
  - Folder tree sidebar ([folder-tree.tsx](../src/components/shared/folder-tree.tsx))
  - Grid or list view (localStorage-persisted)
  - Drag-and-drop folder/asset move via dnd-kit
  - File drop zone for quick uploads
- Viewer — [/dashboard/assets/[id]](../src/app/dashboard/assets/[id]/page.tsx)
  - Type-specific preview (inline text, embedded image/video, external link)

---

## API examples

### Create a folder

```python
supabase.table("asset_folders").insert({
    "name": "Playbooks",
    "color": "#3b82f6",
    "sort_order": 0,
}).execute()
```

### Nested folder

```python
supabase.table("asset_folders").insert({
    "name": "Email templates",
    "parent_id": parent_folder_id,
}).execute()
```

### Inline SOP

```python
supabase.table("assets").insert({
    "name": "Weekly review SOP",
    "description": "Agenda and checklist for the weekly review",
    "type": "sop",
    "folder_id": folder_id,
    "content": "# Weekly review\n\n1. Check pipeline health...",
    "tags": ["ops", "weekly"],
}).execute()
```

### External link

```python
supabase.table("assets").insert({
    "name": "Competitor pricing page",
    "type": "link",
    "file_url": "https://example.com/pricing",
    "tags": ["research"],
}).execute()
```

### Query by folder

```python
assets = supabase.table("assets").select(
    "*, folder:asset_folders(id, name)"
).eq("folder_id", folder_id).is_("archived_at", None).order("created_at", desc=True).execute()
```

### Query by type

```python
sops = supabase.table("assets").select("*").eq("type", "sop").is_("archived_at", None).execute()
```

### Search by tags

```python
assets = supabase.table("assets").select("*").contains("tags", ["ops"]).execute()
```

---

## Content modes

Assets support two ways of holding content:

1. **Inline** — stored in the `content` column (text or markdown). Good for SOPs, scripts, short templates.
2. **External URL** — stored in `file_url`. Used for uploads (pointing into the `assets` bucket) or external references.

Both can coexist — a link asset can carry inline notes in `content`.
