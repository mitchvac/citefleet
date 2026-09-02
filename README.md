# CiteFleet

Enterprise search & AI-answer indexing ops. Command center that audits a site,
assigns Grok fleet bots to the crawl → index → cite playbook, and tracks
Google, Bing, IndexNow, ChatGPT, Copilot, Perplexity, Gemini, Claude, Grok,
and Meta AI coverage.

Live domain: [citefleet.app](https://citefleet.app)

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
CITEFLEET_OPERATOR_TOKEN=$(openssl rand -hex 32) npm run dev   # then sign in at http://localhost:8080/login with that value
```

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
