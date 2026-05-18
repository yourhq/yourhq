-- 022_file_processing.sql — RPCs for the file processing pipeline.
--
-- The file_processor daemon leases knowledge_items with kind='file' and
-- processing_status='ready', extracts text, and marks them done so the
-- embedding pipeline can pick them up.

-- ── lease_knowledge_items_for_processing ───────────────────────────
-- Called by service_role only (file_processor daemon). Not intended for authenticated users.

DROP FUNCTION IF EXISTS lease_knowledge_items_for_processing(text, integer, integer);
CREATE OR REPLACE FUNCTION lease_knowledge_items_for_processing(
  p_gateway_slug text,
  p_limit integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF knowledge_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease_until timestamptz := now() + (p_lease_seconds || ' seconds')::interval;
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.knowledge_items
    WHERE kind = 'file'
      AND processing_status = 'ready'
      AND file_url IS NOT NULL
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.knowledge_items c
  SET processing_status = 'processing',
      updated_at = now()
  FROM candidates
  WHERE c.id = candidates.id
  RETURNING c.*;
END;
$$;

-- ── mark_knowledge_item_processed ─────────────────────────────────

DROP FUNCTION IF EXISTS mark_knowledge_item_processed(uuid, text);
CREATE OR REPLACE FUNCTION mark_knowledge_item_processed(
  p_item_id uuid,
  p_plain_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.knowledge_items
  SET processing_status = 'done',
      plain_text = p_plain_text,
      processing_error = NULL,
      embedding_status = 'pending',
      updated_at = now()
  WHERE id = p_item_id;
END;
$$;

-- ── mark_knowledge_item_processing_failed ─────────────────────────

DROP FUNCTION IF EXISTS mark_knowledge_item_processing_failed(uuid, text);
CREATE OR REPLACE FUNCTION mark_knowledge_item_processing_failed(
  p_item_id uuid,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.knowledge_items
  SET processing_status = 'failed',
      processing_error = p_error,
      updated_at = now()
  WHERE id = p_item_id;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.lease_knowledge_items_for_processing(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_item_processed(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_item_processing_failed(uuid, text) TO authenticated, service_role;

-- ── Schema version ────────────────────────────────────────────────

INSERT INTO _schema_version (version) VALUES (22)
ON CONFLICT (version) DO NOTHING;
