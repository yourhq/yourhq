-- 006_gateways.sql — Gateway hosts, registration tokens, and token-exchange RPC.

CREATE TABLE IF NOT EXISTS gateways (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  slug          text NOT NULL UNIQUE,
  label         text NOT NULL,
  status        text NOT NULL DEFAULT 'offline',
  last_seen_at  timestamptz,
  meta          jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_gateways_status ON gateways(status);

DROP TRIGGER IF EXISTS gateways_updated_at ON gateways;
CREATE TRIGGER gateways_updated_at
  BEFORE UPDATE ON gateways FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed a default gateway so single-gateway deployments Just Work.
INSERT INTO gateways (slug, label)
VALUES ('default', 'Primary gateway')
ON CONFLICT (slug) DO NOTHING;

-- ── Gateway registration tokens ─────────────────────────────────

CREATE TABLE IF NOT EXISTS gateway_registration_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  token_hash      text NOT NULL UNIQUE,
  label           text,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  consumed_by_gateway_id uuid REFERENCES gateways(id)
);

CREATE INDEX IF NOT EXISTS idx_gateway_tokens_expires
  ON gateway_registration_tokens(expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE gateway_registration_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gateway_registration_tokens_all ON gateway_registration_tokens;
CREATE POLICY gateway_registration_tokens_all ON gateway_registration_tokens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON gateway_registration_tokens TO authenticated;

-- consume_gateway_token: atomic token exchange.
CREATE OR REPLACE FUNCTION consume_gateway_token(
  p_token     text,
  p_label     text DEFAULT NULL,
  p_slug_hint text DEFAULT NULL
)
RETURNS TABLE (gateway_id uuid, gateway_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_hash text;
  v_token_row  public.gateway_registration_tokens%ROWTYPE;
  v_gateway_id uuid;
  v_slug       text;
  v_label      text;
BEGIN
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_token_row
    FROM public.gateway_registration_tokens
   WHERE token_hash = v_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '28000';
  END IF;

  IF v_token_row.consumed_at IS NOT NULL THEN
    RETURN QUERY
      SELECT g.id, g.slug
        FROM public.gateways g
       WHERE g.id = v_token_row.consumed_by_gateway_id;
    RETURN;
  END IF;

  IF v_token_row.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired' USING ERRCODE = '28000';
  END IF;

  v_label := COALESCE(
    NULLIF(trim(p_label),        ''),
    NULLIF(trim(v_token_row.label), ''),
    'Gateway'
  );
  v_slug := COALESCE(NULLIF(trim(p_slug_hint), ''), lower(regexp_replace(v_label, '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  IF v_slug = '' THEN v_slug := 'gateway'; END IF;

  IF EXISTS (SELECT 1 FROM public.gateways WHERE slug = v_slug) THEN
    DECLARE
      v_suffix int := 2;
      v_try    text;
    BEGIN
      LOOP
        v_try := v_slug || '-' || v_suffix;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gateways WHERE slug = v_try);
        v_suffix := v_suffix + 1;
      END LOOP;
      v_slug := v_try;
    END;
  END IF;

  INSERT INTO public.gateways (slug, label, status, meta)
  VALUES (v_slug, v_label, 'provisioning', jsonb_build_object('registered_via', 'token'))
  RETURNING id INTO v_gateway_id;

  UPDATE public.gateway_registration_tokens
     SET consumed_at = now(),
         consumed_by_gateway_id = v_gateway_id
   WHERE id = v_token_row.id;

  RETURN QUERY SELECT v_gateway_id, v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_gateway_token(text, text, text) TO anon, authenticated;
