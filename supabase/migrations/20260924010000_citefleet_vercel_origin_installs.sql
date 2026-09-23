-- Metadata-only, short-lived installation handoff. OAuth codes and provider
-- access tokens are never persisted. Tenant isolation is enforced by the app;
-- the owning server role bypasses RLS, while web roles have neither grants nor policies.
CREATE TABLE citefleet_vercel_origin_installs (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  user_id TEXT REFERENCES citefleet_users(id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES citefleet_workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  site_id TEXT,
  CHECK ((user_id IS NULL) = (workspace_id IS NULL)),
  CHECK (expires_at > created_at)
);
CREATE INDEX citefleet_vercel_origin_installs_expiry_idx ON citefleet_vercel_origin_installs(expires_at);
ALTER TABLE citefleet_vercel_origin_installs OWNER TO citefleet;
ALTER TABLE citefleet_vercel_origin_installs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON citefleet_vercel_origin_installs FROM PUBLIC, anon, authenticated, service_role;
