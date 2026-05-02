-- 011_assets_documents.sql — Assets, documents, semantic/full-text search, and draft sets.

-- ── Assets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS asset_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  parent_id   uuid REFERENCES asset_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text,
  sort_order  integer DEFAULT 0
);

DROP TRIGGER IF EXISTS asset_folders_updated_at ON asset_folders;
CREATE TRIGGER asset_folders_updated_at
  BEFORE UPDATE ON asset_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  folder_id   uuid REFERENCES asset_folders(id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text,
  type        asset_type NOT NULL DEFAULT 'document',
  mime_type   text,
  file_url    text,
  file_size   bigint,
  content     text,
  tags        text[] NOT NULL DEFAULT '{}',
  meta        jsonb NOT NULL DEFAULT '{}',
  archived_at timestamptz
);

-- Column reconciliation for assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_assets_active ON assets(created_at DESC) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS assets_updated_at ON assets;
CREATE TRIGGER assets_updated_at
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Documents ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  parent_id   uuid REFERENCES document_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  icon        text,
  sort_order  integer DEFAULT 0
);

DROP TRIGGER IF EXISTS document_folders_updated_at ON document_folders;
CREATE TRIGGER document_folders_updated_at
  BEFORE UPDATE ON document_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  folder_id   uuid REFERENCES document_folders(id) ON DELETE SET NULL,
  title       text NOT NULL,
  content     jsonb,
  tags        text[] NOT NULL DEFAULT '{}',
  pinned      boolean DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}',
  embedding   extensions.vector(384),
  embedding_model text,
  embedding_dimensions integer,
  embedding_status text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'indexed', 'failed')),
  embedding_source_hash text,
  embedding_updated_at timestamptz,
  embedding_error text,
  embedding_leased_by text,
  embedding_leased_until timestamptz,
  chunk_status text NOT NULL DEFAULT 'pending'
    CHECK (chunk_status IN ('pending', 'indexed', 'failed')),
  chunk_count integer NOT NULL DEFAULT 0,
  chunk_source_hash text,
  chunks_updated_at timestamptz,
  chunk_error text,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(content::text, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '')
    )
  ) STORED,
  archived_at timestamptz
);

-- Column reconciliation for documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding extensions.vector(384);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_dimensions integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_status text NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_source_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_error text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_leased_by text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_leased_until timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_status text NOT NULL DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_count integer NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_source_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunks_updated_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS chunk_error text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector(
    'english'::regconfig,
    coalesce(title, '') || ' ' ||
    coalesce(content::text, '') || ' ' ||
    coalesce(array_to_string(tags, ' '), '')
  )
) STORED;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_embedding_status_check
    CHECK (embedding_status IN ('pending', 'indexed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE documents ADD CONSTRAINT documents_chunk_status_check
    CHECK (chunk_status IN ('pending', 'indexed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_documents_pinned ON documents(pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_documents_active ON documents(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_embedding_status ON documents(embedding_status, embedding_leased_until)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 10);

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Knowledge indexing registry ─────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  source_type         text NOT NULL,
  source_id           text NOT NULL,
  document_id         uuid REFERENCES documents(id) ON DELETE CASCADE,
  asset_id            uuid REFERENCES assets(id) ON DELETE CASCADE,
  title               text NOT NULL,
  tags                text[] NOT NULL DEFAULT '{}',
  folder_id           uuid,
  source_uri          text,
  mime_type           text,
  meta                jsonb NOT NULL DEFAULT '{}',
  archived_at         timestamptz,
  source_updated_at   timestamptz,
  extraction_status   text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'extracted', 'failed')),
  extraction_method   text,
  extraction_hash     text,
  extraction_error    text,
  extracted_at        timestamptz,
  chunk_status        text NOT NULL DEFAULT 'pending'
    CHECK (chunk_status IN ('pending', 'indexed', 'failed')),
  chunk_count         integer NOT NULL DEFAULT 0,
  chunk_source_hash   text,
  chunks_updated_at   timestamptz,
  chunk_error         text,
  embedding_status    text NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'indexed', 'failed')),
  embedding_error     text,
  indexing_leased_by  text,
  indexing_leased_until timestamptz,
  CONSTRAINT knowledge_sources_source_ref_check CHECK (
    (source_type = 'document' AND document_id IS NOT NULL AND asset_id IS NULL) OR
    (source_type = 'asset' AND asset_id IS NOT NULL AND document_id IS NULL) OR
    (source_type NOT IN ('document', 'asset') AND document_id IS NULL AND asset_id IS NULL)
  )
);

ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES assets(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS folder_id uuid;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS source_uri text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS extraction_method text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS extraction_hash text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS extraction_error text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS extracted_at timestamptz;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS chunk_status text NOT NULL DEFAULT 'pending';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS chunk_count integer NOT NULL DEFAULT 0;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS chunk_source_hash text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS chunks_updated_at timestamptz;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS chunk_error text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS embedding_status text NOT NULL DEFAULT 'pending';
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS embedding_error text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS indexing_leased_by text;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS indexing_leased_until timestamptz;

DO $$ BEGIN
  ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_extraction_status_check
    CHECK (extraction_status IN ('pending', 'extracted', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_chunk_status_check
    CHECK (chunk_status IN ('pending', 'indexed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_embedding_status_check
    CHECK (embedding_status IN ('pending', 'indexed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE knowledge_sources ADD CONSTRAINT knowledge_sources_source_ref_check CHECK (
    (source_type = 'document' AND document_id IS NOT NULL AND asset_id IS NULL) OR
    (source_type = 'asset' AND asset_id IS NOT NULL AND document_id IS NULL) OR
    (source_type NOT IN ('document', 'asset') AND document_id IS NULL AND asset_id IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_sources_source_unique
  ON knowledge_sources(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_document ON knowledge_sources(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_asset ON knowledge_sources(asset_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status
  ON knowledge_sources(chunk_status, indexing_leased_until)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_type ON knowledge_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_tags ON knowledge_sources USING gin(tags);

DROP TRIGGER IF EXISTS knowledge_sources_updated_at ON knowledge_sources;
CREATE TRIGGER knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  source_id           uuid NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  source_type         text NOT NULL,
  source_entity_id    text NOT NULL,
  document_id         uuid REFERENCES documents(id) ON DELETE CASCADE,
  asset_id            uuid REFERENCES assets(id) ON DELETE CASCADE,
  chunk_index         integer NOT NULL,
  content             text NOT NULL,
  content_hash        text NOT NULL,
  char_start          integer,
  char_end            integer,
  page_number         integer,
  section_path        text[],
  source_uri          text,
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
  CONSTRAINT knowledge_chunks_source_index_unique UNIQUE (source_id, chunk_index)
);

ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS source_entity_id text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES documents(id) ON DELETE CASCADE;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES assets(id) ON DELETE CASCADE;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS char_start integer;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS char_end integer;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS page_number integer;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS section_path text[];
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS source_uri text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding extensions.vector(384);
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_model text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_dimensions integer;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_status text NOT NULL DEFAULT 'pending';
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_error text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_leased_by text;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_leased_until timestamptz;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz;
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector('english'::regconfig, coalesce(content, ''))
) STORED;

DO $$ BEGIN
  ALTER TABLE knowledge_chunks ADD CONSTRAINT knowledge_chunks_embedding_status_check
    CHECK (embedding_status IN ('pending', 'indexed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_asset ON knowledge_chunks(asset_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search_vector ON knowledge_chunks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON knowledge_chunks
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding_status
  ON knowledge_chunks(embedding_status, embedding_leased_until);

DROP TRIGGER IF EXISTS knowledge_chunks_updated_at ON knowledge_chunks;
CREATE TRIGGER knowledge_chunks_updated_at
  BEFORE UPDATE ON knowledge_chunks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION mark_document_knowledge_pending()
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
      OR NEW.tags IS DISTINCT FROM OLD.tags;
  END IF;

  IF should_reindex THEN
    NEW.chunk_status := 'pending';
    NEW.chunk_count := 0;
    NEW.chunk_source_hash := NULL;
    NEW.chunks_updated_at := NULL;
    NEW.chunk_error := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_mark_knowledge_pending ON documents;
CREATE TRIGGER documents_mark_knowledge_pending
  BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION mark_document_knowledge_pending();

CREATE OR REPLACE FUNCTION sync_document_knowledge_source()
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
      OR NEW.tags IS DISTINCT FROM OLD.tags;
  END IF;

  INSERT INTO public.knowledge_sources (
    source_type, source_id, document_id, title, tags, folder_id, meta,
    archived_at, source_updated_at, extraction_method,
    extraction_status, extraction_error, chunk_status, chunk_error,
    embedding_status, embedding_error, indexing_leased_by, indexing_leased_until
  )
  VALUES (
    'document', NEW.id::text, NEW.id, NEW.title, NEW.tags, NEW.folder_id, NEW.meta,
    NEW.archived_at, NEW.updated_at, 'native_document',
    'pending', NULL, 'pending', NULL,
    'pending', NULL, NULL, NULL
  )
  ON CONFLICT (source_type, source_id) DO UPDATE
  SET
    document_id = EXCLUDED.document_id,
    title = EXCLUDED.title,
    tags = EXCLUDED.tags,
    folder_id = EXCLUDED.folder_id,
    meta = EXCLUDED.meta,
    archived_at = EXCLUDED.archived_at,
    source_updated_at = EXCLUDED.source_updated_at,
    extraction_method = 'native_document',
    extraction_status = CASE WHEN should_reindex THEN 'pending' ELSE knowledge_sources.extraction_status END,
    extraction_error = CASE WHEN should_reindex THEN NULL ELSE knowledge_sources.extraction_error END,
    chunk_status = CASE WHEN should_reindex THEN 'pending' ELSE knowledge_sources.chunk_status END,
    chunk_error = CASE WHEN should_reindex THEN NULL ELSE knowledge_sources.chunk_error END,
    embedding_status = CASE WHEN should_reindex THEN 'pending' ELSE knowledge_sources.embedding_status END,
    embedding_error = CASE WHEN should_reindex THEN NULL ELSE knowledge_sources.embedding_error END,
    indexing_leased_by = CASE WHEN should_reindex THEN NULL ELSE knowledge_sources.indexing_leased_by END,
    indexing_leased_until = CASE WHEN should_reindex THEN NULL ELSE knowledge_sources.indexing_leased_until END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_sync_knowledge_source ON documents;
CREATE TRIGGER documents_sync_knowledge_source
  AFTER INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION sync_document_knowledge_source();

INSERT INTO public.knowledge_sources (
  source_type, source_id, document_id, title, tags, folder_id, meta,
  archived_at, source_updated_at, extraction_method,
  extraction_status, chunk_status, embedding_status
)
SELECT
  'document', d.id::text, d.id, d.title, d.tags, d.folder_id, d.meta,
  d.archived_at, d.updated_at, 'native_document',
  'pending', 'pending', 'pending'
FROM public.documents d
ON CONFLICT (source_type, source_id) DO UPDATE
SET
  document_id = EXCLUDED.document_id,
  title = EXCLUDED.title,
  tags = EXCLUDED.tags,
  folder_id = EXCLUDED.folder_id,
  meta = EXCLUDED.meta,
  archived_at = EXCLUDED.archived_at,
  source_updated_at = EXCLUDED.source_updated_at,
  extraction_method = 'native_document',
  extraction_status = 'pending',
  extraction_error = NULL,
  chunk_status = 'pending',
  chunk_error = NULL,
  embedding_status = 'pending',
  embedding_error = NULL,
  indexing_leased_by = NULL,
  indexing_leased_until = NULL;

-- Semantic search function (DROP first — return type may have changed)
DROP FUNCTION IF EXISTS search_documents(extensions.vector, integer, text[], uuid);
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding extensions.vector(384),
  match_count integer DEFAULT 5,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, content jsonb, tags text[], folder_id uuid,
  updated_at timestamptz, meta jsonb, similarity float
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.title, d.content, d.tags, d.folder_id,
    d.updated_at, d.meta,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.documents d
  WHERE d.embedding IS NOT NULL
    AND d.archived_at IS NULL
    AND (filter_tags IS NULL OR d.tags && filter_tags)
    AND (filter_folder_id IS NULL OR d.folder_id = filter_folder_id)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS search_documents_text(text, integer, text[], uuid);
CREATE OR REPLACE FUNCTION search_documents_text(
  query_text text,
  match_count integer DEFAULT 5,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, content jsonb, tags text[], folder_id uuid,
  updated_at timestamptz, meta jsonb, similarity float
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
      d.id, d.title, d.content, d.tags, d.folder_id,
      d.updated_at, d.meta,
      0::float AS similarity
    FROM public.documents d
    WHERE d.archived_at IS NULL
      AND (filter_tags IS NULL OR d.tags && filter_tags)
      AND (filter_folder_id IS NULL OR d.folder_id = filter_folder_id)
    ORDER BY d.updated_at DESC
    LIMIT match_count;
    RETURN;
  END IF;

  RETURN QUERY
  WITH query AS (
    SELECT websearch_to_tsquery('english'::regconfig, normalized_query) AS tsquery
  )
  SELECT
    d.id, d.title, d.content, d.tags, d.folder_id,
    d.updated_at, d.meta,
    ts_rank_cd(d.search_vector, query.tsquery)::float AS similarity
  FROM public.documents d
  CROSS JOIN query
  WHERE d.archived_at IS NULL
    AND (filter_tags IS NULL OR d.tags && filter_tags)
    AND (filter_folder_id IS NULL OR d.folder_id = filter_folder_id)
    AND d.search_vector @@ query.tsquery
  ORDER BY ts_rank_cd(d.search_vector, query.tsquery) DESC, d.updated_at DESC
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS lease_documents_for_embedding(text, integer, integer);
CREATE OR REPLACE FUNCTION lease_documents_for_embedding(
  p_gateway_slug text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  id uuid, title text, content jsonb, tags text[],
  updated_at timestamptz, embedding_source_hash text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.documents d
  SET
    embedding_status = 'pending',
    embedding_leased_by = p_gateway_slug,
    embedding_leased_until = now() + (p_lease_seconds || ' seconds')::interval,
    embedding_error = NULL,
    updated_at = d.updated_at
  WHERE d.id IN (
    SELECT candidate.id
    FROM public.documents candidate
    WHERE candidate.archived_at IS NULL
      AND (
        candidate.embedding IS NULL
        OR candidate.embedding_status IS NULL
        OR candidate.embedding_status = 'pending'
        OR (
          candidate.embedding_status = 'failed'
          AND (
            candidate.embedding_leased_until IS NULL
            OR candidate.embedding_leased_until < now()
          )
        )
      )
      AND (
        candidate.embedding_leased_until IS NULL
        OR candidate.embedding_leased_until < now()
      )
    ORDER BY candidate.updated_at ASC
    LIMIT GREATEST(1, p_limit)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.id, d.title, d.content, d.tags, d.updated_at, d.embedding_source_hash;
END;
$$;

DROP FUNCTION IF EXISTS mark_document_embedding_indexed(uuid, extensions.vector, text, integer, text);
CREATE OR REPLACE FUNCTION mark_document_embedding_indexed(
  p_document_id uuid,
  p_embedding extensions.vector(384),
  p_embedding_model text,
  p_embedding_dimensions integer,
  p_source_hash text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.documents
  SET
    embedding = p_embedding,
    embedding_model = p_embedding_model,
    embedding_dimensions = p_embedding_dimensions,
    embedding_status = 'indexed',
    embedding_source_hash = p_source_hash,
    embedding_updated_at = now(),
    embedding_error = NULL,
    embedding_leased_by = NULL,
    embedding_leased_until = NULL,
    updated_at = updated_at
  WHERE id = p_document_id;
END;
$$;

DROP FUNCTION IF EXISTS mark_document_embedding_failed(uuid, text);
CREATE OR REPLACE FUNCTION mark_document_embedding_failed(
  p_document_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.documents
  SET
    embedding_status = 'failed',
    embedding_error = left(p_error, 1000),
    embedding_leased_by = NULL,
    embedding_leased_until = NULL,
    updated_at = updated_at
  WHERE id = p_document_id;
END;
$$;

DROP FUNCTION IF EXISTS lease_knowledge_sources_for_indexing(text, integer, integer);
CREATE OR REPLACE FUNCTION lease_knowledge_sources_for_indexing(
  p_gateway_slug text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  id uuid, source_type text, source_id text, document_id uuid, asset_id uuid,
  title text, content jsonb, tags text[], folder_id uuid, source_uri text,
  mime_type text, source_updated_at timestamptz, chunk_source_hash text
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.knowledge_sources ks
  SET
    extraction_status = 'pending',
    chunk_status = 'pending',
    embedding_status = 'pending',
    indexing_leased_by = p_gateway_slug,
    indexing_leased_until = now() + (p_lease_seconds || ' seconds')::interval,
    extraction_error = NULL,
    chunk_error = NULL,
    embedding_error = NULL
  WHERE ks.id IN (
    SELECT candidate.id
    FROM public.knowledge_sources candidate
    WHERE candidate.archived_at IS NULL
      AND candidate.source_type = 'document'
      AND (
        candidate.extraction_status IN ('pending', 'failed')
        OR candidate.chunk_status IN ('pending', 'failed')
        OR candidate.embedding_status IN ('pending', 'failed')
      )
      AND (
        candidate.indexing_leased_until IS NULL
        OR candidate.indexing_leased_until < now()
      )
    ORDER BY candidate.source_updated_at ASC NULLS FIRST, candidate.updated_at ASC
    LIMIT GREATEST(1, p_limit)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    ks.id, ks.source_type, ks.source_id, ks.document_id, ks.asset_id,
    ks.title,
    (SELECT d.content FROM public.documents d WHERE d.id = ks.document_id) AS content,
    ks.tags, ks.folder_id, ks.source_uri, ks.mime_type,
    ks.source_updated_at, ks.chunk_source_hash;
END;
$$;

DROP FUNCTION IF EXISTS replace_knowledge_source_chunks(uuid, jsonb, text, integer, text, extensions.vector, text, text, text);
CREATE OR REPLACE FUNCTION replace_knowledge_source_chunks(
  p_source_id uuid,
  p_chunks jsonb,
  p_embedding_model text,
  p_embedding_dimensions integer,
  p_source_hash text,
  p_coarse_embedding extensions.vector(384),
  p_coarse_hash text,
  p_embedding_status text DEFAULT 'indexed',
  p_embedding_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  src public.knowledge_sources%ROWTYPE;
  chunk jsonb;
  chunk_embedding extensions.vector(384);
  chunk_embedding_status text;
  inserted_count integer := 0;
BEGIN
  SELECT * INTO src
  FROM public.knowledge_sources
  WHERE id = p_source_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'knowledge_source_not_found: %', p_source_id;
  END IF;

  DELETE FROM public.knowledge_chunks WHERE source_id = p_source_id;

  FOR chunk IN SELECT * FROM jsonb_array_elements(coalesce(p_chunks, '[]'::jsonb))
  LOOP
    chunk_embedding := NULL;
    IF jsonb_typeof(chunk->'embedding') = 'array' THEN
      chunk_embedding := (chunk->'embedding')::text::extensions.vector;
    END IF;
    chunk_embedding_status := coalesce(
      chunk->>'embedding_status',
      CASE WHEN chunk_embedding IS NULL THEN 'failed' ELSE 'indexed' END
    );

    INSERT INTO public.knowledge_chunks (
      source_id, source_type, source_entity_id, document_id, asset_id,
      chunk_index, content, content_hash, char_start, char_end, page_number,
      section_path, source_uri, meta, embedding, embedding_model,
      embedding_dimensions, embedding_status, embedding_error, embedding_updated_at
    )
    VALUES (
      p_source_id, src.source_type, src.source_id, src.document_id, src.asset_id,
      (chunk->>'chunk_index')::integer,
      chunk->>'content',
      chunk->>'content_hash',
      NULLIF(chunk->>'char_start', '')::integer,
      NULLIF(chunk->>'char_end', '')::integer,
      NULLIF(chunk->>'page_number', '')::integer,
      CASE
        WHEN jsonb_typeof(chunk->'section_path') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(chunk->'section_path'))
        ELSE NULL
      END,
      chunk->>'source_uri',
      coalesce(chunk->'meta', '{}'::jsonb),
      chunk_embedding,
      CASE WHEN chunk_embedding IS NULL THEN NULL ELSE p_embedding_model END,
      CASE WHEN chunk_embedding IS NULL THEN NULL ELSE p_embedding_dimensions END,
      chunk_embedding_status,
      CASE WHEN chunk_embedding_status = 'indexed' THEN NULL ELSE p_embedding_error END,
      CASE WHEN chunk_embedding IS NULL THEN NULL ELSE now() END
    );
    inserted_count := inserted_count + 1;
  END LOOP;

  UPDATE public.knowledge_sources
  SET
    extraction_status = 'extracted',
    extraction_method = coalesce(extraction_method, 'native_document'),
    extraction_hash = p_source_hash,
    extraction_error = NULL,
    extracted_at = now(),
    chunk_status = 'indexed',
    chunk_count = inserted_count,
    chunk_source_hash = p_source_hash,
    chunks_updated_at = now(),
    chunk_error = NULL,
    embedding_status = p_embedding_status,
    embedding_error = p_embedding_error,
    indexing_leased_by = NULL,
    indexing_leased_until = NULL
  WHERE id = p_source_id;

  IF src.document_id IS NOT NULL THEN
    UPDATE public.documents
    SET
      embedding = p_coarse_embedding,
      embedding_model = CASE WHEN p_coarse_embedding IS NULL THEN NULL ELSE p_embedding_model END,
      embedding_dimensions = CASE WHEN p_coarse_embedding IS NULL THEN NULL ELSE p_embedding_dimensions END,
      embedding_status = p_embedding_status,
      embedding_source_hash = p_coarse_hash,
      embedding_updated_at = CASE WHEN p_coarse_embedding IS NULL THEN NULL ELSE now() END,
      embedding_error = p_embedding_error,
      embedding_leased_by = NULL,
      embedding_leased_until = NULL,
      chunk_status = 'indexed',
      chunk_count = inserted_count,
      chunk_source_hash = p_source_hash,
      chunks_updated_at = now(),
      chunk_error = NULL
    WHERE id = src.document_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS mark_knowledge_source_failed(uuid, text);
CREATE OR REPLACE FUNCTION mark_knowledge_source_failed(
  p_source_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  src public.knowledge_sources%ROWTYPE;
BEGIN
  SELECT * INTO src
  FROM public.knowledge_sources
  WHERE id = p_source_id;

  UPDATE public.knowledge_sources
  SET
    extraction_status = 'failed',
    extraction_error = left(p_error, 1000),
    chunk_status = 'failed',
    chunk_error = left(p_error, 1000),
    embedding_status = 'failed',
    embedding_error = left(p_error, 1000),
    indexing_leased_by = NULL,
    indexing_leased_until = NULL
  WHERE id = p_source_id;

  IF FOUND AND src.document_id IS NOT NULL THEN
    UPDATE public.documents
    SET
      chunk_status = 'failed',
      chunk_error = left(p_error, 1000),
      embedding_status = 'failed',
      embedding_error = left(p_error, 1000),
      embedding_leased_by = NULL,
      embedding_leased_until = NULL
    WHERE id = src.document_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS search_knowledge_chunks(extensions.vector, integer, text[], uuid, text, uuid);
CREATE OR REPLACE FUNCTION search_knowledge_chunks(
  query_embedding extensions.vector(384),
  match_count integer DEFAULT 10,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_source_type text DEFAULT NULL,
  filter_source_id uuid DEFAULT NULL
)
RETURNS TABLE (
  knowledge_source_id uuid, source_type text, source_entity_id text,
  document_id uuid, asset_id uuid, title text, tags text[], folder_id uuid,
  source_uri text, chunk_id uuid, chunk_index integer, content text,
  char_start integer, char_end integer, page_number integer,
  section_path text[], meta jsonb, updated_at timestamptz, similarity float
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ks.id, ks.source_type, ks.source_id,
    ks.document_id, ks.asset_id, ks.title, ks.tags, ks.folder_id,
    ks.source_uri, kc.id, kc.chunk_index, kc.content,
    kc.char_start, kc.char_end, kc.page_number,
    kc.section_path, kc.meta, kc.updated_at,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks ON ks.id = kc.source_id
  WHERE kc.embedding IS NOT NULL
    AND kc.embedding_status = 'indexed'
    AND ks.archived_at IS NULL
    AND (filter_tags IS NULL OR ks.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ks.folder_id = filter_folder_id)
    AND (filter_source_type IS NULL OR ks.source_type = filter_source_type)
    AND (filter_source_id IS NULL OR ks.id = filter_source_id)
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

DROP FUNCTION IF EXISTS search_knowledge_chunks_text(text, integer, text[], uuid, text, uuid);
CREATE OR REPLACE FUNCTION search_knowledge_chunks_text(
  query_text text,
  match_count integer DEFAULT 10,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL,
  filter_source_type text DEFAULT NULL,
  filter_source_id uuid DEFAULT NULL
)
RETURNS TABLE (
  knowledge_source_id uuid, source_type text, source_entity_id text,
  document_id uuid, asset_id uuid, title text, tags text[], folder_id uuid,
  source_uri text, chunk_id uuid, chunk_index integer, content text,
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
      ks.id, ks.source_type, ks.source_id,
      ks.document_id, ks.asset_id, ks.title, ks.tags, ks.folder_id,
      ks.source_uri, kc.id, kc.chunk_index, kc.content,
      kc.char_start, kc.char_end, kc.page_number,
      kc.section_path, kc.meta, kc.updated_at,
      0::float AS similarity
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_sources ks ON ks.id = kc.source_id
    WHERE ks.archived_at IS NULL
      AND (filter_tags IS NULL OR ks.tags && filter_tags)
      AND (filter_folder_id IS NULL OR ks.folder_id = filter_folder_id)
      AND (filter_source_type IS NULL OR ks.source_type = filter_source_type)
      AND (filter_source_id IS NULL OR ks.id = filter_source_id)
    ORDER BY kc.updated_at DESC
    LIMIT match_count;
    RETURN;
  END IF;

  RETURN QUERY
  WITH query AS (
    SELECT websearch_to_tsquery('english'::regconfig, normalized_query) AS tsquery
  )
  SELECT
    ks.id, ks.source_type, ks.source_id,
    ks.document_id, ks.asset_id, ks.title, ks.tags, ks.folder_id,
    ks.source_uri, kc.id, kc.chunk_index, kc.content,
    kc.char_start, kc.char_end, kc.page_number,
    kc.section_path, kc.meta, kc.updated_at,
    ts_rank_cd(kc.search_vector, query.tsquery)::float AS similarity
  FROM public.knowledge_chunks kc
  JOIN public.knowledge_sources ks ON ks.id = kc.source_id
  CROSS JOIN query
  WHERE ks.archived_at IS NULL
    AND kc.search_vector @@ query.tsquery
    AND (filter_tags IS NULL OR ks.tags && filter_tags)
    AND (filter_folder_id IS NULL OR ks.folder_id = filter_folder_id)
    AND (filter_source_type IS NULL OR ks.source_type = filter_source_type)
    AND (filter_source_id IS NULL OR ks.id = filter_source_id)
  ORDER BY ts_rank_cd(kc.search_vector, query.tsquery) DESC, kc.updated_at DESC
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_documents(extensions.vector, integer, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_documents_text(text, integer, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lease_documents_for_embedding(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_document_embedding_indexed(uuid, extensions.vector, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_document_embedding_failed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lease_knowledge_sources_for_indexing(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_knowledge_source_chunks(uuid, jsonb, text, integer, text, extensions.vector, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_source_failed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks(extensions.vector, integer, text[], uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks_text(text, integer, text[], uuid, text, uuid) TO authenticated, service_role;

-- ── Draft sets ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_sets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  contact_id            uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES templates(id) ON DELETE SET NULL,
  channel               text NOT NULL,
  stage                 text NOT NULL,
  version               integer NOT NULL DEFAULT 1,
  variants              jsonb NOT NULL,
  selected_variant_index integer,
  based_on_draft_set_id uuid REFERENCES draft_sets(id) ON DELETE SET NULL,
  feedback_notes        text,
  status                text NOT NULL DEFAULT 'draft',
  meta                  jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT draft_sets_version_check CHECK (version >= 1),
  CONSTRAINT draft_sets_variants_is_array CHECK (jsonb_typeof(variants) = 'array'),
  CONSTRAINT draft_sets_contact_channel_stage_version_key
    UNIQUE (contact_id, channel, stage, version)
);

CREATE INDEX IF NOT EXISTS idx_draft_sets_contact ON draft_sets(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_sets_status ON draft_sets(status);

DROP TRIGGER IF EXISTS draft_sets_updated_at ON draft_sets;
CREATE TRIGGER draft_sets_updated_at
  BEFORE UPDATE ON draft_sets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
