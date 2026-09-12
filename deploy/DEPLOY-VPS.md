# Deploy CiteFleet to the shared VPS (Docker + nginx)

Target: `https://citefleet.app` on `144.91.66.158`

Same layout as BotCentral:

|                   | BotCentral                   | CiteFleet                        |
| ----------------- | ---------------------------- | -------------------------------- |
| Image / container | `botcentral`                 | `citefleet`                      |
| App dir           | `/opt/botcentral`            | `/opt/citefleet`                 |
| Container port    | 3000                         | 3000                             |
| Host bind         | `127.0.0.1:3020:3000`        | `127.0.0.1:3021:3000`            |
| nginx vhost       | `sites-available/botcentral` | `sites-available/citefleet`      |
| Hosts             | botcentral.org               | citefleet.app, www.citefleet.app |

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

`.env` is injected at `docker run --env-file`. The Dockerfile never copies it.
`deploy-vps.sh` REWRITES `.env` on every run, so nothing hand-edited there
survives a deploy.

### Which database the deploy picks

citefleet.app runs on Supabase (`aws-0-us-east-2.pooler.supabase.com`, cut over
2026-09-04). `deploy-vps.sh` resolves `DATABASE_URL` in this order:

| #   | Source                                     | Notes                              |
| --- | ------------------------------------------ | ---------------------------------- |
| 1   | `bash deploy/deploy-vps.sh postgres://...` | explicit one-off override          |
| 2   | `/root/citefleet-database.url`             | **the durable copy — create this** |
| 3   | `DATABASE_URL` already in `.env`           | survives a bare redeploy           |
| 4   | local `citefleet-postgres` container       | first boot only                    |

Create (2) once, and a redeploy can never drift onto another database:

```bash
grep '^DATABASE_URL=' /opt/citefleet/.env | cut -d= -f2- > /root/citefleet-database.url
chmod 600 /root/citefleet-database.url
```

Until it exists the deploy prints a NOTE saying the string survives only in
`.env`. Every run prints which source it used — never the URL itself, which
carries the password.

A bare run used to jump straight to (4) and write that into `.env`, silently
reverting the Supabase cutover. Nothing looked wrong afterwards: the local
container is started either way and `/health` still answers `"db":"postgres"`.
It just served a different, frozen database. Fixed 2026-09-10.

### Retiring the local `citefleet-postgres`

The local Postgres is **only provisioned when it is actually the database** —
i.e. when (1), (2) and (3) all come up empty. On citefleet.app it is a
pre-migration leftover with no writes since 2026-09-06.

Until 2026-09-10 the deploy created and `docker start`ed it on every run,
regardless of which database the app used, so retiring it by hand lasted only
until the next deploy. It is now inside the first-boot branch. A deploy that
uses an external database never starts it, never touches the `citefleet-pg`
volume, and prints a NOTE if it finds it still running.

Decommission (backup first — the volume is retained, so this is reversible):

```bash
# 1. dump while it is still running, and verify the dump before stopping
docker exec citefleet-postgres pg_dump -U citefleet -d citefleet \
  | gzip > /root/citefleet-pg-$(date +%F).sql.gz
gzip -t /root/citefleet-pg-*.sql.gz && zcat /root/citefleet-pg-*.sql.gz | tail -1

# 2. stop it; `--restart unless-stopped` honours a manual stop across reboots
docker stop citefleet-postgres

# 3. confirm the app is unaffected
curl -s https://citefleet.app/health
```

The `citefleet-pg` volume is deliberately kept. Do not `docker rm -v` or
`docker volume rm citefleet-pg` until the dump has been stored off-box.

Optional: `XAI_API_KEY` for live Grok briefs. Never commit it.

## 2b. Sign-in (accounts + operator token)

Anyone may create an account with email/password or a verified Google/GitHub
email. `/root/citefleet-operator.emails` is an optional comma-separated list of
renewal-reminder recipients; `deploy-vps.sh` injects it as
`CITEFLEET_OPERATOR_EMAILS`. Google/GitHub OAuth apps go in
`/root/citefleet-google.oauth` / `/root/citefleet-github.oauth` (line 1 id,
line 2 secret; redirect URIs `/api/oauth/google-callback`,
`/api/oauth/github-callback`).

`deploy/deploy-vps.sh` generates `/root/citefleet-operator.token` once and
injects it as `CITEFLEET_OPERATOR_TOKEN`. Open `https://citefleet.app/login`
and paste `cat /root/citefleet-operator.token`. Rotate by replacing the file
and redeploying; break-glass sessions bound to the old token stop working.
Account and break-glass sessions are stored as token hashes in Supabase-hosted
PostgreSQL, so a normal redeploy no longer signs everyone out. The script also
generates `/root/citefleet-auth.secret`, used to HMAC client addresses before
the shared rate limiter stores them. The generated environment pins the shared
token to `CITEFLEET_BREAK_GLASS_WORKSPACE=ws-citefleet`; account sessions still
resolve only through workspace membership. The e2e suite signs in with
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
without a redeploy. A new origin needs an apex DNS TXT record
`botcentral-verify=citefleet-app` (no deploy), or the file (Push origin files,
then deploy). The catalog row of
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
