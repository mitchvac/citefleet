-- Customer-scoped, one-time Hostinger authorization and Bot install jobs.
CREATE TABLE citefleet_hostinger_oauth_states (
  state_hash TEXT PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  workspace_id TEXT NOT NULL REFERENCES citefleet_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES citefleet_users(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  client_id TEXT NOT NULL,
  pkce_verifier TEXT NOT NULL CHECK (pkce_verifier ~ '^[A-Za-z0-9_-]{43,128}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hostinger_oauth_expiry CHECK (expires_at > created_at)
);

CREATE TABLE citefleet_hostinger_install_jobs (
  id UUID PRIMARY KEY,
  capability_hash TEXT NOT NULL UNIQUE CHECK (capability_hash ~ '^[0-9a-f]{64}$'),
  workspace_id TEXT NOT NULL REFERENCES citefleet_workspaces(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  client_id TEXT NOT NULL,
  encrypted_token TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'verified', 'failed')),
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  run_deadline TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT hostinger_job_expiry CHECK (expires_at > created_at)
);

CREATE INDEX citefleet_hostinger_jobs_site_idx
  ON citefleet_hostinger_install_jobs(workspace_id, site_id, created_at DESC);
CREATE INDEX citefleet_hostinger_jobs_expiry_idx
  ON citefleet_hostinger_install_jobs(expires_at);

ALTER TABLE citefleet_hostinger_oauth_states OWNER TO citefleet;
ALTER TABLE citefleet_hostinger_install_jobs OWNER TO citefleet;
ALTER TABLE citefleet_hostinger_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE citefleet_hostinger_install_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON citefleet_hostinger_oauth_states FROM PUBLIC;
REVOKE ALL ON citefleet_hostinger_install_jobs FROM PUBLIC;
