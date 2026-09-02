# CiteFleet

Enterprise search & AI-answer indexing ops. Command center that audits a site,
assigns Grok fleet bots to the crawl → index → cite playbook, and tracks
Google, Bing, IndexNow, ChatGPT, Copilot, Perplexity, Gemini, Claude, Grok,
and Meta AI coverage.

Live domain: [citefleet.app](https://citefleet.app)

## Stack

TanStack Start + React 19 + Nitro. Docker on a shared VPS
(`/opt/citefleet`, host bind `127.0.0.1:3021`).

## Local

```bash
npm ci
CITEFLEET_OPERATOR_TOKEN=$(openssl rand -hex 32) npm run dev   # then sign in at http://localhost:8080/login with that value
```

The console is behind a single-operator gate (`/login`). Without
`CITEFLEET_OPERATOR_TOKEN` every action refuses. Customer webhooks and
`/health` stay public.

## Production (shared VPS)

See [deploy/DEPLOY-VPS.md](deploy/DEPLOY-VPS.md).

```bash
git clone https://github.com/mitchvac/citefleet.git /opt/citefleet
cd /opt/citefleet
bash deploy/deploy-vps.sh
certbot --nginx -d citefleet.app -d www.citefleet.app
```

Does not touch any other container or nginx vhost on the box.
