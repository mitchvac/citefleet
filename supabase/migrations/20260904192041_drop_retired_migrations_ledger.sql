-- Drop the retired hand-rolled migration ledger.
--
-- `public._migrations` was written by the old scripts/migrate.mjs, which this
-- repo no longer has. Migration history now lives in
-- supabase_migrations.schema_migrations, managed by the Supabase CLI. Leaving
-- a second, stale ledger in public is exactly the drift that made two sources
-- of truth possible in the first place.

drop table if exists public._migrations;
