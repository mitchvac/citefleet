-- Drop public._migrations again -- it came back.
--
-- 20260904192041_drop_retired_migrations_ledger.sql dropped this table at
-- 19:20:41 on 2026-09-04. It was recreated at 22:21:48 the same evening, when
-- citefleet.app was cut over to Supabase still running the old
-- scripts/migrate.mjs, which wrote its own ledger on boot. That script is no
-- longer in the repo, and nothing in src/, server/, scripts/ or the built
-- bundle (checked inside the running container) references _migrations, so
-- nothing recreates it this time.
--
-- The 4 rows it held were the retired hand-rolled ledger and are history no
-- one reads: 0001_auth.sql, 0001_citefleet.sql, 0002_citefleet_users.sql and
-- 0003_citefleet_oauth.sql, all stamped 2026-09-04 22:21:48. Real migration
-- history lives in supabase_migrations.schema_migrations.
--
-- It was also the ONLY table in public without row level security. It was
-- created after 20260904144211_enable_rls_no_policies.sql swept the schema, so
-- that sweep never saw it. Dropping it restores full RLS coverage in public.

drop table if exists public._migrations;
