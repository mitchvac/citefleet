#!/usr/bin/env bash
# CiteFleet VPS deploy for citefleet.app on the SHARED 144 box.
# This host also serves other sites (botcentral.org, customer origins).
# Never rm sites-enabled/*. Never add default_server. Never 301 unknown Hosts.
set -euo pipefail

TARGET_REVISION="${CITEFLEET_DEPLOY_REVISION:-}"
if [[ -n "$TARGET_REVISION" && ! "$TARGET_REVISION" =~ ^[0-9a-f]{40}$ ]]; then
  echo "deploy: CITEFLEET_DEPLOY_REVISION must be one full lowercase git SHA" >&2
  exit 1
fi

# Bash reads a script incrementally and `git reset --hard` replaces this file
# mid-run. So: sync the checkout FIRST, then re-exec the UPDATED script from a
# private copy (with the git step skipped) — a change to this script takes
# effect on the same deploy. (An earlier version copied before syncing, which
# guaranteed the old body ran once more.)
if [[ -z "${CITEFLEET_DEPLOY_COPY:-}" ]]; then
  if [[ "${CITEFLEET_SKIP_GIT:-}" != "1" && -d "/opt/citefleet/.git" ]]; then
    git -C /opt/citefleet fetch origin
    if [[ -n "$TARGET_REVISION" ]]; then
      MAIN_REVISION="$(git -C /opt/citefleet rev-parse --verify origin/main)"
      if [[ "$TARGET_REVISION" != "$MAIN_REVISION" ]]; then
        echo "deploy: requested revision is not current origin/main" >&2
        exit 1
      fi
      git -C /opt/citefleet checkout --detach "$TARGET_REVISION"
      git -C /opt/citefleet reset --hard "$TARGET_REVISION"
    else
      git -C /opt/citefleet checkout -B main origin/main
      git -C /opt/citefleet reset --hard origin/main
    fi
  fi
  _copy="$(mktemp /tmp/citefleet-deploy.XXXXXX)"
  cp /opt/citefleet/deploy/deploy-vps.sh "$_copy" 2>/dev/null || cp "${BASH_SOURCE[0]}" "$_copy"
  CITEFLEET_DEPLOY_COPY=1 CITEFLEET_SKIP_GIT=1 exec bash "$_copy" "$@"
fi

DOMAIN="citefleet.app"
APP_DIR="/opt/citefleet"
HOST_PORT="127.0.0.1:3021"
IMAGE="citefleet"
CONTAINER="citefleet"
REPO_URL="https://github.com/mitchvac/citefleet.git"

DB_URL="${1:-}"
if [[ -n "$DB_URL" && ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "Usage: bash deploy/deploy-vps.sh [postgres://...]"
  echo "DATABASE_URL may be omitted only when the durable URL already exists on the VPS."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates rsync >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v nginx >/dev/null || apt-get install -y -qq nginx >/dev/null

mkdir -p "$APP_DIR"
if [[ "${CITEFLEET_SKIP_GIT:-}" != "1" ]]; then
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin
  if [[ -n "$TARGET_REVISION" ]]; then
    MAIN_REVISION="$(git -C "$APP_DIR" rev-parse --verify origin/main)"
    if [[ "$TARGET_REVISION" != "$MAIN_REVISION" ]]; then
      echo "deploy: requested revision is not current origin/main" >&2
      exit 1
    fi
    git -C "$APP_DIR" checkout --detach "$TARGET_REVISION"
    git -C "$APP_DIR" reset --hard "$TARGET_REVISION"
  else
    git -C "$APP_DIR" checkout -B main origin/main
    git -C "$APP_DIR" reset --hard origin/main
  fi
elif [[ -f ./Dockerfile && -f ./deploy/nginx-citefleet.app.conf ]]; then
  tar -C . --exclude .git --exclude node_modules --exclude .output -cf - . | tar -C "$APP_DIR" -xf -
else
  git clone "$REPO_URL" "$APP_DIR"
fi
fi
cd "$APP_DIR"

REVISION="$(git rev-parse --verify HEAD 2>/dev/null || true)"
if [[ ! "$REVISION" =~ ^[0-9a-f]{40}$ ]]; then
  echo "deploy: the application checkout has no full git revision" >&2
  exit 1
fi
if [[ -n "$TARGET_REVISION" && "$REVISION" != "$TARGET_REVISION" ]]; then
  echo "deploy: checkout does not match CITEFLEET_DEPLOY_REVISION" >&2
  exit 1
fi
echo "deploy: revision $REVISION"

# Keep the forced-command wrapper current after every trusted manual deploy.
install -m 755 deploy/ci-deploy-command.sh /usr/local/sbin/citefleet-ci-deploy
install -m 644 deploy/nginx-security-headers.conf /etc/nginx/snippets/citefleet-security-headers.conf

TOKEN_FILE="/root/citefleet-botcentral.token"
if [[ ! -s "$TOKEN_FILE" ]]; then
  openssl rand -hex 32 > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi
SERVICE_TOKEN="$(tr -d '\n' < "$TOKEN_FILE")"

# Operator token remains as an ops fallback. Users sign in with email/password.
OP_FILE="/root/citefleet-operator.token"
if [[ ! -s "$OP_FILE" ]]; then
  openssl rand -hex 32 > "$OP_FILE"
  chmod 600 "$OP_FILE"
fi
OPERATOR_TOKEN="$(tr -d '\n' < "$OP_FILE")"

# HMAC key for obscuring client addresses in the distributed auth limiter.
# Separate from the operator credential so either can rotate independently.
AUTH_FILE="/root/citefleet-auth.secret"
if [[ ! -s "$AUTH_FILE" ]]; then
  openssl rand -hex 32 > "$AUTH_FILE"
  chmod 600 "$AUTH_FILE"
fi
AUTH_SECRET="$(tr -d '\n' < "$AUTH_FILE")"

NET="citefleet-net"
PG_NAME="citefleet-postgres"
PASS_FILE="/root/citefleet-postgres.pass"
DB_FILE="/root/citefleet-database.url"

# Where DATABASE_URL comes from, highest precedence first:
#   1. the CLI argument               — an explicit one-off override
#   2. /root/citefleet-database.url   — the operator's durable copy, same idiom
#      as citefleet-operator.token and citefleet-postgres.pass
#   3. the DATABASE_URL already in .env — survives a bare redeploy
#   4. the local citefleet-postgres container — first boot only
#
# Before any of this existed a bare run jumped straight to (4) and wrote it to
# .env, silently reverting the 2026-09-04 Supabase cutover and pointing the app
# at a stale local database that still answers `db: postgres` on /health, so
# nothing looked wrong. citefleet.app runs on the Supabase pooler
# (aws-0-us-east-2.pooler.supabase.com); the local container is a leftover.
#
# Operators create $DB_FILE by hand; this script only ever reads it. Once it
# exists it outranks .env, so a redeploy cannot drift onto another database.
#
# This resolution happens BEFORE any Postgres provisioning, so that a box using
# an external database never creates, starts, or waits on a local one.
DB_IS_LOCAL=0
DB_SOURCE=""
if [[ -n "$DB_URL" ]]; then
  DB_SOURCE="the command line"
elif [[ -s "$DB_FILE" ]]; then
  DB_URL="$(tr -d '\n' < "$DB_FILE")"
  DB_SOURCE="$DB_FILE"
elif [[ -f "$APP_DIR/.env" ]]; then
  DB_URL="$(sed -n 's/^DATABASE_URL=//p' "$APP_DIR/.env" | head -n1)"
  [[ -n "$DB_URL" ]] && DB_SOURCE="$APP_DIR/.env"
fi
[[ -z "$DB_URL" ]] && DB_IS_LOCAL=1

# The app container joins this network whichever database it talks to.
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET"

if [[ "$DB_IS_LOCAL" == 1 ]]; then
  # Only now is a local Postgres actually needed. Provisioning it unconditionally
  # is what kept the decommissioned container alive: every deploy ran
  # `docker start`, so retiring it by hand lasted until the next deploy.
  if [[ ! -s "$PASS_FILE" ]]; then
    openssl rand -hex 24 > "$PASS_FILE"
    chmod 600 "$PASS_FILE"
  fi
  PG_PASS="$(tr -d '\n' < "$PASS_FILE")"
  docker volume inspect citefleet-pg >/dev/null 2>&1 || docker volume create citefleet-pg
  if docker ps -a --format '{{.Names}}' | grep -qx "$PG_NAME"; then
    docker start "$PG_NAME" >/dev/null
    docker network connect "$NET" "$PG_NAME" 2>/dev/null || true
  else
    docker run -d \
      --name "$PG_NAME" \
      --restart unless-stopped \
      --network "$NET" \
      -e POSTGRES_USER=citefleet \
      -e POSTGRES_PASSWORD="$PG_PASS" \
      -e POSTGRES_DB=citefleet \
      -v citefleet-pg:/var/lib/postgresql/data \
      postgres:16-alpine
  fi
  for _ in $(seq 1 40); do
    if docker exec "$PG_NAME" pg_isready -U citefleet >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  DB_URL="postgres://citefleet:${PG_PASS}@${PG_NAME}:5432/citefleet"
  DB_SOURCE="the local $PG_NAME container (no argument, no $DB_FILE, none in .env)"
elif docker ps --format '{{.Names}}' | grep -qx "$PG_NAME"; then
  # Retired, but someone left it running. Say so; do not stop it as a side
  # effect of a deploy — decommissioning is a deliberate act, not a surprise.
  echo "deploy: NOTE $PG_NAME is running but UNUSED (this deploy uses $DB_SOURCE)."
  echo "deploy:      retire it with: docker stop $PG_NAME   (volume citefleet-pg is kept)"
fi

# Never print DB_URL itself — it carries the password.
echo "deploy: DATABASE_URL taken from $DB_SOURCE"
if [[ ! -s "$DB_FILE" && "$DB_IS_LOCAL" != 1 ]]; then
  echo "deploy: NOTE $DB_FILE does not exist — DATABASE_URL survives only in .env."
  echo "deploy:      create it (chmod 600) so the string has a durable home."
fi

{
  echo "NODE_ENV=production"
  echo "HOST=0.0.0.0"
  echo "PORT=3000"
  echo "NITRO_HOST=0.0.0.0"
  echo "NITRO_PORT=3000"
  echo "VITE_AUTH_ENABLED=false"
  echo "CITEFLEET_PUBLIC_URL=https://citefleet.app"
  printf 'CITEFLEET_REVISION=%s\n' "$REVISION"
  echo "BOTCENTRAL_URL=https://botcentral.org"
  printf 'BOTCENTRAL_SERVICE_TOKEN=%s\n' "$SERVICE_TOKEN"
  printf 'CITEFLEET_OPERATOR_TOKEN=%s\n' "$OPERATOR_TOKEN"
  printf 'CITEFLEET_AUTH_SECRET=%s\n' "$AUTH_SECRET"
  # The shared token is deliberately scoped to one existing workspace. Account
  # sessions still resolve through membership and never consult this value.
  echo "CITEFLEET_BREAK_GLASS_WORKSPACE=ws-citefleet"
  # Optional comma-separated recipients for listing-renewal reminders.
  if [[ -s /root/citefleet-operator.emails ]]; then
    printf 'CITEFLEET_OPERATOR_EMAILS=%s\n' "$(tr -d '\n' < /root/citefleet-operator.emails)"
  fi
  if [[ -s /root/citefleet-github.token ]]; then
    printf 'GITHUB_TOKEN=%s\n' "$(tr -d '\n' < /root/citefleet-github.token)"
  fi
  # Gmail submission for password-reset email (src/lib/mail/smtp.ts).
  # Two lines: the sending address, then a Google APP PASSWORD (2FA required —
  # the account password is refused with 535). Absent, /login simply does not
  # offer a reset; nothing else changes.
  #   printf '%s\n%s\n' 'ops@example.com' 'xxxx xxxx xxxx xxxx' \
  #     > /root/citefleet-gmail.smtp && chmod 600 /root/citefleet-gmail.smtp
  if [[ -s /root/citefleet-gmail.smtp ]]; then
    mapfile -t _m < /root/citefleet-gmail.smtp
    printf 'CITEFLEET_SMTP_USER=%s\n' "${_m[0]//$'\r'/}"
    printf 'CITEFLEET_SMTP_PASSWORD=%s\n' "${_m[1]//$'\r'/}"
  fi
  if [[ -s /root/citefleet-google.oauth ]]; then
    mapfile -t _g < /root/citefleet-google.oauth
    printf 'GOOGLE_CLIENT_ID=%s\n' "${_g[0]//$'\r'/}"
    printf 'GOOGLE_CLIENT_SECRET=%s\n' "${_g[1]//$'\r'/}"
  fi
  if [[ -s /root/citefleet-github.oauth ]]; then
    mapfile -t _h < /root/citefleet-github.oauth
    printf 'GITHUB_OAUTH_CLIENT_ID=%s\n' "${_h[0]//$'\r'/}"
    printf 'GITHUB_OAUTH_CLIENT_SECRET=%s\n' "${_h[1]//$'\r'/}"
  fi
  # Listing-year billing (BotCentral brief, 2026-09-06). OFF until a key has
  # been funded end to end — a publish with an unfunded key is a 402. Turn it
  # on with `touch /root/citefleet-billing.on` and redeploy; remove the file
  # and redeploy to stop sending the key prefix again.
  if [[ -e /root/citefleet-billing.on ]]; then
    echo "CITEFLEET_BOTCENTRAL_BILLING=on"
  fi
  # BotCentral signs its webhooks with BOTCENTRAL_WEBHOOK_SECRET when it has
  # one, else with the shared service token above. Only set this when the SAME
  # value is set in /opt/botcentral/.env, or every event answers 401.
  if [[ -s /root/citefleet-botcentral-webhook.secret ]]; then
    printf 'BOTCENTRAL_WEBHOOK_SECRET=%s\n' "$(tr -d '\n' < /root/citefleet-botcentral-webhook.secret)"
  fi
  printf 'DATABASE_URL=%s\n' "$DB_URL"
} > .env
chmod 600 .env

BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
# -L DEREFERENCES. sites-enabled holds symlinks into sites-available, so a plain
# `cp -a` backs up dangling links whose targets this script then overwrites --
# the backup was useless at the one moment it was needed (2026-09-05).
cp -aL /etc/nginx/sites-enabled/. "$BK"/ 2>/dev/null || true

# BUILD AND PROBE FIRST. The candidate has no published port, so it can prove
# that the image boots and reaches Supabase while the live container remains
# untouched.
IMAGE_TAG="$IMAGE:$REVISION"
CANDIDATE="${CONTAINER}-candidate"
ROLLBACK="${CONTAINER}-rollback"

container_healthy() {
  local name="$1"
  for _ in $(seq 1 40); do
    if docker exec "$name" node -e '
      const expected = process.argv[1];
      fetch("http://127.0.0.1:3000/health")
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok || body.ok !== true || body.db !== "postgres" || body.revision !== expected) {
            process.exit(1);
          }
        })
        .catch(() => process.exit(1));
    ' "$REVISION" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

public_healthy() {
  local body headers login_status providers
  body="$(curl -fsS "https://$DOMAIN/health" 2>/dev/null || true)"
  [[ "$body" == *'"ok":true'* && "$body" == *'"db":"postgres"'* && "$body" == *"\"revision\":\"$REVISION\""* ]] || return 1

  login_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$DOMAIN/login" 2>/dev/null || true)"
  [[ "$login_status" == "200" ]] || return 1

  providers="$(curl -fsS "https://$DOMAIN/api/oauth/providers" 2>/dev/null || true)"
  [[ "$providers" == *'"google":'* && "$providers" == *'"github":'* ]] || return 1

  headers="$(curl -fsS -D - -o /dev/null "https://$DOMAIN/login" 2>/dev/null || true)"
  for header in \
    strict-transport-security \
    x-content-type-options \
    referrer-policy \
    permissions-policy \
    content-security-policy; do
    printf '%s\n' "$headers" | grep -qi "^$header:" || return 1
  done
}

rollback_healthy() {
  local body
  for _ in $(seq 1 40); do
    body="$(curl -fsS "http://$HOST_PORT/health" 2>/dev/null || true)"
    if [[ "$body" == *'"ok":true'* && "$body" == *'"db":"postgres"'* ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

docker build -t "$IMAGE_TAG" .
docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true
if ! docker run -d \
  --name "$CANDIDATE" \
  --network "$NET" \
  --env-file .env \
  "$IMAGE_TAG" >/dev/null; then
  echo "deploy: candidate failed to start; live container was not touched" >&2
  docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true
  exit 1
fi
if ! container_healthy "$CANDIDATE"; then
  echo "deploy: candidate failed readiness; live container was not touched" >&2
  docker logs "$CANDIDATE" --tail 50 >&2 || true
  docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true
  exit 1
fi
docker rm -f "$CANDIDATE" >/dev/null

CERT_DIR="$(ls -d /etc/letsencrypt/live/*citefleet* 2>/dev/null | head -1 || true)"

# The bootstrap vhost is plain HTTP -- it exists so certbot has something to
# answer on before a certificate is issued. Laying it over a working TLS vhost
# is a downgrade, so it is only used when there is genuinely no cert yet.
if [[ -z "$CERT_DIR" || ! -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "No certificate for $DOMAIN yet -- installing the plain-HTTP bootstrap vhost."
  cp -f deploy/nginx-citefleet.app.conf /etc/nginx/sites-available/citefleet
  ln -sfn /etc/nginx/sites-available/citefleet /etc/nginx/sites-enabled/citefleet
  nginx -t
  systemctl reload nginx
else
  echo "Certificate present ($CERT_DIR) -- leaving the TLS vhost in place until the new one is written."
fi

HAD_ROLLBACK=0
docker rm -f "$ROLLBACK" >/dev/null 2>&1 || true
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker stop "$CONTAINER" >/dev/null
  docker rename "$CONTAINER" "$ROLLBACK"
  HAD_ROLLBACK=1
fi

rollback_live() {
  set +e
  docker logs "$CONTAINER" --tail 50 >&2
  docker rm -f "$CONTAINER" >/dev/null 2>&1
  if [[ "$HAD_ROLLBACK" == 1 ]]; then
    docker rename "$ROLLBACK" "$CONTAINER"
    docker start "$CONTAINER" >/dev/null
  fi
  if [[ -f "$BK/citefleet" ]]; then
    cp -f "$BK/citefleet" /etc/nginx/sites-available/citefleet
    nginx -t >/dev/null 2>&1 && systemctl reload nginx
  fi
  if [[ "$HAD_ROLLBACK" == 1 ]] && rollback_healthy; then
    echo "deploy: ROLLBACK COMPLETE; revision $REVISION was not released" >&2
  else
    echo "deploy: rollback failed to recover the prior service; operator action required" >&2
  fi
  set -e
}

if ! docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network "$NET" \
  --env-file .env \
  -p "$HOST_PORT":3000 \
  "$IMAGE_TAG"; then
  rollback_live
  exit 1
fi

# CERT_DIR was resolved before the build (see above).
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
    include /etc/nginx/snippets/citefleet-security-headers.conf;
    return 301 https://$DOMAIN\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    client_max_body_size 8m;
    include /etc/nginx/snippets/citefleet-security-headers.conf;
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
if ! nginx -t || ! systemctl reload nginx; then
  rollback_live
  exit 1
fi

if ! container_healthy "$CONTAINER"; then
  echo "deploy: live container failed readiness" >&2
  rollback_live
  exit 1
fi

public_ok=""
for _ in $(seq 1 20); do
  if public_healthy; then public_ok=1; break; fi
  sleep 1
done
if [[ -z "$public_ok" ]]; then
  echo "deploy: public HTTPS smoke checks failed for the requested revision" >&2
  rollback_live
  exit 1
fi

docker tag "$IMAGE_TAG" "$IMAGE:latest"
if [[ "$HAD_ROLLBACK" == 1 ]]; then
  docker rm -f "$ROLLBACK" >/dev/null
fi

echo "SUCCESS - CiteFleet revision $REVISION at https://$DOMAIN"
echo "Sign in at https://$DOMAIN/login - account creation is open; token fallback: cat $OP_FILE"
