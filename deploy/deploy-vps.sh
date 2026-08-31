#!/usr/bin/env bash
# CiteFleet VPS deploy for citefleet.app on the SHARED 144 box.
# This host also serves resonanse.app, botcentral.org, and wflowprocess.app.
# Never rm sites-enabled/*. Never add default_server. Never 301 unknown Hosts.
set -euo pipefail

DOMAIN="citefleet.app"
APP_DIR="/opt/citefleet"
HOST_PORT="127.0.0.1:3021"
IMAGE="citefleet"
CONTAINER="citefleet"
REPO_URL="https://github.com/mitchvac/citefleet.git"

DB_URL="${1:-}"
if [[ -n "$DB_URL" && ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "Usage: bash deploy/deploy-vps.sh [postgres://...]"
  echo "DATABASE_URL is optional. Omit it to boot on in-memory store."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates rsync >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v nginx >/dev/null || apt-get install -y -qq nginx >/dev/null

mkdir -p "$APP_DIR"
if [[ -f "$APP_DIR/Dockerfile" ]]; then
  git -C "$APP_DIR" pull --ff-only || true
elif [[ -f ./Dockerfile && -f ./deploy/nginx-citefleet.app.conf ]]; then
  rsync -a --delete --exclude .git --exclude node_modules --exclude .output ./ "$APP_DIR/"
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

{
  echo "NODE_ENV=production"
  echo "HOST=0.0.0.0"
  echo "PORT=3000"
  echo "NITRO_HOST=0.0.0.0"
  echo "NITRO_PORT=3000"
  echo "VITE_AUTH_ENABLED=false"
  if [[ -n "$DB_URL" ]]; then
    printf 'DATABASE_URL=%s\n' "$DB_URL"
  fi
} > .env
chmod 600 .env

docker build -t "$IMAGE" .
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --env-file .env \
  -p "$HOST_PORT":3000 \
  "$IMAGE"

BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp -a /etc/nginx/sites-enabled/. "$BK"/ 2>/dev/null || true

cp -f deploy/nginx-citefleet.app.conf /etc/nginx/sites-available/citefleet

CERT_DIR="$(ls -d /etc/letsencrypt/live/*citefleet* 2>/dev/null | head -1 || true)"
if [[ -n "$CERT_DIR" && -f "$CERT_DIR/fullchain.pem" ]]; then
  cat > /etc/nginx/sites-available/citefleet <<NGX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://$DOMAIN\$request_uri;
}
server {
    listen 443 ssl;
    server_name www.$DOMAIN;
    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    return 301 https://$DOMAIN\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    client_max_body_size 8m;
    location / {
        proxy_pass http://$HOST_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGX
fi

ln -sfn /etc/nginx/sites-available/citefleet /etc/nginx/sites-enabled/citefleet
nginx -t
systemctl reload nginx

ok=""
for i in $(seq 1 40); do
  if curl -sf "http://$HOST_PORT/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [[ -n "$ok" ]]; then
  echo "SUCCESS — CiteFleet at https://$DOMAIN (resonanse.app + botcentral.org + wflowprocess.app left intact)"
else
  echo "App did not answer yet. docker logs $CONTAINER --tail 50"
fi
