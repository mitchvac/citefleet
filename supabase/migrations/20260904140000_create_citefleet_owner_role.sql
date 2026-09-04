-- The role the application connects as.
--
-- Named to match the owner in the pre-Supabase deployment, so moving hosts
-- changes only the host and the password. It owns every table in public, and a
-- table owner bypasses row security unless FORCE ROW LEVEL SECURITY is set --
-- which is what lets the RLS-with-no-policies wall deny every other role while
-- the app still works.
--
-- Created NOLOGIN and with NO password on purpose. A password never belongs in
-- a migration file. Set one out of band, per environment:
--   alter role citefleet with login password '<from your secret store>';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'citefleet') then
    create role citefleet nologin;
  end if;
end
$$;

grant usage, create on schema public to citefleet;

-- So the migration/admin role can alter objects citefleet owns.
grant citefleet to postgres;
