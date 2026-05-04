-- 012_knowledge.sql — Knowledge items, chunks, semantic/full-text search, and draft sets.

-- ── Knowledge folders ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
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

ALTER TABLE knowledge_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON knowledge_folders
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "Service role full access" ON knowledge_folders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON knowledge_folders TO authenticated, service_role;

-- ── Knowledge items ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  tenant_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  folder_id             uuid REFERENCES knowledge_folders(id) ON DELETE SET NULL,
  kind                  text NOT NULL CHECK (kind IN ('page', 'playbook', 'file', 'source')),
  title                 text NOT NULL,
  content               jsonb,
  plain_text            text,
  icon                  text,
  mime_type             text,
  file_url              text,
  file_size             bigint,
  source_connection_id  uuid,
  source_external_id    text,
  source_sync_status    text CHECK (source_sync_status IS NULL OR source_sync_status IN ('synced', 'stale', 'error', 'source_deleted')),
  source_synced_at      timestamptz,
  content_hash          text,
  scope                 text NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace', 'agent')),
  tags                  text[] NOT NULL DEFAULT '{}',
  pinned                boolean DEFAULT false,
  meta                  jsonb NOT NULL DEFAULT '{}',
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
  processing_status     text NOT NULL DEFAULT 'ready'
                          CHECK (processing_status IN ('ready', 'processing', 'done', 'failed')),
  processing_error      text,
  search_vector         tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(plain_text, '') || ' ' ||
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
CREATE INDEX IF NOT EXISTS idx_knowledge_items_source_conn
  ON knowledge_items(source_connection_id) WHERE source_connection_id IS NOT NULL;

DROP TRIGGER IF EXISTS knowledge_items_updated_at ON knowledge_items;
CREATE TRIGGER knowledge_items_updated_at
  BEFORE UPDATE ON knowledge_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON knowledge_items
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "Service role full access" ON knowledge_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON knowledge_items TO authenticated, service_role;

-- ── Knowledge item agents (agent scope junction) ───────────────────

CREATE TABLE IF NOT EXISTS knowledge_item_agents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  tenant_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  knowledge_item_id   uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  agent_id            uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  CONSTRAINT knowledge_item_agents_unique UNIQUE (knowledge_item_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_item_agents_tenant ON knowledge_item_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_item_agents_item ON knowledge_item_agents(knowledge_item_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_item_agents_agent ON knowledge_item_agents(agent_id);

ALTER TABLE knowledge_item_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON knowledge_item_agents
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "Service role full access" ON knowledge_item_agents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON knowledge_item_agents TO authenticated, service_role;

-- ── Mark knowledge item pending trigger ────────────────────────────

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

-- ── Knowledge chunks ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  tenant_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  knowledge_item_id   uuid NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  chunk_index         integer NOT NULL,
  content             text NOT NULL,
  content_hash        text NOT NULL,
  char_start          integer,
  char_end            integer,
  page_number         integer,
  section_path        text[],
  meta                jsonb NOT NULL DEFAULT '{}',
  embedding           extensions.vector(384),
  embedding_model     text,
  embedding_dimensions integer,
  embedding_status    text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'indexed', 'failed')),
  embedding_error     text,
  embedding_leased_by text,
  embedding_leased_until timestamptz,
  embedding_updated_at timestamptz,
  search_vector       tsvector GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig, coalesce(content, ''))
  ) STORED,
  CONSTRAINT knowledge_chunks_item_index_unique UNIQUE (knowledge_item_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tenant ON knowledge_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_item ON knowledge_chunks(knowledge_item_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector ON knowledge_chunks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_status
  ON knowledge_chunks(embedding_status, embedding_leased_until);

DROP TRIGGER IF EXISTS knowledge_chunks_updated_at ON knowledge_chunks;
CREATE TRIGGER knowledge_chunks_updated_at
  BEFORE UPDATE ON knowledge_chunks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON knowledge_chunks
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "Service role full access" ON knowledge_chunks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON knowledge_chunks TO authenticated, service_role;

-- ── RPCs ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_knowledge_items(
  query_embedding extensions.vector(384),
  match_count integer DEFAULT 5,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_kind text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, kind text, content jsonb, tags text[], folder_id uuid,
  scope text, updated_at timestamptz, meta jsonb,
  source_connection_id uuid, source_external_id text,
  similarity float
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ki.id, ki.title, ki.kind, ki.content, ki.tags, ki.folder_id,
    ki.scope, ki.updated_at, ki.meta,
    ki.source_connection_id, ki.source_external_id,
    1 - (ki.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_items ki
  WHERE ki.embedding IS NOT NULL
    AND ki.archived_at IS NULL
    AND (filter_tags IS NULL OR ki.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
    AND (filter_kind IS NULL OR ki.kind = filter_kind)
  ORDER BY ki.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_knowledge_items_text(
  query_text text,
  match_count integer DEFAULT 10,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_kind text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, kind text, content jsonb, tags text[], folder_id uuid,
  scope text, updated_at timestamptz, meta jsonb,
  source_connection_id uuid, source_external_id text,
  similarity float
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
      ki.source_connection_id, ki.source_external_id,
      0::float AS similarity
    FROM public.knowledge_items ki
    WHERE ki.archived_at IS NULL
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
    ki.source_connection_id, ki.source_external_id,
    ts_rank_cd(ki.search_vector, query.tsquery)::float AS similarity
  FROM public.knowledge_items ki
  CROSS JOIN query
  WHERE ki.archived_at IS NULL
    AND (filter_tags IS NULL OR ki.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
    AND (filter_kind IS NULL OR ki.kind = filter_kind)
    AND ki.search_vector @@ query.tsquery
  ORDER BY ts_rank_cd(ki.search_vector, query.tsquery) DESC, ki.updated_at DESC
  LIMIT match_count;
END;
$$;

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

CREATE OR REPLACE FUNCTION search_knowledge_chunks(
  query_embedding extensions.vector(384),
  match_count integer DEFAULT 10,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_source_type text DEFAULT NULL,
  filter_source_id uuid DEFAULT NULL
)
RETURNS TABLE (
  knowledge_item_id uuid, kind text, title text, tags text[], folder_id uuid,
  scope text, chunk_id uuid, chunk_index integer, content text,
  char_start integer, char_end integer, page_number integer,
  section_path text[], meta jsonb, updated_at timestamptz, similarity float
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ki.id, ki.kind, ki.title, ki.tags, ki.folder_id,
    ki.scope, kc.id, kc.chunk_index, kc.content,
    kc.char_start, kc.char_end, kc.page_number,
    kc.section_path, kc.meta, kc.updated_at,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_items ki ON ki.id = kc.knowledge_item_id
  WHERE kc.embedding IS NOT NULL
    AND kc.embedding_status = 'indexed'
    AND ki.archived_at IS NULL
    AND (filter_tags IS NULL OR ki.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
    AND (filter_source_type IS NULL OR ki.kind = filter_source_type)
    AND (filter_source_id IS NULL OR ki.id = filter_source_id)
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_knowledge_chunks_text(
  query_text text,
  match_count integer DEFAULT 10,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_source_type text DEFAULT NULL,
  filter_source_id uuid DEFAULT NULL
)
RETURNS TABLE (
  knowledge_item_id uuid, kind text, title text, tags text[], folder_id uuid,
  scope text, chunk_id uuid, chunk_index integer, content text,
  char_start integer, char_end integer, page_number integer,
  section_path text[], meta jsonb, updated_at timestamptz, similarity float
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
      ki.id, ki.kind, ki.title, ki.tags, ki.folder_id,
      ki.scope, kc.id, kc.chunk_index, kc.content,
      kc.char_start, kc.char_end, kc.page_number,
      kc.section_path, kc.meta, kc.updated_at,
      0::float AS similarity
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_items ki ON ki.id = kc.knowledge_item_id
    WHERE ki.archived_at IS NULL
      AND (filter_tags IS NULL OR ki.tags && filter_tags)
      AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
      AND (filter_source_type IS NULL OR ki.kind = filter_source_type)
      AND (filter_source_id IS NULL OR ki.id = filter_source_id)
    ORDER BY kc.updated_at DESC
    LIMIT match_count;
    RETURN;
  END IF;

  RETURN QUERY
  WITH query AS (
    SELECT websearch_to_tsquery('english'::regconfig, normalized_query) AS tsquery
  )
  SELECT
    ki.id, ki.kind, ki.title, ki.tags, ki.folder_id,
    ki.scope, kc.id, kc.chunk_index, kc.content,
    kc.char_start, kc.char_end, kc.page_number,
    kc.section_path, kc.meta, kc.updated_at,
    ts_rank_cd(kc.search_vector, query.tsquery)::float AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_items ki ON ki.id = kc.knowledge_item_id
  CROSS JOIN query
  WHERE ki.archived_at IS NULL
    AND (filter_tags IS NULL OR ki.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ki.folder_id = filter_folder_id)
    AND (filter_source_type IS NULL OR ki.kind = filter_source_type)
    AND (filter_source_id IS NULL OR ki.id = filter_source_id)
    AND kc.search_vector @@ query.tsquery
  ORDER BY ts_rank_cd(kc.search_vector, query.tsquery) DESC, kc.updated_at DESC
  LIMIT match_count;
END;
$$;

-- ── RPC Grants ─────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.mark_knowledge_item_pending() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_items(extensions.vector, integer, text[], uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_items_text(text, integer, text[], uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lease_knowledge_items_for_indexing(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_item_indexed(uuid, extensions.vector, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_item_failed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks(extensions.vector, integer, text[], uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks_text(text, integer, text[], uuid, text, uuid) TO authenticated, service_role;

-- ── Realtime ──────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE knowledge_folders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE knowledge_folders REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE knowledge_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE knowledge_items REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE knowledge_item_agents;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE knowledge_item_agents REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE knowledge_chunks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE knowledge_chunks REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE draft_sets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE draft_sets REPLICA IDENTITY FULL;
