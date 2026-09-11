-- Every snapshot row belongs to a workspace that exists.
--
-- 20260911090000_citefleet_tenancy.sql deliberately left this out, and said why:
-- schema reaches production from CI on merge, the application image deploys
-- separately, and the bundle running at that moment still wrote the old
-- `id = 'default'` row. With the constraint in place, every one of those writes
-- would have failed 23503 and the live console would have errored until the new
-- image landed.
--
-- That window is closed. The new bundle is deployed and the snapshot table holds
-- one row keyed `ws-citefleet`, verified against the live database before this
-- was written:
--
--   SELECT id FROM citefleet_snapshot;   -- must return no 'default' row
--
-- ON DELETE CASCADE so removing a workspace takes its snapshot with it, rather
-- than leaving a document no code can reach -- `workspace-registry.server.ts`
-- only ever produces a handle for a workspace that is in the registry, so an
-- orphaned snapshot would be invisible and permanent.
--
-- Validated immediately rather than ADD ... NOT VALID + VALIDATE: the table holds
-- one row per customer and the scan is trivial. The split exists for tables too
-- large to lock, which this is not.

ALTER TABLE citefleet_snapshot
  DROP CONSTRAINT IF EXISTS citefleet_snapshot_workspace_fk;

ALTER TABLE citefleet_snapshot
  ADD CONSTRAINT citefleet_snapshot_workspace_fk
  FOREIGN KEY (id) REFERENCES citefleet_workspaces (id) ON DELETE CASCADE;
