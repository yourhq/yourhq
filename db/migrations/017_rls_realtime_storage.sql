-- 017_rls_realtime_storage.sql — Storage bucket setup.

-- ── Storage ─────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assets');
DROP POLICY IF EXISTS "Authenticated users can read own" ON storage.objects;
CREATE POLICY "Authenticated users can read own" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'assets');
DROP POLICY IF EXISTS "Service role full access storage" ON storage.objects;
CREATE POLICY "Service role full access storage" ON storage.objects
  FOR ALL TO service_role USING (true) WITH CHECK (true);
