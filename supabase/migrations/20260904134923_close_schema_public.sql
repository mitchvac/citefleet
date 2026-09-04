-- Close schema public before any application table exists.
--
-- CiteFleet talks to Postgres directly (pg Pool in src/lib/db.ts) as the owning
-- role. The repo carries no @supabase/* client and never reads through the Data
-- API, so anon, authenticated and service_role need no access to this schema.
--
-- The grant that matters is USAGE on schema public held by the PUBLIC
-- pseudo-role: revoking anon and authenticated by name leaves that door open,
-- and every future role inherits it.
--
-- service_role is revoked too, deliberately: it carries BYPASSRLS, so RLS with
-- no policies does not stop it. The grant wall is the only thing that does.

revoke usage on schema public from public;
revoke all on schema public from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role, public;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role, public;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role, public;
