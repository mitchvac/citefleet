#!/usr/bin/env bash
# Run both deploys on the VPS even if the laptop SSH session dies.
# Usage (on the server):  bash /opt/citefleet/deploy/run-detached.sh
set -euo pipefail
LOG=/var/log/cf-bc-deploy.log
nohup bash -c '
  set -euo pipefail
  echo "===== $(date -u) botcentral ====="
  bash /opt/botcentral/deploy/deploy-vps.sh
  echo "===== $(date -u) citefleet ====="
  bash /opt/citefleet/deploy/deploy-vps.sh
  echo "===== $(date -u) done ====="
' >>"$LOG" 2>&1 &
echo "STARTED pid=$! log=$LOG"
echo "Watch with:  tail -f $LOG"
