# CiteFleet domain library

Read repository `PRIME_DIRECTIVE.md` and root `AGENTS.md` first. This is
the file map for `src/lib/citefleet/`; it does not assert live production state.

| File | Purpose |
| --- | --- |
| `AGENTS.md` | This folder map. |
| `dns-providers/` | Individual DNS provider definitions. |
| `auditor.test.ts` | Site audits tests. |
| `auditor.ts` | Site audits. |
| `autopilot.ts` | Automation. |
| `botcentral.test.ts` | BotCentral integration tests. |
| `botcentral.ts` | BotCentral integration. |
| `bots.ts` | Bot roster. |
| `catalog-hook.test.ts` | Catalog hooks tests. |
| `client-bundle-guard.test.ts` | Browser bundle boundaries tests. |
| `client.ts` | Browser API calls. |
| `clipboard.test.ts` | Clipboard handling tests. |
| `clipboard.ts` | Clipboard handling. |
| `cloudflare-dns.server.ts` | Cloudflare DNS server adapter. |
| `cloudflare-dns.test.ts` | Cloudflare DNS tests. |
| `control.ts` | Operator controls. |
| `course.ts` | Training course. |
| `dispatcher.ts` | Site workflow dispatch. |
| `dns-oauth-state.server.ts` | DNS authorization state server adapter. |
| `dns-oauth-state.test.ts` | DNS authorization state tests. |
| `dns-oauth.server.ts` | DNS authorization server adapter. |
| `dns-provider-detection.server.ts` | DNS provider detection server adapter. |
| `dns-provider-detection.test.ts` | DNS provider detection tests. |
| `dns-provider.test.ts` | DNS provider catalog tests. |
| `dns-provider.ts` | DNS provider catalog. |
| `dns-setup.server.ts` | DNS setup server adapter. |
| `dns-setup.test.ts` | DNS setup tests. |
| `entri-webhook.test.ts` | Entri callbacks tests. |
| `entri-webhook.ts` | Entri callbacks. |
| `fleet-api-gate.test.ts` | Fleet API access tests. |
| `fleet-api.ts` | Fleet server API. |
| `github-connect.test.ts` | GitHub connection tests. |
| `github.ts` | GitHub integration. |
| `glossary.ts` | Product glossary. |
| `grokApi.ts` | Grok API. |
| `grokBriefs.ts` | Grok briefs. |
| `hook-tenant.server.ts` | Webhook tenant resolution server adapter. |
| `hosting-hint.ts` | Hosting hints. |
| `hosting.test.ts` | Hosting guidance tests. |
| `hosting.ts` | Hosting guidance. |
| `hostinger-files.server.ts` | Exact-site Hostinger file inspection and ownership-safe TUS upload adapter. |
| `hostinger-files.test.ts` | Hostinger API adapter tests for upload, existing files, and unsupported sites. |
| `indexnow-flow.test.ts` | Tests IndexNow task transitions and URL submission. |
| `indexnow-submit.test.ts` | Tests IndexNow HTTP submission responses and safety checks. |
| `indexnow-submit.ts` | Checks the live key and sitemap, then submits URLs to IndexNow. |
| `indexnow.test.ts` | IndexNow key helpers tests. |
| `indexnow.ts` | IndexNow key helpers. |
| `listing-term.test.ts` | Listing terms tests. |
| `listing-term.ts` | Listing terms. |
| `monitor.ts` | Site monitoring. |
| `ops.server.ts` | Server operations server adapter. |
| `origin-file-check.test.ts` | Origin file verification tests. |
| `origin-file-check.ts` | Origin file verification. |
| `origin-ownership.test.ts` | Origin file ownership tests. |
| `origin-ownership.ts` | Origin file ownership. |
| `origin-repo.test.ts` | Repository installation tests. |
| `origin-repo.ts` | Repository installation. |
| `originPack.test.ts` | Origin file generation tests. |
| `originPack.ts` | Origin file generation. |
| `pay-uri.test.ts` | Payment URIs tests. |
| `pay-uri.ts` | Payment URIs. |
| `persist.ts` | Workspace persistence. |
| `playbook.ts` | Playbook rules. |
| `porkbun-dns-oauth.server.ts` | Porkbun DNS authorization server adapter. |
| `porkbun-dns.server.ts` | Porkbun DNS server adapter. |
| `porkbun-dns.test.ts` | Porkbun DNS tests. |
| `proof-record.test.ts` | Proof record generation tests. |
| `proof-record.ts` | Proof record generation. |
| `proof.test.ts` | Site proof tests. |
| `proof.ts` | Site proof. |
| `provider-choice.test.ts` | Hosting provider selection tests. |
| `provider-choice.ts` | Hosting provider selection. |
| `provider-flow.test.ts` | Hosting flow model tests. |
| `provider-flow.ts` | Hosting flow model. |
| `provider-flows.test.ts` | Hosting provider registry and provider-document matching tests. |
| `provider-flows.ts` | Hosting provider options and current automation status. |
| `provider-persist.test.ts` | Provider persistence tests. |
| `qr.test.ts` | QR helpers tests. |
| `qr.ts` | QR helpers. |
| `reconcile.test.ts` | Site score reconciliation tests. |
| `reconcile.ts` | Site score reconciliation. |
| `route-discovery.test.ts` | Sitemap URL discovery tests. |
| `route-discovery.ts` | Sitemap URL discovery. |
| `secrets.test.ts` | Credential handling tests. |
| `secrets.ts` | Credential handling. |
| `seed.ts` | Initial workspace state. |
| `share-app.test.ts` | App sharing tests. |
| `share-app.ts` | App sharing. |
| `store.test.ts` | Workspace store tests. |
| `store.ts` | Workspace store. |
| `task-state.test.ts` | Task state transitions tests. |
| `task-state.ts` | Task state transitions. |
| `topup.server.ts` | Top-up server adapter. |
| `topup.test.ts` | Top-up tests. |
| `topup.ts` | Top-up. |
| `types.ts` | Domain types. |
| `vercel-dns-oauth.server.ts` | Vercel DNS authorization server adapter. |
| `vercel-dns.server.ts` | Vercel DNS server adapter. |
| `vercel-dns.test.ts` | Vercel DNS tests. |
| `verify-token.test.ts` | Proof token checks tests. |
| `verify-token.ts` | Proof token checks. |
| `webhook-body.server.ts` | Bounded webhook bodies server adapter. |
| `webhook-body.test.ts` | Bounded webhook bodies tests. |
| `webhook-proof-state.test.ts` | Webhook proof state tests. |
| `webhook-proof-state.ts` | Webhook proof state. |
| `webhook.test.ts` | Webhook events tests. |
| `webhook.ts` | Webhook events. |
| `workspace-handle.test.ts` | Workspace access tests. |
| `workspace-handle.ts` | Workspace access. |
| `workspace-id.test.ts` | Workspace identifiers tests. |
| `workspace-id.ts` | Workspace identifiers. |
| `workspace-registry.server.ts` | Workspace registry server adapter. |
| `workspace-registry.test.ts` | Workspace registry tests. |

Update the relevant row when a file changes materially; add a row for every new file.
