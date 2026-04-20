# Documents

Knowledge base for long-form, editable content. Humans edit via a Notion-style rich editor (Novel/Tiptap); agents read and write via Supabase. Tag a document with `boot:all` or `boot:<agent-slug>` to have it auto-load as agent context at startup.

For short files, uploads, SOPs, and external links, use [assets](./ASSETS.md) instead.

---

## Tables

### `document_folders` — Folder hierarchy

| Column | Notes |
|---|---|
| `id` | PK |
| `parent_id` | FK self, cascade delete |
| `name` | |
| `icon` | Optional emoji |
| `sort_order` | |

### `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `folder_id` | uuid FK | Nullable (null = root). SET NULL on folder delete. |
| `title` | text | |
| `content` | jsonb | **Tiptap JSON** (native jsonb) |
| `icon` | text | Optional emoji |
| `tags` | text[] | Includes boot tags (see below) |
| `meta` | jsonb | |
| `pinned` | boolean | Pin to top of list |
| `archived_at` | timestamptz | Soft delete |
| `last_edited_by` | text | Human name or agent slug |
| `embedding` | vector(1536) | pgvector embedding for semantic search |

---

## Tags

Both kinds of tags live in the same `tags text[]` array.

### Boot tags — agent context

Boot tags control which documents agents auto-load at startup. They have system meaning:

| Tag | Loaded by |
|---|---|
| `boot:all` | Every agent |
| `boot:<agent-slug>` | Only that agent (e.g. `boot:research-scout`) |

**How agents use boot tags:**

1. Query: `tags.cs.{boot:all}` OR `tags.cs.{boot:<slug>}`
2. Read the matching documents
3. Treat them as baseline context for the session

**UI management:**

- **Document editor** — dedicated context section ([boot-tag-manager.tsx](../src/components/documents/boot-tag-manager.tsx)) separate from freeform tags
- **Document list** — purple badges showing context status
- **Documents page** — context filter dropdown (`all agents` / specific agent / none)
- **Agent detail page** — lists the documents that load for that agent

### Regular tags

Everything else — freeform lowercase strings for human organization and tag-based search. Examples: `onboarding`, `playbook`, `brand-voice`, `research`.

Agents can fetch by tag directly: `supabase.table("documents").select("*").contains("tags", ["playbook"])`.

---

## Content format

Document content is stored as **Tiptap JSON** (the editor's native format) in the `content` jsonb column — a structured representation of the document tree.

### Reading as an agent

```python
doc = supabase.table("documents").select("*").eq("id", doc_id).single().execute()
content_json = doc.data["content"]   # Tiptap JSONContent (already a dict — jsonb column)
```

### Writing as an agent

**Option 1: Write markdown (simplest).** Wrap a markdown string in paragraph nodes and the editor will auto-convert it to proper Tiptap JSON on load. Re-saves then keep the structured form.

```python
import json

markdown_text = """# My Document

First paragraph.

## Section

- Item 1
- Item 2

> Blockquote.

```python
print("code blocks work too")
```
"""

content = {
    "type": "doc",
    "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": line}]}
        for line in markdown_text.strip().split("\n")
    ],
}

supabase.table("documents").update({"content": content}).eq("id", doc_id).execute()
```

**Option 2: Write Tiptap JSON directly.** Full control over structure:

```python
content = {
    "type": "doc",
    "content": [
        {"type": "heading", "attrs": {"level": 1},
         "content": [{"type": "text", "text": "My Document"}]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": "First paragraph."}]},
        {"type": "bulletList", "content": [
            {"type": "listItem", "content": [
                {"type": "paragraph",
                 "content": [{"type": "text", "text": "Item 1"}]}
            ]}
        ]},
    ],
}

supabase.table("documents").update({"content": content}).eq("id", doc_id).execute()
```

> When a document with markdown-in-paragraphs is opened in the editor, it's auto-converted to proper Tiptap JSON and saved back. Subsequent loads use the structured form directly.

---

## API examples

### Create a folder

```python
supabase.table("document_folders").insert({
    "name": "Playbooks",
    "icon": "📘",
}).execute()
```

### Create a document

```python
supabase.table("documents").insert({
    "title": "Onboarding guide",
    "folder_id": folder_id,
    "content": "",
    "tags": ["onboarding"],
    "last_edited_by": "research-scout",
}).execute()
```

### Query by folder

```python
docs = supabase.table("documents").select(
    "*, folder:document_folders(id, name)"
).eq("folder_id", folder_id).is_("archived_at", None).order("pinned", desc=True).order("updated_at", desc=True).execute()
```

### Search by tag

```python
docs = supabase.table("documents").select("*").contains("tags", ["playbook"]).execute()
```

### Fetch boot documents for an agent

```python
slug = "research-scout"
docs = supabase.table("documents").select(
    "id, title, content, tags"
).or_(f"tags.cs.{{boot:all}},tags.cs.{{boot:{slug}}}").execute()
```

### Set boot tags

```python
supabase.table("documents").update({
    "tags": ["boot:all", "onboarding"],
}).eq("id", doc_id).execute()
```

### Update content

```python
supabase.table("documents").update({
    "content": new_content_json,
    "last_edited_by": "research-scout",
}).eq("id", doc_id).execute()
```

### Pin a document

```python
supabase.table("documents").update({"pinned": True}).eq("id", doc_id).execute()
```

### Semantic search (pgvector)

The `search_documents` RPC performs cosine-similarity search over `documents.embedding`:

```python
results = supabase.rpc("search_documents", {
    "query_embedding": embedding_vector,
    "match_count": 10,
    "filter_tags": None,
    "filter_folder_id": None,
}).execute()
```

---

## Tiptap node types reference

Common node types used in `content`:

| Type | Description |
|---|---|
| `doc` | Root document node |
| `paragraph` | Text paragraph |
| `heading` | attrs: `level` (1–3) |
| `bulletList` / `orderedList` | List containers |
| `listItem` | List item |
| `taskList` / `taskItem` | Checkbox list (`attrs.checked`) |
| `codeBlock` | attrs: `language` |
| `blockquote` | |
| `horizontalRule` | |
| `image` | attrs: `src`, `alt`, `title` |

### Text marks (inline formatting)

| Mark | Description |
|---|---|
| `bold` | |
| `italic` | |
| `underline` | |
| `strike` | |
| `code` | Inline code |
| `link` | attrs: `href`, `target` |
