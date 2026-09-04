-- RLS on, with NO policies, on every table in public.
--
-- Intended: RLS with no policy denies everything to any role subject to it.
-- The app is not subject to it -- `citefleet` owns these tables and a table
-- owner bypasses row security unless FORCE ROW LEVEL SECURITY is set, which it
-- deliberately is not.
--
-- This is the second wall, not the first. The grant wall from
-- 20260904134923_close_schema_public.sql is what stops service_role, which
-- carries BYPASSRLS and would ignore everything here.
--
-- Supabase's linter reports `rls_enabled_no_policy` (INFO) for each of these.
-- That lint IS the design; it is not a finding to remediate.
--
-- Idempotent, and it picks up any table a later migration adds.

do $$
declare
  rec record;
begin
  for rec in
    select c.oid::regclass as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', rec.tbl);
  end loop;
end
$$;
