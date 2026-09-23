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

The guide describes the existing GitHub-based installation path. Do not publish
marketplace copy claiming that installing the Vercel integration already writes
five files or deploys a website. The current Vercel provider callback handles DNS
proof and can subsequently attempt catalog listing; it does not install files.

## The required redirect is separate work

The form's validation says a Redirect URL OR the native Base URL plus Redirect
Login URL/SSO combination is required. It does not require both alternatives.

The implemented `/api/dns/vercel/callback` belongs to the separate temporary DNS
integration. It consumes an authenticated, property-bound OAuth state. It is not
a general landing page or the callback for the advertised Origin installer.
Do not use the documentation page, homepage, GitHub OAuth callback, or DNS
callback merely to satisfy the Origin Redirect URL field.

The five-file Marketplace installer still needs its own implemented and tested
installation flow before a Redirect URL can be supplied for that purpose.
A public documentation page does not implement that flow. This change does not
create native SSO, a Marketplace resource server, an import handler or a Vercel
webhook receiver. Do not supply invented endpoint URLs or subscribe to events
without the corresponding handler. Choose scopes from the actual completed
workflow; no installer scope set is verified by this documentation change.

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
