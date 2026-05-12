-- 033_knowledge_chunk_pipeline.sql — Wire up chunk creation, embedding, and fix source item indexing.

-- ── Fix: mark_knowledge_item_indexed should NOT touch chunk_status ────────────

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

GRANT EXECUTE ON FUNCTION mark_knowledge_item_indexed(uuid, extensions.vector, text, integer, text) TO authenticated, service_role;

-- ── Fix: mark_knowledge_item_failed should NOT touch chunk_status ─────────────

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

GRANT EXECUTE ON FUNCTION mark_knowledge_item_failed(uuid, text) TO authenticated, service_role;

-- ── Fix: lease_knowledge_items_for_indexing must include source items ──────────

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
      AND (
        c.kind IN ('page', 'skill')
        OR (c.kind = 'file' AND c.processing_status = 'done')
        OR (c.kind = 'source' AND c.processing_status = 'done')
      )
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

GRANT EXECUTE ON FUNCTION lease_knowledge_items_for_indexing(text, integer, integer) TO authenticated, service_role;

-- ── New: upsert_knowledge_chunks — replace chunks for an item ─────────────────
-- Called by the embedder after chunking. Deletes stale chunks, inserts fresh ones,
-- returns (id, chunk_index) so the caller can match IDs to embeddings.

CREATE OR REPLACE FUNCTION upsert_knowledge_chunks(
  p_item_id uuid,
  p_chunks jsonb
)
RETURNS TABLE (id uuid, chunk_index integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT ki.tenant_id INTO v_tenant_id
  FROM public.knowledge_items ki
  WHERE ki.id = p_item_id;

  DELETE FROM public.knowledge_chunks WHERE knowledge_item_id = p_item_id;

  RETURN QUERY
  INSERT INTO public.knowledge_chunks (
    tenant_id, knowledge_item_id, chunk_index,
    content, content_hash, char_start, char_end, meta,
    embedding_status
  )
  SELECT
    v_tenant_id,
    p_item_id,
    (elem->>'chunk_index')::integer,
    elem->>'content',
    elem->>'content_hash',
    (elem->>'char_start')::integer,
    (elem->>'char_end')::integer,
    COALESCE(elem->'meta', '{}'::jsonb),
    'pending'
  FROM jsonb_array_elements(p_chunks) AS elem
  ORDER BY (elem->>'chunk_index')::integer
  RETURNING public.knowledge_chunks.id, public.knowledge_chunks.chunk_index;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_knowledge_chunks(uuid, jsonb) TO authenticated, service_role;

-- ── New: mark_knowledge_item_chunks_indexed ───────────────────────────────────

CREATE OR REPLACE FUNCTION mark_knowledge_item_chunks_indexed(
  p_item_id uuid,
  p_chunk_count integer,
  p_source_hash text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.knowledge_items
  SET
    chunk_status = 'indexed',
    chunk_count = p_chunk_count,
    chunk_source_hash = p_source_hash,
    chunks_updated_at = now(),
    chunk_error = NULL,
    updated_at = updated_at
  WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_knowledge_item_chunks_indexed(uuid, integer, text) TO authenticated, service_role;

-- ── New: mark_knowledge_item_chunks_failed ────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_knowledge_item_chunks_failed(
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
    chunk_status = 'failed',
    chunk_error = left(p_error, 1000),
    updated_at = updated_at
  WHERE id = p_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_knowledge_item_chunks_failed(uuid, text) TO authenticated, service_role;

-- ── New: mark_knowledge_chunk_indexed ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_knowledge_chunk_indexed(
  p_chunk_id uuid,
  p_embedding extensions.vector(384),
  p_model text,
  p_dimensions integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.knowledge_chunks
  SET
    embedding = p_embedding,
    embedding_model = p_model,
    embedding_dimensions = p_dimensions,
    embedding_status = 'indexed',
    embedding_updated_at = now(),
    embedding_error = NULL,
    embedding_leased_by = NULL,
    embedding_leased_until = NULL,
    updated_at = updated_at
  WHERE id = p_chunk_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_knowledge_chunk_indexed(uuid, extensions.vector, text, integer) TO authenticated, service_role;

-- ── New: mark_knowledge_chunk_failed ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_knowledge_chunk_failed(
  p_chunk_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.knowledge_chunks
  SET
    embedding_status = 'failed',
    embedding_error = left(p_error, 1000),
    embedding_leased_by = NULL,
    embedding_leased_until = NULL,
    updated_at = updated_at
  WHERE id = p_chunk_id;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_knowledge_chunk_failed(uuid, text) TO authenticated, service_role;
