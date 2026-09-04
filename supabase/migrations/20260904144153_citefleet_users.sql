-- Invite-only console accounts (email/password, scrypt hashes).
-- Gated by CITEFLEET_OPERATOR_EMAILS; see src/lib/auth/users.server.ts.

CREATE TABLE IF NOT EXISTS citefleet_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS citefleet_users_email_idx ON citefleet_users (email);
