import { getSql, type Sql } from "../db.ts";
import { applyPlaybookHrefs } from "./playbook.ts";
import type { StoreShape } from "./types";
import type { WorkspaceId } from "./workspace-id.ts";

/**
 * The workspace id IS the snapshot's primary key — one row per tenant.
 *
 * This was `const SNAPSHOT_ID = "default"`: a single global row holding every
 * customer's work. The table has always been `id TEXT PRIMARY KEY`, so the shape
 * already allowed many rows; only the constant pinned it to one.
 *
 * Nothing here may default the id. A default tenant is precisely how one
 * customer's write lands in another customer's workspace, and it would do so
 * silently. The id is required, and it is a `WorkspaceId`, so a `siteId` cannot
 * be passed here by mistake.
 */
export async function loadSnapshot(id: WorkspaceId): Promise<unknown | null> {
  const sql = await getSql();
  const rows = await sql.query<{ payload: unknown }>(
    "SELECT payload FROM citefleet_snapshot WHERE id = $1",
    [id],
  );
  return rows[0]?.payload ?? null;
}

export async function saveSnapshot(
  id: WorkspaceId,
  store: StoreShape,
  /** A transaction, when the snapshot must land with its registry rows or not at all. */
  tx?: Sql,
): Promise<void> {
  const sql = tx ?? (await getSql());
  await sql.query(
    `INSERT INTO citefleet_snapshot (id, payload, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = now()`,
    [id, JSON.stringify(store)],
  );
}

export function mergeSnapshot(seed: StoreShape, raw: unknown): StoreShape {
  if (!raw || typeof raw !== "object") return seed;
  const p = raw as Partial<StoreShape>;
  const next: StoreShape = {
    ...seed,
    ...p,
    workspace: { ...seed.workspace, ...(p.workspace || {}) },
    control: p.control?.kill ? p.control : seed.control,
    sites: Array.isArray(p.sites) ? p.sites : seed.sites,
    bots: Array.isArray(p.bots) ? p.bots : seed.bots,
    tasks: Array.isArray(p.tasks) ? p.tasks : seed.tasks,
    engines:
      Array.isArray(p.engines) && p.engines.length ? p.engines : seed.engines,
    activity: Array.isArray(p.activity) ? p.activity : seed.activity,
  };
  if (!next.control) next.control = seed.control;
  if (!next.control.snapshots) next.control.snapshots = {};
  if (!next.control.jobs) next.control.jobs = [];
  if (!next.control.kill) next.control.kill = seed.control.kill;
  applyPlaybookHrefs(next.tasks, next.sites);
  return next;
}
