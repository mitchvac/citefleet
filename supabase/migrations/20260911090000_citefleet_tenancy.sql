-- Multi-tenancy: a workspace registry, membership, and one snapshot row per
-- workspace instead of one row for everybody.
--
-- WHAT WAS WRONG. `citefleet_snapshot` held the entire product in a single row
-- keyed by the constant 'default' (src/lib/citefleet/persist.ts). The table was
-- always `id TEXT PRIMARY KEY`, so the SHAPE always allowed many rows; only that
-- constant pinned it to one. Nothing else had to change in the table to support
-- tenants — what was missing was a registry saying which workspaces exist and
-- who may act in each.
--
-- RLS ON THESE TABLES IS POSTURE, NOT ISOLATION. Read this before assuming the
-- ENABLE ROW LEVEL SECURITY lines below protect anything. The app connects as
-- `citefleet`, which OWNS every table in public, and a table owner BYPASSES row
-- security unless FORCE ROW LEVEL SECURITY is set — which it deliberately is
-- not (see 20260904144211_enable_rls_no_policies.sql). Local development and the
-- VPS fallback connect as a superuser and would bypass even that. Tenant
-- isolation is enforced in the query layer, by `WorkspaceHandle` and
-- `workspace-registry.server.ts`: every read and write names a workspace id, and
-- a `WorkspaceId` can only be obtained by resolving a principal, a proven domain
-- or a proven repo. RLS is enabled here for the same reason as everywhere else
-- in this schema: it denies every OTHER role, and it keeps the CI lint quiet.
--
-- Ownership and RLS are set INLINE on each new table rather than left to the
-- sweeps in 20260904144200 and 20260904144211. Those loop over schema public at
-- their own position in the ledger, so on a fresh `supabase db reset` they run
-- BEFORE these tables exist and would never cover them. The `public._migrations`
-- incident (20260910142911) is what that mistake looks like in production: a
-- table created after the sweep was the one table in public with RLS off.

-- One row per customer workspace.
CREATE TABLE IF NOT EXISTS citefleet_workspaces (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'starter',
  region      TEXT NOT NULL DEFAULT 'us-east-1',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
ALTER TABLE citefleet_workspaces OWNER TO citefleet;
ALTER TABLE citefleet_workspaces ENABLE ROW LEVEL SECURITY;

-- Who may act inside a workspace. The only source of truth for that question.
CREATE TABLE IF NOT EXISTS citefleet_workspace_members (
  workspace_id TEXT NOT NULL REFERENCES citefleet_workspaces (id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES citefleet_users (id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- The lookup `workspaceForPrincipal` does on every request.
CREATE INDEX IF NOT EXISTS citefleet_workspace_members_user_idx
  ON citefleet_workspace_members (user_id);

-- At most one default workspace per account, enforced by the DATABASE.
-- `workspaceForPrincipal` refuses to guess when a member of several workspaces
-- has no default; this is what guarantees it can never find two.
CREATE UNIQUE INDEX IF NOT EXISTS citefleet_workspace_members_default_idx
  ON citefleet_workspace_members (user_id) WHERE is_default;

ALTER TABLE citefleet_workspace_members OWNER TO citefleet;
ALTER TABLE citefleet_workspace_members ENABLE ROW LEVEL SECURITY;

-- BACKFILL. Behaviour-preserving: the existing workspace keeps its identity and
-- everyone who can sign in today keeps their access.
INSERT INTO citefleet_workspaces (id, slug, name, plan, region)
VALUES ('ws-citefleet', 'citefleet', 'CiteFleet', 'enterprise', 'us-east-1')
ON CONFLICT (id) DO NOTHING;

-- The snapshot row moves from the 'default' constant to the workspace id that is
-- now its foreign key. Guarded so a re-run, or a database that never held the
-- old row, is a no-op rather than an error.
UPDATE citefleet_snapshot SET id = 'ws-citefleet'
 WHERE id = 'default'
   AND NOT EXISTS (SELECT 1 FROM citefleet_snapshot WHERE id = 'ws-citefleet');

-- Every existing account is an admin of the existing workspace, and it is their
-- default. Without this every current user signs in to "you belong to no
-- workspace" — `workspaceForPrincipal` fails closed rather than guessing.
INSERT INTO citefleet_workspace_members (workspace_id, user_id, role, is_default)
SELECT 'ws-citefleet', id, 'admin', true FROM citefleet_users
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Added AFTER the backfill: with the constraint in place first, the UPDATE above
-- would have to satisfy a foreign key to a row it had not reached yet.
ALTER TABLE citefleet_snapshot
  DROP CONSTRAINT IF EXISTS citefleet_snapshot_workspace_fk;
ALTER TABLE citefleet_snapshot
  ADD CONSTRAINT citefleet_snapshot_workspace_fk
  FOREIGN KEY (id) REFERENCES citefleet_workspaces (id) ON DELETE CASCADE;
