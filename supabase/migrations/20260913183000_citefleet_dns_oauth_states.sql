-- Single-use DNS OAuth transactions. The browser receives the random state;
-- only its digest is stored, so a database read cannot resume an authorization.

CREATE TABLE IF NOT EXISTS citefleet_dns_oauth_states (
  state_hash    TEXT PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  operation_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL REFERENCES citefleet_workspaces (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES citefleet_users (id) ON DELETE CASCADE,
  site_id       TEXT NOT NULL,
  provider      TEXT NOT NULL CHECK (provider = 'cloudflare'),
  domain        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  CONSTRAINT citefleet_dns_oauth_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS citefleet_dns_oauth_states_expiry_idx
  ON citefleet_dns_oauth_states (expires_at);
CREATE INDEX IF NOT EXISTS citefleet_dns_oauth_states_site_idx
  ON citefleet_dns_oauth_states (workspace_id, site_id, created_at DESC);

ALTER TABLE citefleet_dns_oauth_states OWNER TO citefleet;
ALTER TABLE citefleet_dns_oauth_states ENABLE ROW LEVEL SECURITY;
