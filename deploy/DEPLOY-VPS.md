# Deploy CiteFleet to the shared VPS (Docker + nginx)

Target: `https://citefleet.app` on `144.91.66.158`

Same layout as Resonance and BotCentral:

| | Resonance | BotCentral | CiteFleet |
|---|---|---|---|
| Image / container | `resonance` | `botcentral` | `citefleet` |
| App dir | `/opt/resonance` | `/opt/botcentral` | `/opt/citefleet` |
| Container port | 3000 | 3000 | 3000 |
| Host bind | `127.0.0.1:3019:3000` | `127.0.0.1:3020:3000` | `127.0.0.1:3021:3000` |
| nginx vhost | `sites-available/resonance` | `sites-available/botcentral` | `sites-available/citefleet` |
| Hosts | resonanse.app | botcentral.org | citefleet.app, www.citefleet.app |

nginx on this box also serves **wflowprocess.app**. Deploy scripts here never
`rm` `sites-enabled/*`, never add `default_server`, and never 301 unknown Hosts.

DNS A records for `citefleet.app` and `www.citefleet.app` already point at
`144.91.66.158`. `*.citefleet.app` CNAME stays on Porkbun.

## 0. Prerequisites

Docker, nginx, certbot — same packages Resonance already uses. Skip if present.

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

## 3. Build & run

One-shot (as root on the box):

```bash
bash deploy/deploy-vps.sh
```

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

This does **not** stop or recreate `resonance`, `botcentral`, or any wflowprocess container.

## 4. nginx + TLS

```bash
sudo cp deploy/nginx-citefleet.app.conf /etc/nginx/sites-available/citefleet
sudo ln -sfn /etc/nginx/sites-available/citefleet /etc/nginx/sites-enabled/citefleet
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d citefleet.app -d www.citefleet.app
```

Open https://citefleet.app

## 5. What stays untouched

- `/etc/nginx/sites-enabled/resonance` and the `resonance` container on `:3019`
- botcentral.org vhost and container on `:3020`
- wflowprocess.app vhost and its containers on `:8090` / `:8091`
- Any other site on this box
