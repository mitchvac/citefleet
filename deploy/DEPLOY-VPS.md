# Deploy CiteFleet to the shared VPS (Docker + nginx)

Target: `https://citefleet.app` on `144.91.66.158`

Same layout as BotCentral:

| | BotCentral | CiteFleet |
|---|---|---|
| Image / container | `botcentral` | `citefleet` |
| App dir | `/opt/botcentral` | `/opt/citefleet` |
| Container port | 3000 | 3000 |
| Host bind | `127.0.0.1:3020:3000` | `127.0.0.1:3021:3000` |
| nginx vhost | `sites-available/botcentral` | `sites-available/citefleet` |
| Hosts | botcentral.org | citefleet.app, www.citefleet.app |

nginx on this box also serves customer sites on their own loopback ports.
Deploy scripts here never `rm` `sites-enabled/*`, never add `default_server`,
and never 301 unknown Hosts.

DNS A records for `citefleet.app` and `www.citefleet.app` already point at
`144.91.66.158`. `*.citefleet.app` CNAME stays on Porkbun.

## 0. Prerequisites

Docker, nginx, certbot. Skip if present.

## 1. Source

Public repo: [github.com/mitchvac/citefleet](https://github.com/mitchvac/citefleet)

```bash
git clone https://github.com/mitchvac/citefleet.git /opt/citefleet
cd /opt/citefleet
```

## 2. Environment

```bash
cp deploy/.env.production.example .env
```

Minimum to boot: `HOST`, `PORT`, `VITE_AUTH_ENABLED=false`.

`DATABASE_URL` is optional. Empty → in-memory campaign store (lost on restart).
Set it to Neon/Postgres for durable workspaces.

`.env` is injected at `docker run --env-file`. The Dockerfile never copies it.

Optional: `XAI_API_KEY` for live Grok briefs. Never commit it.

## 2b. Sign-in (invite-only accounts + operator token)

Accounts are invite-only: put the allowed emails, comma-separated on ONE line,
in `/root/citefleet-operator.emails`; `deploy-vps.sh` injects
`CITEFLEET_OPERATOR_EMAILS`. Google/GitHub OAuth apps go in
`/root/citefleet-google.oauth` / `/root/citefleet-github.oauth` (line 1 id,
line 2 secret; redirect URIs `/api/oauth/google-callback`,
`/api/oauth/github-callback`). Sign-up, sign-in and OAuth refuse any other
email; an empty list refuses everyone.

`deploy/deploy-vps.sh` generates `/root/citefleet-operator.token` once and
injects it as `CITEFLEET_OPERATOR_TOKEN`. Open `https://citefleet.app/login`
and paste `cat /root/citefleet-operator.token`. Rotate by replacing the file
and redeploying. Sessions live in memory, so every redeploy or container
restart signs the operator out. The e2e suite signs in with
`E2E_OPERATOR_TOKEN=<same value>`.

## 3. Build & run

One-shot (as root on the box):

```bash
bash deploy/deploy-vps.sh
```

The script re-executes itself from a private copy before pulling, so a change to
the script itself takes effect on the same run (before 764531a the first run
after a script change executed the old body).

Manual equivalent:

```bash
docker build -t citefleet .
docker rm -f citefleet >/dev/null 2>&1 || true
docker run -d \
  --name citefleet \
  --restart unless-stopped \
  --env-file .env \
  -p 127.0.0.1:3021:3000 \
  citefleet
```

Verify: `curl -i http://127.0.0.1:3021/health` → `{"ok":true,"service":"citefleet",...}`.

This does **not** stop or recreate any other container on the box.

## 4. nginx + TLS

```bash
sudo cp deploy/nginx-citefleet.app.conf /etc/nginx/sites-available/citefleet
sudo ln -sfn /etc/nginx/sites-available/citefleet /etc/nginx/sites-enabled/citefleet
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d citefleet.app -d www.citefleet.app
```

Open https://citefleet.app

## 5. Rollout of the BotCentral proof token (done 2026-09-02; kept for reference)

CiteFleet sends the shared publisher token `citefleet-app` as the card's
`verifyToken` and writes it into each origin's `/.well-known/botcentral.txt`
(`verify: citefleet-app` plus `botcentral-verify=citefleet-app`). Every file
CiteFleet wrote before already contains it, so origins that serve one pass
without a redeploy. A new origin needs the file (Push origin files, then deploy)
or an apex DNS TXT record `botcentral-verify=citefleet-app`. The catalog row of
an already-listed site is untouched by a rejected refresh.

Order:

1. `bash deploy/deploy-vps.sh` on the box, then `curl -s https://citefleet.app/health`.
2. On Command, make sure a GitHub PAT with repo scope is saved (or
   `/root/citefleet-github.token` exists so `.env` gets `GITHUB_TOKEN`).
3. For each property (every customer origin, plus citefleet.app itself if it is
   attached to `mitchvac/citefleet` root `public`): open the campaign,
   confirm owner/repo/branch/folder, click **Push origin files**. The proof line
   shown in the Origin files panel is what the commit writes.
4. Deploy each website repo so the file is served, then verify it is plain text:
   `curl -s https://<domain>/.well-known/botcentral.txt | grep botcentral-verify=`
5. Click **Refresh BotCentral card** / **List on BotCentral** on each campaign.
   `https://botcentral.org/v1/site/<domain>` must return 200.
6. Run the headed e2e once to clear the duplicate test property:
   `E2E_OPERATOR_TOKEN=$(ssh root@144.91.66.158 cat /root/citefleet-operator.token) E2E_CHANNEL=chrome npx playwright test tests/e2e/list-a-site.spec.ts --headed`

Completed 2026-09-02: both customer origins already served a file containing the
shared token, so no customer redeploy was needed; wflowprocess.app listed at 11:53 UTC.

## 6. What stays untouched

- botcentral.org vhost and container on `:3020`
- Every customer site's vhost and containers
- Any other site on this box
