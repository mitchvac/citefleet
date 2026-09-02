import { getSql } from "../db";
import { applyPlaybookHrefs } from "./playbook";
import type { StoreShape } from "./types";

const SNAPSHOT_ID = "default";

export async function loadSnapshot(): Promise<unknown | null> {
  const sql = await getSql();
  const rows = await sql.query<{ payload: unknown }>(
    "SELECT payload FROM citefleet_snapshot WHERE id = $1",
    [SNAPSHOT_ID],
  );
  return rows[0]?.payload ?? null;
}

export async function saveSnapshot(store: StoreShape): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `INSERT INTO citefleet_snapshot (id, payload, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = now()`,
    [SNAPSHOT_ID, JSON.stringify(store)],
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
