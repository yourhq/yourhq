-- 017_setup_wizard.sql — Setup wizard RPC for atomic workspace initialization.

CREATE OR REPLACE FUNCTION complete_setup(
  p_name text,
  p_slug text,
  p_description text,
  p_owner_name text,
  p_preferred_name text,
  p_timezone text,
  p_stages jsonb,
  p_fields jsonb,
  p_streams jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update the singleton workspace row
  UPDATE public.workspace SET
    name = p_name,
    slug = p_slug,
    description = nullif(p_description, ''),
    owner_name = nullif(p_owner_name, ''),
    owner_preferred_name = nullif(p_preferred_name, ''),
    owner_timezone = nullif(p_timezone, ''),
    initialized = true,
    updated_at = now()
  WHERE initialized = false;

  -- Clear any existing rows to make this idempotent
  DELETE FROM public.pipeline_stages WHERE entity_type = 'contact';
  DELETE FROM public.field_definitions WHERE entity_type = 'contact';
  DELETE FROM public.streams WHERE true;

  -- Seed pipeline stages
  INSERT INTO public.pipeline_stages (entity_type, stage_key, label, color, sort_order, is_terminal, is_default)
  SELECT
    'contact',
    s->>'stage_key',
    s->>'label',
    s->>'color',
    coalesce((s->>'sort_order')::int, 0),
    coalesce((s->>'is_terminal')::bool, false),
    coalesce((s->>'is_default')::bool, false)
  FROM jsonb_array_elements(p_stages) AS s;

  -- Seed field definitions
  INSERT INTO public.field_definitions (entity_type, field_key, field_type, label, field_group, sort_order, required, options, description, is_active)
  SELECT
    'contact',
    f->>'field_key',
    f->>'field_type',
    f->>'label',
    f->>'field_group',
    coalesce((f->>'sort_order')::int, 0),
    coalesce((f->>'required')::bool, false),
    CASE WHEN f->'options' IS NOT NULL AND f->>'options' != 'null'
         THEN f->'options'
         ELSE NULL END,
    nullif(f->>'description', ''),
    true
  FROM jsonb_array_elements(p_fields) AS f;

  -- Seed task streams
  INSERT INTO public.streams (name, description, type, color, icon, sort_order, meta)
  SELECT
    st->>'name',
    nullif(st->>'description', ''),
    coalesce((st->>'type')::public.stream_type, 'functional'),
    st->>'color',
    st->>'icon',
    coalesce((st->>'sort_order')::int, 0),
    '{}'::jsonb
  FROM jsonb_array_elements(p_streams) AS st;
END;
$$;
