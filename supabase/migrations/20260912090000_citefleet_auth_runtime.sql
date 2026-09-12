-- Durable authentication runtime state.
--
-- The cookie contains a 256-bit random session token. Only its SHA-256 digest
-- is stored here, so a database read cannot be turned into a live session.
-- Account sessions point at citefleet_users; the nullable branch is reserved
-- for the operator-token break-glass path and is bound to a digest of the
-- operator token so rotating that credential revokes its sessions.

CREATE TABLE IF NOT EXISTS citefleet_sessions (
  token_hash          TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id             TEXT REFERENCES citefleet_users (id) ON DELETE CASCADE,
  operator_token_hash TEXT CHECK (
    operator_token_hash IS NULL OR operator_token_hash ~ '^[0-9a-f]{64}$'
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  CONSTRAINT citefleet_sessions_one_identity CHECK (
    (user_id IS NOT NULL AND operator_token_hash IS NULL)
    OR (user_id IS NULL AND operator_token_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS citefleet_sessions_user_idx
  ON citefleet_sessions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS citefleet_sessions_expires_idx
  ON citefleet_sessions (expires_at);

ALTER TABLE citefleet_sessions OWNER TO citefleet;
ALTER TABLE citefleet_sessions ENABLE ROW LEVEL SECURITY;

-- One shared failure budget per obscured client key. The application updates a
-- row with one INSERT ... ON CONFLICT statement, so two containers cannot both
-- observe "four attempts" and independently allow a fifth.
CREATE TABLE IF NOT EXISTS citefleet_auth_failures (
  client_hash   TEXT PRIMARY KEY CHECK (client_hash ~ '^[0-9a-f]{64}$'),
  failure_count INTEGER NOT NULL CHECK (failure_count > 0),
  locked_until  TIMESTAMPTZ,
  last_at       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS citefleet_auth_failures_last_idx
  ON citefleet_auth_failures (last_at);

ALTER TABLE citefleet_auth_failures OWNER TO citefleet;
ALTER TABLE citefleet_auth_failures ENABLE ROW LEVEL SECURITY;
