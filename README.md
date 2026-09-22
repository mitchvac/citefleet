# CiteFleet

Enterprise search & AI-answer indexing ops. Command center that audits a site,
assigns Grok fleet bots to the crawl → index → cite playbook, and tracks
Google, Bing, IndexNow, ChatGPT, Copilot, Perplexity, Gemini, Claude, Grok,
and Meta AI coverage.

Live domain: [citefleet.app](https://citefleet.app)

## Find the web before you crawl it.

BotCentral is an owner-proven discovery registry for AI agents. Search verified
websites, understand retrieval/training/action consent, and discover
machine-readable resources before crawling the open web.

CiteFleet is the publisher side of that registry: it onboards an origin, proves
ownership, and publishes the card. BotCentral is the neutral registry bots query
— the two stay separate on purpose. The card format is specified in
`draft-mitchell-botcentral-card-00`, an active IETF Internet-Draft.

## How a site gets listed

1. Onboard the origin on Command (a customer is only a URL; nothing customer-specific is in code).
2. Live audit; prove control. Quickest is the customer-specific apex DNS TXT
   record shown on the campaign (`botcentral-verify=<token>` on `@`, no deploy).
   The campaign detects the authoritative DNS provider and offers direct
   Cloudflare OAuth when configured, or creates a record-bound Entri handoff
   link for its broader provider coverage. The provider's official account and
   TXT guide remain available as the fallback.
   Otherwise get the five origin
   files to the web root: attach the website repo and push the pack (robots,
   sitemap, llms.txt, `.well-known/botcentral.txt`, the IndexNow key file), or
   copy/download each file from **The files bots read** and place them by hand.
3. Verify proof: CiteFleet applies BotCentral's own rules before it publishes, so a missing
   proof is reported with the exact line to add instead of as a 422.
4. List on BotCentral: one signed POST; the card is written only after the registry confirms
   the proof. Optional GitHub webhook or generic deploy hook keeps the card fresh on every deploy.

Docs: [docs/operator-runbook.md](docs/operator-runbook.md) (day to day),
[docs/customer-setup.md](docs/customer-setup.md) (what a customer does),
[deploy/DEPLOY-VPS.md](deploy/DEPLOY-VPS.md) (server), [AGENTS.md](AGENTS.md) (repo map),
[PRIME_DIRECTIVE.md](PRIME_DIRECTIVE.md) (governance for all code changes).

## Compact discovery forwarding

The campaign also offers a compact discovery submission: website name, original
URL, short description, up to 20 page links and 10 topics, plus five generated
files. Authorized AI applications can submit through
`POST /api/discovery/submissions` using a revocable workspace key created in the
campaign. BotCentral receives this at the proposed `/internal/discovery` endpoint.

This is separate from origin-verified publishing. Hosted file copies do not
change origin robots permissions, prove ownership or complete IndexNow.
**The matching BotCentral endpoint must be implemented before this flow can
receive a valid acceptance receipt.** Missing configuration or failed delivery
is shown as a failure, not a successful listing.

[BotCentral implementation prompt and exact contract](docs/botcentral-discovery-handoff.md).

## Stack

TanStack Start + React 19 + Nitro. Docker on a shared VPS
(`/opt/citefleet`, host bind `127.0.0.1:3021`).

## Local

```bash
npm ci --ignore-scripts                # exact committed dependency graph
npm run db:start                       # local Postgres 17, same major as production
npm run db:reset                       # replay supabase/migrations/ into it
export DATABASE_URL=$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')
npm run dev                            # create an account at http://localhost:8080/login
```

`DATABASE_URL` is required — there is no embedded fallback, so the first query
throws with these instructions if it is unset. Schema lives in
`supabase/migrations/` and is applied only by the Supabase CLI: locally with
`npm run db:reset`, in production by the ordered
[release workflow](.github/workflows/release.yml) after a clean schema replay
and before the exact application commit is deployed. The app itself performs
no DDL. After adding a migration
(`npm run db:new <name>`), regenerate types with `npm run db:types` in the same
change.

The console is behind a session gate (`/login`): anyone may create an account
with email/password, Google, or GitHub, and each account receives its own
workspace. The server token remains an ops fallback. Without a valid account
session or that token, every action refuses.
Customer webhooks and `/health` stay public.

## Production (shared VPS)

See [deploy/DEPLOY-VPS.md](deploy/DEPLOY-VPS.md).

```bash
git clone https://github.com/mitchvac/citefleet.git /opt/citefleet
cd /opt/citefleet
bash deploy/deploy-vps.sh
certbot --nginx -d citefleet.app -d www.citefleet.app
```

Does not touch any other container or nginx vhost on the box. The operator
token is minted into `/root/citefleet-operator.token` on first deploy. Pushes
to `main` run quality, schema, migration, exact-SHA deploy, and live smoke gates
in that order; the manual command is the recovery path.

## Tests

```bash
npm test                      # Node 22 — scripts/ and src/ unit suites
npm run typecheck && npm run lint
E2E_OPERATOR_TOKEN=<token> E2E_CHANNEL=chrome npx playwright test --headed
```

The e2e runs against live citefleet.app by default and signs in with the
operator token; `E2E_URL=http://localhost:8080` targets a local dev server.
