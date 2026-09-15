-- Extend the single-use DNS authorization table for Porkbun's PKCE approval
-- flow. The browser receives the request token; only its digest is stored.
-- The verifier is short-lived server state, deleted atomically at callback.

ALTER TABLE citefleet_dns_oauth_states
  DROP CONSTRAINT IF EXISTS citefleet_dns_oauth_states_provider_check;

ALTER TABLE citefleet_dns_oauth_states
  ADD COLUMN IF NOT EXISTS pkce_verifier TEXT;

ALTER TABLE citefleet_dns_oauth_states
  ADD CONSTRAINT citefleet_dns_oauth_states_provider_check
    CHECK (provider IN ('cloudflare', 'porkbun')),
  ADD CONSTRAINT citefleet_dns_oauth_states_pkce_check
    CHECK (
      (provider = 'cloudflare' AND pkce_verifier IS NULL)
      OR
      (provider = 'porkbun' AND pkce_verifier ~ '^[A-Za-z0-9._~-]{43,128}$')
    );
