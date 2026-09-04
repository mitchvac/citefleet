#!/bin/sh
# The app does NO schema work. Migrations live in supabase/migrations/ and are
# applied by the Supabase CLI from CI (.github/workflows/supabase-migrations.yml)
# before this container is rolled, so a boot never mutates the database.
#
# DATABASE_URL is required — src/lib/db.ts has no embedded fallback and throws
# with instructions if it is unset.
set -eu
exec node /app/.output/server/index.mjs
