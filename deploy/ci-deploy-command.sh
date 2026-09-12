#!/usr/bin/env bash
# Forced command for the dedicated GitHub Actions SSH key. It accepts one
# operation and one full commit id; arbitrary commands never reach a shell.
set -euo pipefail

APP_DIR="/opt/citefleet"
COMMAND="${SSH_ORIGINAL_COMMAND:-}"

if [[ ! "$COMMAND" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo "citefleet deploy key: command refused" >&2
  exit 64
fi

REVISION="${BASH_REMATCH[1]}"
git -C "$APP_DIR" fetch --quiet origin
MAIN_REVISION="$(git -C "$APP_DIR" rev-parse --verify origin/main)"
if [[ "$REVISION" != "$MAIN_REVISION" ]]; then
  echo "citefleet deploy key: revision is not current main" >&2
  exit 65
fi

git -C "$APP_DIR" checkout --detach "$REVISION"
git -C "$APP_DIR" reset --hard "$REVISION"
exec env \
  CITEFLEET_SKIP_GIT=1 \
  CITEFLEET_DEPLOY_REVISION="$REVISION" \
  bash "$APP_DIR/deploy/deploy-vps.sh"
