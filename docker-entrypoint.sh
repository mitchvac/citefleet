#!/bin/sh
# Apply pending SQL when DATABASE_URL is set (Neon / Postgres).
# Without it this is a no-op; PGLite applies bundled migrations on first query.
set -eu
if [ -f /app/scripts/migrate.mjs ]; then
  node /app/scripts/migrate.mjs
fi
exec node /app/.output/server/index.mjs
