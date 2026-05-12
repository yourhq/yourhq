-- Full-text search index for contacts
-- Enables efficient server-side search across name, company, title, email

CREATE INDEX IF NOT EXISTS idx_contacts_fts
  ON contacts
  USING GIN (
    to_tsvector('simple',
      coalesce(name, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(email, '')
    )
  );

-- Index on company for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_company
  ON contacts (tenant_id, company)
  WHERE company IS NOT NULL AND archived_at IS NULL;

-- Index on organization name for search
CREATE INDEX IF NOT EXISTS idx_organizations_name
  ON organizations
  USING GIN (to_tsvector('simple', coalesce(name, '')));

-- Grants
GRANT SELECT ON contacts TO authenticated;
GRANT SELECT ON organizations TO authenticated;
GRANT ALL ON contacts TO service_role;
GRANT ALL ON organizations TO service_role;
