-- Google/GitHub sign-in alongside email: password_hash becomes optional and
-- (provider, provider_id) is unique. github_token stores the per-account PAT
-- used to push origin files. See src/lib/auth/oauth.server.ts.

ALTER TABLE citefleet_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE citefleet_users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'email';
ALTER TABLE citefleet_users ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE citefleet_users ADD COLUMN IF NOT EXISTS github_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS citefleet_users_provider_id_idx
  ON citefleet_users (provider, provider_id)
  WHERE provider_id IS NOT NULL;
