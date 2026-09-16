-- Admit Vercel's short-lived external-integration OAuth state. Like
-- Cloudflare, Vercel returns a one-time code and needs no stored PKCE verifier.

ALTER TABLE citefleet_dns_oauth_states
  DROP CONSTRAINT IF EXISTS citefleet_dns_oauth_states_provider_check,
  DROP CONSTRAINT IF EXISTS citefleet_dns_oauth_states_pkce_check;

ALTER TABLE citefleet_dns_oauth_states
  ADD CONSTRAINT citefleet_dns_oauth_states_provider_check
    CHECK (provider IN ('cloudflare', 'porkbun', 'vercel')),
  ADD CONSTRAINT citefleet_dns_oauth_states_pkce_check
    CHECK (
      (provider IN ('cloudflare', 'vercel') AND pkce_verifier IS NULL)
      OR
      (provider = 'porkbun' AND pkce_verifier ~ '^[A-Za-z0-9._~-]{43,128}$')
    );
