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

GRANT EXECUTE ON FUNCTION public.search_documents(extensions.vector, integer, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_documents_text(text, integer, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lease_documents_for_embedding(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_document_embedding_indexed(uuid, extensions.vector, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_document_embedding_failed(uuid, text) TO authenticated, service_role;

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
