-- Durable, customer-scoped authorization and resumable origin installation.
CREATE TABLE citefleet_vercel_installs (
  id UUID PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES citefleet_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES citefleet_users(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  site_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  state_hash TEXT UNIQUE CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  consumed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('authorization-pending','authorized','installing','building','verifying','verified','failed')),
  message TEXT NOT NULL,
  encrypted_token TEXT,
  configuration_id TEXT,
  team_id TEXT,
  target JSONB,
  expected_files JSONB NOT NULL CHECK (jsonb_typeof(expected_files) = 'array' AND jsonb_array_length(expected_files) = 5),
  commit_sha TEXT,
  deployment_id TEXT,
  deployment_url TEXT,
  verified_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  CHECK (expires_at > created_at),
  CHECK ((lease_id IS NULL) = (lease_until IS NULL)),
  CHECK (status NOT IN ('verified','failed') OR encrypted_token IS NULL)
);
CREATE UNIQUE INDEX citefleet_vercel_active_site ON citefleet_vercel_installs(workspace_id,site_id)
  WHERE status NOT IN ('verified','failed');
CREATE INDEX citefleet_vercel_expiry ON citefleet_vercel_installs(expires_at)
  WHERE status NOT IN ('verified','failed');
CREATE INDEX citefleet_vercel_site_history ON citefleet_vercel_installs(workspace_id,site_id,created_at DESC);
ALTER TABLE citefleet_vercel_installs OWNER TO citefleet;
ALTER TABLE citefleet_vercel_installs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON citefleet_vercel_installs FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON citefleet_vercel_installs FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON citefleet_vercel_installs FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON citefleet_vercel_installs FROM service_role;
  END IF;
END $$;
