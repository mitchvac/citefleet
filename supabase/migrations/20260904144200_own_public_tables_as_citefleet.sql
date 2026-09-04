-- Every table in public is owned by `citefleet`, not by the migration role.
--
-- Ownership is what makes the RLS wall in the next migration work: a table
-- owner bypasses row security, so the app reads and writes normally while
-- every other role is denied by having no policy. Without this, a fresh
-- `supabase db reset` would leave the tables owned by postgres and local would
-- not match production.
--
-- Idempotent: a no-op where ownership is already correct.

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
      and pg_get_userbyid(c.relowner) <> 'citefleet'
  loop
    execute format('alter table %s owner to citefleet', rec.tbl);
  end loop;
end
$$;
