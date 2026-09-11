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
/** A snapshot as it was read, with the version the next write must name. */
export interface LoadedSnapshot {
  payload: unknown;
  version: number;
}

/** Raised when the row moved between the read and the write. Retry, do not overwrite. */
export class SnapshotConflictError extends Error {
  // Declared and assigned explicitly rather than as constructor parameter
  // properties: `npm test` runs under --experimental-strip-types, which is
  // strip-only and rejects that syntax outright.
  readonly id: string;
  readonly expected: number;

  constructor(id: string, expected: number) {
    super(
      `snapshot ${id} changed since it was read (expected version ${expected}) — ` +
        "another writer got there first",
    );
    this.name = "SnapshotConflictError";
    this.id = id;
    this.expected = expected;
  }
}

export async function loadSnapshot(id: WorkspaceId): Promise<LoadedSnapshot | null> {
  const sql = await getSql();
  const rows = await sql.query<{ payload: unknown; version: number }>(
    "SELECT payload, version FROM citefleet_snapshot WHERE id = $1",
    [id],
  );
  const row = rows[0];
  return row ? { payload: row.payload, version: Number(row.version) } : null;
}

/**
 * Write a workspace, but only if nobody else has written it since it was read.
 *
 * `expected` is the version `loadSnapshot` returned. The UPDATE matches only
 * while that is still the row's version, so a writer working from a stale copy
 * changes nothing and is told. The previous write was an unconditional upsert:
 * two processes that both read, both edited and both saved left only the second
 * one's work, and the first was told it had succeeded.
 *
 * Pass `expected: null` to create a row that must not exist yet — that is the
 * one case where there is no prior version to name.
 *
 * `RETURNING version` rather than a row count, because the `Sql` surface in
 * db.ts resolves to rows only and never exposes `rowCount`.
 */
export async function saveSnapshot(
  id: WorkspaceId,
  store: StoreShape,
  expected: number | null,
  /** A transaction, when the snapshot must land with its registry rows or not at all. */
  tx?: Sql,
): Promise<number> {
  const sql = tx ?? (await getSql());
  const payload = JSON.stringify(store);

  if (expected === null) {
    const created = await sql.query<{ version: number }>(
      `INSERT INTO citefleet_snapshot (id, payload, updated_at, version)
       VALUES ($1, $2::jsonb, now(), 1)
       ON CONFLICT (id) DO NOTHING
       RETURNING version`,
      [id, payload],
    );
    if (!created.length) throw new SnapshotConflictError(id, 0);
    return Number(created[0].version);
  }

  const rows = await sql.query<{ version: number }>(
    `UPDATE citefleet_snapshot
        SET payload = $2::jsonb, updated_at = now(), version = version + 1
      WHERE id = $1 AND version = $3
      RETURNING version`,
    [id, payload, expected],
  );
  if (!rows.length) throw new SnapshotConflictError(id, expected);
  return Number(rows[0].version);
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
