CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  tagline TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT,
  logo_file_name TEXT,
  logo_content_type TEXT,
  logo_content BYTEA,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organizations (slug, name, tagline, country)
VALUES ('ddin', 'DDIN', 'Network of the Best', 'Rwanda')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE accounts ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE app_users ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE app_users ADD COLUMN username TEXT;
ALTER TABLE app_users ADD COLUMN platform_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE audit_log ADD COLUMN organization_id UUID REFERENCES organizations(id);

-- Existing installations already protect audit history from updates. Temporarily
-- remove that trigger so legacy rows can receive their tenant identifier.
DROP TRIGGER audit_log_no_update ON audit_log;

UPDATE accounts
SET organization_id = (SELECT id FROM organizations WHERE slug = 'ddin')
WHERE organization_id IS NULL;

UPDATE app_users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'ddin'),
    username = lower(email)
WHERE organization_id IS NULL OR username IS NULL;

UPDATE audit_log
SET organization_id = (SELECT id FROM organizations WHERE slug = 'ddin')
WHERE organization_id IS NULL;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

ALTER TABLE accounts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE app_users ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE app_users ALTER COLUMN username SET NOT NULL;
ALTER TABLE app_users ADD CONSTRAINT app_users_tenant_scope_check
  CHECK ((platform_admin = TRUE AND organization_id IS NULL) OR (platform_admin = FALSE AND organization_id IS NOT NULL));

CREATE INDEX accounts_organization_idx ON accounts(organization_id, name);
CREATE INDEX app_users_organization_idx ON app_users(organization_id, name);
CREATE UNIQUE INDEX app_users_username_unique_idx ON app_users(lower(username));
CREATE INDEX audit_log_organization_created_idx ON audit_log(organization_id, created_at DESC);
