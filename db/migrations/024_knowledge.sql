-- 024_knowledge.sql — Knowledge unification.
--
-- Replaces documents + assets with unified knowledge_items.
-- Four kinds: page, playbook, file, source.
-- Scope replaces boot tags: workspace (all agents) or agent (specific agents via junction).

-- ── knowledge_folders ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES knowledge_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  icon        text,
  color       text,
  sort_order  integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_knowledge_folders_tenant ON knowledge_folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_parent ON knowledge_folders(parent_id);

DROP TRIGGER IF EXISTS knowledge_folders_updated_at ON knowledge_folders;
CREATE TRIGGER knowledge_folders_updated_at
  BEFORE UPDATE ON knowledge_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── knowledge_items ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  tenant_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                          REFERENCES tenants(id) ON DELETE CASCADE,
  folder_id             uuid REFERENCES knowledge_folders(id) ON DELETE SET NULL,
  kind                  text NOT NULL CHECK (kind IN ('page', 'playbook', 'file', 'source')),
  title                 text NOT NULL,
  content               jsonb,
  plain_text            text,
  icon                  text,
  -- File fields
  mime_type             text,
  file_url              text,
  file_size             bigint,
  -- Source fields (Phase 3)
  source_connection_id  uuid,
  source_external_id    text,
  source_sync_status    text CHECK (source_sync_status IS NULL OR source_sync_status IN ('synced', 'stale', 'error', 'source_deleted')),
  source_synced_at      timestamptz,
  -- Scope
  scope                 text NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace', 'agent')),
  -- Common
  tags                  text[] NOT NULL DEFAULT '{}',
  pinned                boolean DEFAULT false,
  meta                  jsonb NOT NULL DEFAULT '{}',
  -- Embedding pipeline
  embedding             extensions.vector(384),
  embedding_model       text,
  embedding_dimensions  integer,
  embedding_status      text NOT NULL DEFAULT 'pending'
                          CHECK (embedding_status IN ('pending', 'indexed', 'failed')),
  embedding_source_hash text,
  embedding_updated_at  timestamptz,
  embedding_error       text,
  embedding_leased_by   text,
  embedding_leased_until timestamptz,
  chunk_status          text NOT NULL DEFAULT 'pending'
                          CHECK (chunk_status IN ('pending', 'indexed', 'failed')),
  chunk_count           integer NOT NULL DEFAULT 0,
  chunk_source_hash     text,
  chunks_updated_at     timestamptz,
  chunk_error           text,
  -- File processing
  processing_status     text NOT NULL DEFAULT 'ready'
                          CHECK (processing_status IN ('ready', 'processing', 'done', 'failed')),
  processing_error      text,
  -- Full-text search
  search_vector         tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(plain_text, '') || ' ' ||
      coalesce(content::text, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '')
    )
  ) STORED,
  archived_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_tenant ON knowledge_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_folder ON knowledge_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_kind ON knowledge_items(kind);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_scope ON knowledge_items(scope);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_tags ON knowledge_items USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_pinned ON knowledge_items(pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_items_active ON knowledge_items(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_items_embedding_status
  ON knowledge_items(embedding_status, embedding_leased_until) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_items_search_vector ON knowledge_items USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_processing
  ON knowledge_items(processing_status) WHERE processing_status IN ('ready', 'processing');

DROP TRIGGER IF EXISTS knowledge_items_updated_at ON knowledge_items;
CREATE TRIGGER knowledge_items_updated_at
  BEFORE UPDATE ON knowledge_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── knowledge_item_agents (agent scope junction) ───────────────────

CREATE TABLE IF NOT EXISTS knowledge_item_agents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  tenant_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                        REFERENCES tenants(id) ON DELETE CASCADE,
  knowledge_item_id   uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  agent_id            uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  CONSTRAINT knowledge_item_agents_unique UNIQUE (knowledge_item_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_item_agents_item ON knowledge_item_agents(knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_item_agents_agent ON knowledge_item_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_item_agents_tenant ON knowledge_item_agents(tenant_id);

-- ── RLS ────────────────────────────────────────────────────────────

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['knowledge_folders', 'knowledge_items', 'knowledge_item_agents']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation" ON %I', _tbl);
    EXECUTE format(
      'CREATE POLICY "Tenant isolation" ON %I FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id())',
      _tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON %I', _tbl);
    EXECUTE format(
      'CREATE POLICY "Service role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      _tbl
    );
  END LOOP;
END
$$;

-- ── Realtime ───────────────────────────────────────────────────────

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['knowledge_folders', 'knowledge_items', 'knowledge_item_agents']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', _tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', _tbl);
  END LOOP;
END
$$;

-- ── Grants ─────────────────────────────────────────────────────────

GRANT ALL ON knowledge_folders TO authenticated, service_role;
GRANT ALL ON knowledge_items TO authenticated, service_role;
GRANT ALL ON knowledge_item_agents TO authenticated, service_role;

-- ── Auto-reset chunk/embedding on content changes ──────────────────

CREATE OR REPLACE FUNCTION mark_knowledge_item_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  should_reindex boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_reindex := true;
  ELSE
    should_reindex := NEW.title IS DISTINCT FROM OLD.title
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.plain_text IS DISTINCT FROM OLD.plain_text
      OR NEW.tags IS DISTINCT FROM OLD.tags;
  END IF;

  IF should_reindex THEN
    NEW.chunk_status := 'pending';
    NEW.chunk_count := 0;
    NEW.chunk_source_hash := NULL;
    NEW.chunks_updated_at := NULL;
    NEW.chunk_error := NULL;
    NEW.embedding_status := 'pending';
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
    NEW.embedding_dimensions := NULL;
    NEW.embedding_source_hash := NULL;
    NEW.embedding_updated_at := NULL;
    NEW.embedding_error := NULL;
    NEW.embedding_leased_by := NULL;
    NEW.embedding_leased_until := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_items_mark_pending ON knowledge_items;
CREATE TRIGGER knowledge_items_mark_pending
  BEFORE INSERT OR UPDATE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION mark_knowledge_item_pending();

-- ── Data migration: document_folders → knowledge_folders ───────────

INSERT INTO knowledge_folders (id, created_at, updated_at, tenant_id, parent_id, name, icon, sort_order)
SELECT id, created_at, updated_at,
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'),
  parent_id, name, icon, sort_order
FROM document_folders
ON CONFLICT (id) DO NOTHING;

-- asset_folders → knowledge_folders (new UUIDs to avoid conflicts)
INSERT INTO knowledge_folders (created_at, updated_at, tenant_id, name, color, sort_order)
SELECT created_at, updated_at,
  COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'),
  name, color, sort_order
FROM asset_folders;

-- ── Data migration: documents → knowledge_items ────────────────────
-- Documents become kind='page'. Boot tags → scope + junction rows.

INSERT INTO knowledge_items (
  id, created_at, updated_at, tenant_id, folder_id, kind, title, content,
  icon, scope, tags, pinned, meta,
  embedding, embedding_model, embedding_dimensions, embedding_status,
  embedding_source_hash, embedding_updated_at, embedding_error,
  embedding_leased_by, embedding_leased_until,
  chunk_status, chunk_count, chunk_source_hash, chunks_updated_at, chunk_error,
  archived_at
)
SELECT
  d.id, d.created_at, d.updated_at,
  COALESCE(d.tenant_id, '00000000-0000-0000-0000-000000000000'),
  d.folder_id,
  'page',
  d.title,
  d.content,
  d.icon,
  CASE
    WHEN EXISTS (SELECT 1 FROM unnest(d.tags) t WHERE t LIKE 'boot:%' AND t != 'boot:all') THEN 'agent'
    ELSE 'workspace'
  END,
  ARRAY(SELECT t FROM unnest(d.tags) t WHERE NOT t LIKE 'boot:%'),
  COALESCE(d.pinned, false),
  d.meta,
  d.embedding, d.embedding_model, d.embedding_dimensions, d.embedding_status,
  d.embedding_source_hash, d.embedding_updated_at, d.embedding_error,
  d.embedding_leased_by, d.embedding_leased_until,
  d.chunk_status, COALESCE(d.chunk_count, 0), d.chunk_source_hash, d.chunks_updated_at, d.chunk_error,
  d.archived_at
FROM documents d
ON CONFLICT (id) DO NOTHING;

-- Create agent junction rows from boot:slug tags
INSERT INTO knowledge_item_agents (tenant_id, knowledge_item_id, agent_id)
SELECT DISTINCT
  COALESCE(d.tenant_id, '00000000-0000-0000-0000-000000000000'),
  d.id,
  a.id
FROM documents d
CROSS JOIN LATERAL unnest(d.tags) AS t
JOIN agents a ON a.slug = substring(t FROM 6)
WHERE t LIKE 'boot:%' AND t != 'boot:all'
ON CONFLICT DO NOTHING;

-- ── Data migration: assets → knowledge_items ───────────────────────
-- Assets become kind='file' or kind='playbook' based on type.

INSERT INTO knowledge_items (
  id, created_at, updated_at, tenant_id, kind, title,
  plain_text, mime_type, file_url, file_size,
  scope, tags, meta, archived_at,
  processing_status
)
SELECT
  a.id, a.created_at, a.updated_at,
  COALESCE(a.tenant_id, '00000000-0000-0000-0000-000000000000'),
  CASE
    WHEN a.type IN ('sop', 'script') THEN 'playbook'
    ELSE 'file'
  END,
  a.name,
  a.content,
  a.mime_type,
  a.file_url,
  a.file_size,
  'workspace',
  a.tags,
  a.meta,
  a.archived_at,
  CASE WHEN a.file_url IS NOT NULL THEN 'done' ELSE 'ready' END
FROM assets a
ON CONFLICT (id) DO NOTHING;

-- ── Update entity_links target_type ────────────────────────────────
-- Change 'document' → 'knowledge_item' and 'asset' → 'knowledge_item'

UPDATE entity_links SET target_type = 'knowledge_item'
WHERE target_type IN ('document', 'asset');

-- ── Migrate knowledge_chunks to reference knowledge_items ──────────
-- Add knowledge_item_id column, populate from document_id/asset_id

ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS knowledge_item_id uuid REFERENCES knowledge_items(id) ON DELETE CASCADE;

UPDATE knowledge_chunks SET knowledge_item_id = document_id WHERE document_id IS NOT NULL;
UPDATE knowledge_chunks SET knowledge_item_id = asset_id WHERE asset_id IS NOT NULL AND knowledge_item_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_knowledge_item ON knowledge_chunks(knowledge_item_id);

-- ── New RPC: search_knowledge_items ────────────────────────────────

DROP FUNCTION IF EXISTS search_knowledge_items(extensions.vector, integer, text[], uuid, text);
CREATE OR REPLACE FUNCTION search_knowledge_items(
  query_embedding extensions.vector(384),
  match_count integer DEFAULT 5,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_kind text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, kind text, content jsonb, tags text[], folder_id uuid,
  scope text, updated_at timestamptz, meta jsonb, similarity float
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ki.id, ki.title, ki.kind, ki.content, ki.tags, ki.folder_id,
    ki.scope, ki.updated_at, ki.meta,
    1 - (ki.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_items ki
  WHERE ki.embedding IS NOT NULL
    AND ki.archived_at IS NULL
    AND ki.tenant_id = public.current_tenant_id()
    AND (filter_tags IS NULL OR ki.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
    AND (filter_kind IS NULL OR ki.kind = filter_kind)
  ORDER BY ki.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── New RPC: search_knowledge_items_text ───────────────────────────

DROP FUNCTION IF EXISTS search_knowledge_items_text(text, integer, text[], uuid, text);
CREATE OR REPLACE FUNCTION search_knowledge_items_text(
  query_text text,
  match_count integer DEFAULT 10,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_kind text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, kind text, content jsonb, tags text[], folder_id uuid,
  scope text, updated_at timestamptz, meta jsonb, similarity float
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized_query text := btrim(coalesce(query_text, ''));
BEGIN
  IF normalized_query = '' THEN
    RETURN QUERY
    SELECT
      ki.id, ki.title, ki.kind, ki.content, ki.tags, ki.folder_id,
      ki.scope, ki.updated_at, ki.meta,
      0::float AS similarity
    FROM public.knowledge_items ki
    WHERE ki.archived_at IS NULL
      AND ki.tenant_id = public.current_tenant_id()
      AND (filter_tags IS NULL OR ki.tags && filter_tags)
      AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
      AND (filter_kind IS NULL OR ki.kind = filter_kind)
    ORDER BY ki.updated_at DESC
    LIMIT match_count;
    RETURN;
  END IF;

  RETURN QUERY
  WITH query AS (
    SELECT websearch_to_tsquery('english'::regconfig, normalized_query) AS tsquery
  )
  SELECT
    ki.id, ki.title, ki.kind, ki.content, ki.tags, ki.folder_id,
    ki.scope, ki.updated_at, ki.meta,
    ts_rank_cd(ki.search_vector, query.tsquery)::float AS similarity
  FROM public.knowledge_items ki
  CROSS JOIN query
  WHERE ki.archived_at IS NULL
    AND ki.tenant_id = public.current_tenant_id()
    AND (filter_tags IS NULL OR ki.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
    AND (filter_kind IS NULL OR ki.kind = filter_kind)
    AND ki.search_vector @@ query.tsquery
  ORDER BY ts_rank_cd(ki.search_vector, query.tsquery) DESC, ki.updated_at DESC
  LIMIT match_count;
END;
$$;

-- ── New RPC: lease_knowledge_items_for_indexing ────────────────────

DROP FUNCTION IF EXISTS lease_knowledge_items_for_indexing(text, integer, integer);
CREATE OR REPLACE FUNCTION lease_knowledge_items_for_indexing(
  p_gateway_slug text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  id uuid, kind text, title text, content jsonb, plain_text text,
  tags text[], folder_id uuid, mime_type text,
  updated_at timestamptz, chunk_source_hash text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.knowledge_items ki
  SET
    embedding_status = 'pending',
    embedding_leased_by = p_gateway_slug,
    embedding_leased_until = now() + (p_lease_seconds || ' seconds')::interval,
    embedding_error = NULL,
    updated_at = ki.updated_at
  WHERE ki.id IN (
    SELECT c.id
    FROM public.knowledge_items c
    WHERE c.archived_at IS NULL
      AND c.tenant_id = public.current_tenant_id()
      AND (c.kind IN ('page', 'playbook') OR (c.kind = 'file' AND c.processing_status = 'done'))
      AND (
        c.embedding IS NULL
        OR c.embedding_status IN ('pending', 'failed')
      )
      AND (
        c.embedding_leased_until IS NULL
        OR c.embedding_leased_until < now()
      )
    ORDER BY c.updated_at ASC
    LIMIT GREATEST(1, p_limit)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING ki.id, ki.kind, ki.title, ki.content, ki.plain_text,
    ki.tags, ki.folder_id, ki.mime_type, ki.updated_at, ki.chunk_source_hash;
END;
$$;

-- ── New RPC: mark_knowledge_item_indexed ───────────────────────────

DROP FUNCTION IF EXISTS mark_knowledge_item_indexed(uuid, extensions.vector, text, integer, text);
CREATE OR REPLACE FUNCTION mark_knowledge_item_indexed(
  p_item_id uuid,
  p_embedding extensions.vector(384),
  p_model text,
  p_dimensions integer,
  p_source_hash text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.knowledge_items
  SET
    embedding = p_embedding,
    embedding_model = p_model,
    embedding_dimensions = p_dimensions,
    embedding_status = 'indexed',
    embedding_source_hash = p_source_hash,
    embedding_updated_at = now(),
    embedding_error = NULL,
    embedding_leased_by = NULL,
    embedding_leased_until = NULL,
    updated_at = updated_at
  WHERE id = p_item_id;
END;
$$;

-- ── New RPC: mark_knowledge_item_failed ────────────────────────────

DROP FUNCTION IF EXISTS mark_knowledge_item_failed(uuid, text);
CREATE OR REPLACE FUNCTION mark_knowledge_item_failed(
  p_item_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.knowledge_items
  SET
    embedding_status = 'failed',
    embedding_error = left(p_error, 1000),
    embedding_leased_by = NULL,
    embedding_leased_until = NULL,
    updated_at = updated_at
  WHERE id = p_item_id;
END;
$$;

-- ── Grants for new RPCs ───────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.search_knowledge_items(extensions.vector, integer, text[], uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_items_text(text, integer, text[], uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lease_knowledge_items_for_indexing(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_item_indexed(uuid, extensions.vector, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_item_failed(uuid, text) TO authenticated, service_role;

-- ── Drop old tables ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS documents_sync_knowledge_source ON documents;
DROP TRIGGER IF EXISTS documents_mark_knowledge_pending ON documents;
DROP FUNCTION IF EXISTS sync_document_knowledge_source();
DROP FUNCTION IF EXISTS mark_document_knowledge_pending();

DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS document_folders CASCADE;
DROP TABLE IF EXISTS assets CASCADE;
DROP TABLE IF EXISTS asset_folders CASCADE;
DROP TABLE IF EXISTS knowledge_sources CASCADE;

-- Drop old RPCs that referenced documents/assets
DROP FUNCTION IF EXISTS search_documents(extensions.vector, integer, text[], uuid);
DROP FUNCTION IF EXISTS search_documents_text(text, integer, text[], uuid);
DROP FUNCTION IF EXISTS lease_documents_for_embedding(text, integer, integer);
DROP FUNCTION IF EXISTS mark_document_embedding_indexed(uuid, extensions.vector, text, integer, text);
DROP FUNCTION IF EXISTS mark_document_embedding_failed(uuid, text);
DROP FUNCTION IF EXISTS lease_knowledge_sources_for_indexing(text, integer, integer);
DROP FUNCTION IF EXISTS replace_knowledge_source_chunks(uuid, jsonb, text, integer, text, extensions.vector, text, text, text);
DROP FUNCTION IF EXISTS mark_knowledge_source_failed(uuid, text);

-- ── Clean up knowledge_chunks FKs to dropped tables ────────────────

ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS document_id;
ALTER TABLE knowledge_chunks DROP COLUMN IF EXISTS asset_id;

-- Update knowledge_chunks source_id FK to point at knowledge_items
-- (chunks now reference knowledge_item_id directly)
ALTER TABLE knowledge_chunks DROP CONSTRAINT IF EXISTS knowledge_chunks_source_id_fkey;

-- ── Schema version ─────────────────────────────────────────────────

INSERT INTO _schema_version (version, description)
VALUES (24, 'Knowledge unification: knowledge_items replaces documents + assets')
ON CONFLICT (version) DO NOTHING;
