-- Password reset tokens for the invite-only console.
-- See src/lib/auth/password-reset.server.ts.
--
-- The token is NEVER stored, only its SHA-256. Reading this table must not
-- yield a usable reset link — a database backup, a log, or a leaked row are all
-- worthless without the plaintext that only ever existed in one email.
--
-- Single-use (used_at) and short-lived (expires_at). Consuming is an atomic
-- UPDATE ... WHERE used_at IS NULL so two racing requests cannot both win.
--
-- Ownership and RLS are set HERE rather than left to
-- 20260904144200_own_public_tables_as_citefleet and
-- 20260904144211_enable_rls_no_policies. Those loop over schema public at their
-- own position in the ledger: on a fresh `supabase db reset` they run BEFORE
-- this table exists, so they would not cover it. Ownership is functional and
-- not merely posture — the app connects as `citefleet`, and a table owned by
-- the migration role would be unwritable and would bypass nothing.

CREATE TABLE IF NOT EXISTS citefleet_password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES citefleet_users (id) ON DELETE CASCADE,
  -- SHA-256 of the token. Unique so a hash collision cannot alias two resets.
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  -- Kept for abuse review; never shown to the requester.
  requested_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS citefleet_password_resets_user_idx
  ON citefleet_password_resets (user_id);
-- Supports the sweep that deletes expired rows.
CREATE INDEX IF NOT EXISTS citefleet_password_resets_expires_idx
  ON citefleet_password_resets (expires_at);

ALTER TABLE citefleet_password_resets OWNER TO citefleet;
ALTER TABLE citefleet_password_resets ENABLE ROW LEVEL SECURITY;
