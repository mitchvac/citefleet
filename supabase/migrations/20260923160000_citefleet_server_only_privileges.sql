-- Defense in depth for CiteFleet's server-only database contract.
-- Billing verification metadata is already stored in citefleet_snapshot.payload;
-- no billing backfill and no trust stamp on legacy public prefixes is required.
-- Preserve owner access: do not FORCE RLS or add client-access policies.
REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, CREATE ON SCHEMA public TO citefleet;

DO $$
DECLARE obj record;
BEGIN
  FOR obj IN
    SELECT c.oid::regclass AS name,c.relkind FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND pg_get_userbyid(c.relowner)='citefleet'
      AND c.relkind IN ('r','p','S')
  LOOP
    IF obj.relkind='S' THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated, service_role',obj.name);
    ELSE
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',obj.name);
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated, service_role',obj.name);
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres, citefleet IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres, citefleet IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres, citefleet IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

-- PostgreSQL per-schema defaults ADD to global defaults. IN SCHEMA alone cannot
-- remove built-in PUBLIC EXECUTE. This deliberately affects FUTURE functions
-- created by these two roles in ALL schemas in this database. Future functions
-- intended as public APIs must explicitly grant their required EXECUTE access.
-- Existing functions and Supabase-managed role defaults are not changed.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres, citefleet
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.citefleet_snapshot IS
  'Server-only workspace JSON including billing public prefix and verifiedAt; never store billing secret keys. RLS enabled with no client policies; citefleet owner bypasses RLS. Tenant isolation is enforced by workspace-scoped server queries.';
