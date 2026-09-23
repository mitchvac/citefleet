-- Run with psql -v ON_ERROR_STOP=1 as migration administrator after replay.
-- All canaries, grants and writes roll back; never changes customer rows.
BEGIN;
DO $$
DECLARE t record; r text;
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='citefleet_snapshot') THEN
    RAISE EXCEPTION 'positive control: snapshot missing';
  END IF;
  FOR t IN SELECT c.oid,c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    IF NOT t.relrowsecurity OR t.relforcerowsecurity OR pg_get_userbyid(t.relowner)<>'citefleet' THEN
      RAISE EXCEPTION 'incorrect owner/RLS: %',t.relname;
    END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_schema_privilege(r,'public','USAGE') OR has_table_privilege(r,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'unexpected web access: % %',r,t.relname;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT FROM pg_policies WHERE schemaname='public') THEN RAISE EXCEPTION 'unexpected public policy'; END IF;
  IF EXISTS (SELECT FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated','service_role')) THEN
    RAISE EXCEPTION 'unexpected explicit table grant';
  END IF;
END $$;

-- Test future objects for both actual object-creation roles.
SET LOCAL ROLE postgres;
CREATE FUNCTION public.rls_canary_postgres() RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE TABLE public.rls_canary_postgres_table (id integer);
CREATE SEQUENCE public.rls_canary_postgres_sequence;
SET LOCAL ROLE citefleet;
CREATE FUNCTION public.rls_canary_owner() RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE TABLE public.rls_canary_tenants (workspace_id text PRIMARY KEY, value text);
ALTER TABLE public.rls_canary_tenants ENABLE ROW LEVEL SECURITY;
CREATE SEQUENCE public.rls_canary_sequence;
INSERT INTO public.rls_canary_tenants VALUES ('rls-canary-a','a'),('rls-canary-b','b');
UPDATE public.rls_canary_tenants SET value='updated' WHERE workspace_id='rls-canary-a';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.rls_canary_tenants)<>2 OR
    (SELECT value FROM public.rls_canary_tenants WHERE workspace_id='rls-canary-a')<>'updated' THEN
   RAISE EXCEPTION 'owner read/write positive control failed';
 END IF;
END $$;
RESET ROLE;
DO $$ DECLARE r text; f text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  FOREACH f IN ARRAY ARRAY['public.rls_canary_postgres()','public.rls_canary_owner()'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'future function exposed: % %',r,f; END IF;
  END LOOP;
  IF has_table_privilege(r,'public.rls_canary_tenants','SELECT,INSERT,UPDATE,DELETE') OR
     has_sequence_privilege(r,'public.rls_canary_sequence','USAGE,SELECT,UPDATE') OR
     has_table_privilege(r,'public.rls_canary_postgres_table','SELECT,INSERT,UPDATE,DELETE') OR
     has_sequence_privilege(r,'public.rls_canary_postgres_sequence','USAGE,SELECT,UPDATE') THEN
   RAISE EXCEPTION 'future object exposed: %',r;
  END IF;
 END LOOP;
END $$;

-- Prove the first wall denies actual access, including BYPASSRLS service_role.
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  EXECUTE format('SET LOCAL ROLE %I',r);
  BEGIN
   PERFORM * FROM public.rls_canary_tenants;
   RAISE EXCEPTION 'unexpected read permitted for %',r;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
 END LOOP;
END $$;

-- Open only the grant wall temporarily: non-bypass roles still see neither tenant.
GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT SELECT,INSERT ON public.rls_canary_tenants TO anon,authenticated;
DO $$ DECLARE r text; n integer; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  EXECUTE format('SET LOCAL ROLE %I',r);
  SELECT count(*) INTO n FROM public.rls_canary_tenants;
  IF n<>0 THEN RAISE EXCEPTION 'RLS leaked tenant rows to %',r; END IF;
  BEGIN
   INSERT INTO public.rls_canary_tenants VALUES ('rls-canary-intruder','denied');
   RAISE EXCEPTION 'RLS permitted insert for %',r;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
 END LOOP;
END $$;
ROLLBACK;
\echo PASS: server-only grants, RLS, owner access and future-object defaults
