-- 017_rls_realtime_storage.sql — Storage bucket setup.

-- ── Storage ─────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read own" ON storage.objects;
DROP POLICY IF EXISTS "Tenant storage isolation" ON storage.objects;
CREATE POLICY "Tenant storage isolation" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'assets' AND (storage.foldername(name))[1] = current_tenant_id()::text)
  WITH CHECK (bucket_id = 'assets' AND (storage.foldername(name))[1] = current_tenant_id()::text);
DROP POLICY IF EXISTS "Service role full access storage" ON storage.objects;
CREATE POLICY "Service role full access storage" ON storage.objects
  FOR ALL TO service_role USING (true) WITH CHECK (true);
