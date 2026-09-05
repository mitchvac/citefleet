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
2. Live audit; attach the website repo; push the origin pack (robots, sitemap, llms.txt,
   `.well-known/botcentral.txt`) or have the customer add one DNS TXT record.
3. Verify proof: CiteFleet applies BotCentral's own rules before it publishes, so a missing
   proof is reported with the exact line to add instead of as a 422.
4. List on BotCentral: one signed POST; the card is written only after the registry confirms
   the proof. Optional GitHub webhook or generic deploy hook keeps the card fresh on every deploy.

Docs: [docs/operator-runbook.md](docs/operator-runbook.md) (day to day),
[docs/customer-setup.md](docs/customer-setup.md) (what a customer does),
[deploy/DEPLOY-VPS.md](deploy/DEPLOY-VPS.md) (server), [AGENTS.md](AGENTS.md) (repo map),
[PRIME_DIRECTIVE.md](PRIME_DIRECTIVE.md) (governance for all code changes).

## Stack

TanStack Start + React 19 + Nitro. Docker on a shared VPS
(`/opt/citefleet`, host bind `127.0.0.1:3021`).

## Local

```bash
npm ci
npm run db:start                       # local Postgres 17, same major as production
npm run db:reset                       # replay supabase/migrations/ into it
export DATABASE_URL=$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"$/\1/p')
CITEFLEET_OPERATOR_TOKEN=$(openssl rand -hex 32) npm run dev   # then sign in at http://localhost:8080/login with that value
```

`DATABASE_URL` is required — there is no embedded fallback, so the first query
throws with these instructions if it is unset. Schema lives in
`supabase/migrations/` and is applied only by the Supabase CLI: locally with
`npm run db:reset`, in production by
[.github/workflows/supabase-migrations.yml](.github/workflows/supabase-migrations.yml)
on merge to `main`. The app itself performs no DDL. After adding a migration
(`npm run db:new <name>`), regenerate types with `npm run db:types` in the same
change.

The console is behind a session gate (`/login`): invite-only accounts
(email/password, Google, GitHub) for the emails in `CITEFLEET_OPERATOR_EMAILS`,
plus the server token as an ops fallback. Without either, every action refuses.
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
token is minted into `/root/citefleet-operator.token` on first deploy.

## Tests

```bash
npm test                      # Node 22 — scripts/ and src/ unit suites
npm run typecheck && npm run lint
E2E_OPERATOR_TOKEN=<token> E2E_CHANNEL=chrome npx playwright test --headed
```

The e2e runs against live citefleet.app by default and signs in with the
operator token; `E2E_URL=http://localhost:8080` targets a local dev server.
