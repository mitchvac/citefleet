# CiteFleet Origin — Vercel form setup

This document accompanies the public guide implemented at
`https://citefleet.app/docs/integrations/vercel`. Confirm that route returns the
actual guide in production before submitting it as the Documentation URL.

## Profile values

- Name: CiteFleet Origin
- Website: https://citefleet.app
- Documentation URL: https://citefleet.app/docs/integrations/vercel
- Support URL: https://citefleet.app/support
- Public support email: support@citefleet.app
- Privacy Policy URL: https://citefleet.app/privacy
- Terms URL: https://citefleet.app/terms (use as EULA only if these are the terms the operator intends to apply)
- Suggested short description: Prepare crawler discovery files for your Vercel site with CiteFleet.

## Connectable-account integration settings

- Redirect URL: `https://citefleet.app/api/integrations/vercel/callback`
- Integration Configuration scope: **Read**.
- Projects scope: **Read** (includes project-domain reads).
- Other scopes: **None** for this installer.
- No webhook subscriptions, native Base URL, native SSO or Import Resource URL.
- Configuration URL may remain blank; `/integrations/vercel` is a temporary
  browser-bound setup session, not a persistent installation management portal.

This is the connectable-account flow, not a native Marketplace resource server.
The form accepts Redirect URL OR the native Base URL/SSO combination. Do not use
`/api/dns/vercel/callback`: that is a separate, property-bound DNS integration.

The Origin callback exchanges the single-use code and reads the exact
configuration under token-derived team scope. It checks configuration and
integration IDs, selected-project permissions, GitHub repository metadata and
verified, non-redirecting production domains. It retains only bounded metadata
for 30 minutes behind a hashed random browser cookie, never the Vercel token or
code. Metadata is bound to the signed-in user and their resolved workspace.
Explicit CSRF-protected confirmation saves a property and starts the guarded
GitHub installer with the workspace's explicitly authorized token. If no token
is connected, it opens GitHub consent and returns to the matching setup session.
The
customer chooses the actual served folder and confirms a production branch if
Vercel omits it. No listing purchase or automatic catalog publication occurs.

The progress page checks the five live discovery files using the shared body and
content-type predicates, and reads Vercel's status from GitHub for the file commit.
It refreshes every 30 seconds while unverified. Failed installations have an
explicit retry POST; GET refreshes never install. A provider failure is shown
with its Vercel details link when available. Finish is refused until all five
live files pass; deployment status alone does not establish successful installation.
After a setup session expires, the page links back to campaigns rather than
claiming saved work has been lost. GitHub/Vercel consent and fixing application
build failures still require the customer's authorization or code changes.

Vercel-authorized projects are limited to 20 per setup. Projects with over 100
production domains, unsupported Git providers, or no verified production domain
use the documented manual workflow. The setup declines paginated results rather
than silently treating a truncated list as the complete authorization.

## Credentials and deployment

The callback can be deployed before the integration is created. A callback
without an installation code explains how to begin (HTTP 400). A real callback
with missing server credentials returns HTTP 503 with an honest configuration
message; this is not a completed installation.

1. Save the Vercel integration using the Redirect and Documentation URLs above.
2. Store its slug, client ID and client secret in the VPS root-only file
   `/root/citefleet-vercel-origin.oauth`, one per line in that order. Do not paste
   secrets in a PR, chat, URL or tracked env file.
3. The deployment script loads these into `CITEFLEET_VERCEL_ORIGIN_INTEGRATION_SLUG`,
   `CITEFLEET_VERCEL_ORIGIN_CLIENT_ID` and `CITEFLEET_VERCEL_ORIGIN_CLIENT_SECRET`.
   Redeploy after configuring them. These are separate from DNS credentials in
   `/root/citefleet-vercel.oauth` and survive the script's `.env` regeneration.
4. Run a consenting GitHub/Vercel project through authorization, sign-in, project
   confirmation, GitHub install, production deployment, public body/content-type
   verification, and Vercel completion. Do not claim live provider E2E before
   that external-account flow has actually run.

Re-entering a callback while another setup cookie is present does not overwrite
it. Finish or cancel the browser's current setup before restarting. An expired
or other-account cookie can be canceled without exposing its metadata.

## Verification boundaries

`vercel-origin.test.ts` exercises provider-response validation, scoped metadata,
CSRF, callbacks, cancellation and fixed login continuation with controlled
provider transport. `tests/e2e/vercel-origin.spec.ts` and
`vercel-origin.playwright.config.ts` exercise the real built routes and database
using boundary-seeded project metadata. Neither substitutes for live Vercel and
GitHub authorization and a real production file deployment.

## Evidence and content decisions

Observed 2026-09-23 using HTTP status, Content-Type and response-body checks:

- `https://citefleet.app/about`, `/learn`, `/support`: 200 HTML. About explains
  preparation/audit/publishing and no ranking or citation guarantee. Support
  provides info@, support@ and sales@citefleet.app.
- `https://citefleet.app/health`: 200 JSON, revision `9fe196f`, billing on,
  Vercel DNS readiness off. This is a dated observation, not permanent readiness.
- `https://botcentral.org/docs/listing`: 200 HTML; proof by apex DNS TXT or the
  plain-text well-known file; $10 annual listing; free reads and in-term edits.
- `https://botcentral.org/v1/price`: 200 JSON; listing $10.00 / 365 days. It also
  exposes historical $1 job units. The guide separates wallet funding from
  listing purchase instead of presenting catalog reads as charged API calls.
- Vercel's official integration form reference distinguishes Redirect URL from
  native Base URL/Redirect Login URL. Its Git guide explains production versus
  preview branches: https://vercel.com/docs/integrations/create-integration and
  https://vercel.com/docs/git.

Source cross-checks: `originPack.ts`, `OriginPackPanel.tsx`, `CampaignView.tsx`,
`origin-ownership.ts`, `github.ts`, `billing-key.server.ts`, `botcentral.ts`,
`vercel-dns-oauth.server.ts` and `vercel-dns.server.ts`.

The fifth file is conditional on a valid IndexNow key. A commit is not a verified
deployment, DNS proof is not proof of five served files, and a paid wallet is not
an active listing term. These distinctions are intentional in the public guide.
