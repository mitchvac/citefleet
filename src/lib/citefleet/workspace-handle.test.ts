import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CACHED_WORKSPACES,
  MAX_SAVE_ATTEMPTS,
  createWorkspaces,
  type SnapshotStore,
} from "./workspace-handle.ts";
import { asWorkspaceId, type WorkspaceId } from "./workspace-id.ts";
import type { Site, StoreShape } from "./types.ts";

// The claim this whole change exists to make: one tenant cannot read or write
// another's workspace. It is tested against a fake snapshot store rather than
// Postgres, because what is being tested is the KEYING — that every read and
// write carries a workspace id all the way to persistence — and a fake records
// that far more precisely than a database would.

const A = asWorkspaceId("ws-alpha");
const B = asWorkspaceId("ws-bravo");

/**
 * An in-memory stand-in for the citefleet_snapshot table, INCLUDING its version
 * column — a fake that ignored versions would let every optimistic-concurrency
 * test pass without the mechanism existing.
 */
function fakeStore(over: { failSaveFor?: WorkspaceId } = {}) {
  const rows = new Map<WorkspaceId, { payload: unknown; version: number }>();
  const loads: WorkspaceId[] = [];
  const saves: WorkspaceId[] = [];
  const io: SnapshotStore = {
    async load(id) {
      loads.push(id);
      return rows.get(id) ?? null;
    },
    async save(id, store, expected) {
      saves.push(id);
      if (over.failSaveFor === id) throw new Error("snapshot write failed");
      const current = rows.get(id);
      // Exactly the SQL: INSERT only when absent, UPDATE only while the version
      // still matches.
      if (expected === null ? current !== undefined : current?.version !== expected) {
        throw conflict(id, expected ?? 0);
      }
      const version = (current?.version ?? 0) + 1;
      // Round-trip through JSON exactly as a JSONB column does.
      rows.set(id, { payload: JSON.parse(JSON.stringify(store)), version });
      return version;
    },
  };
  return { io, rows, loads, saves };
}

/** The error shape `persist.ts` raises, matched by name in workspace-handle.ts. */
function conflict(id: string, expected: number) {
  const err = new Error(`snapshot ${id} changed since it was read (expected ${expected})`);
  err.name = "SnapshotConflictError";
  return err;
}

/** The stored document for a tenant, as the assertions below read it. */
function rowStore(f: ReturnType<typeof fakeStore>, id: WorkspaceId): StoreShape {
  return f.rows.get(id)!.payload as StoreShape;
}

function siteNamed(name: string): Site {
  return {
    id: `site-${name}`,
    workspaceId: "w",
    name,
    domain: `${name}.com`,
    url: `https://${name}.com/`,
    status: "campaign",
    sitemapUrl: `https://${name}.com/sitemap.xml`,
    routes: ["/"],
    createdAt: "2026-09-01T00:00:00Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
  } as Site;
}

test("a write to one workspace is invisible to another", async () => {
  // The isolation claim, stated as plainly as it can be.
  const f = fakeStore();
  const ws = createWorkspaces(f.io);
  await ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("alpha")));

  const b = await ws.handleFor(B).get();
  assert.deepEqual(b.sites, [], "workspace B must not see A's property");
  // Positive control: A really did get the write, so the empty B is meaningful.
  const a = await ws.handleFor(A).get();
  assert.deepEqual(a.sites.map((s) => s.name), ["alpha"]);
});

test("each workspace persists under its OWN key", async () => {
  const f = fakeStore();
  const ws = createWorkspaces(f.io);
  await ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("alpha")));
  await ws.handleFor(B).mutate((s) => s.sites.push(siteNamed("bravo")));

  assert.deepEqual(f.saves, [A, B]);
  assert.equal(f.rows.size, 2, "two tenants must be two rows, not one");
  // This is the assertion that would have failed against the old single-row
  // design, where both writes landed on id='default'.
  const rowA = rowStore(f, A);
  const rowB = rowStore(f, B);
  assert.deepEqual(rowA.sites.map((s) => s.name), ["alpha"]);
  assert.deepEqual(rowB.sites.map((s) => s.name), ["bravo"]);
});

test("the workspace a handle loads is the one it was asked for", async () => {
  const f = fakeStore();
  const ws = createWorkspaces(f.io);
  await ws.handleFor(B).get();
  assert.deepEqual(f.loads, [B], "a handle for B must never read A's row");
});

test("get() hands out a copy — mutating it changes nothing", async () => {
  const f = fakeStore();
  const ws = createWorkspaces(f.io);
  const first = await ws.handleFor(A).get();
  first.sites.push(siteNamed("not-saved"));
  const second = await ws.handleFor(A).get();
  assert.deepEqual(second.sites, [], "the cached workspace must not be reachable by reference");
  assert.equal(f.saves.length, 0, "reading must never write");
});

test("a reload sees what was written, not the seed", async () => {
  const f = fakeStore();
  const first = createWorkspaces(f.io);
  await first.handleFor(A).mutate((s) => s.sites.push(siteNamed("alpha")));
  // A cold process: new cache, same rows.
  const second = createWorkspaces(f.io);
  const a = await second.handleFor(A).get();
  assert.deepEqual(a.sites.map((s) => s.name), ["alpha"]);
  assert.equal(a.workspace.id, A, "the seed's id must be the tenant, not a constant");
});

test("the cache is bounded — it cannot grow one entry per customer", async () => {
  // Unbounded, this is how the process dies at 200k tenants.
  const f = fakeStore();
  const ws = createWorkspaces(f.io, 4);
  for (const n of ["one", "two", "three", "four", "five"]) {
    await ws.handleFor(asWorkspaceId(`ws-${n}`)).get();
  }
  assert.equal(ws.size(), 4);
  // The least recently used is the one dropped: reading ws-one again reloads.
  const before = f.loads.length;
  await ws.handleFor(asWorkspaceId("ws-one")).get();
  assert.equal(f.loads.length, before + 1, "the evicted tenant must be re-read");
});

test("MAX_CACHED_WORKSPACES is a real bound, not a large number", () => {
  assert.ok(MAX_CACHED_WORKSPACES > 0 && MAX_CACHED_WORKSPACES <= 1024);
});

test("two concurrent reads of a cold workspace load it once", async () => {
  const f = fakeStore();
  const ws = createWorkspaces(f.io);
  await Promise.all([ws.handleFor(A).get(), ws.handleFor(A).get(), ws.handleFor(A).get()]);
  assert.deepEqual(f.loads, [A], "a thundering herd must not become three reads");
});

test("a failed save drops the cached copy instead of serving an unsaved change", async () => {
  // Otherwise the process keeps answering with a change Postgres never took, and
  // every later read of that tenant is quietly wrong until a restart.
  const f = fakeStore({ failSaveFor: A });
  const ws = createWorkspaces(f.io);
  await assert.rejects(
    () => ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("ghost"))),
    /snapshot write failed/,
  );
  const a = await ws.handleFor(A).get();
  assert.deepEqual(a.sites, [], "the unsaved write must not survive in memory");
});

test("a load failure yields an EMPTY workspace, never another tenant's", async () => {
  const io: SnapshotStore = {
    async load() {
      throw new Error("postgres unreachable");
    },
    async save() {
      return 1;
    },
  };
  const ws = createWorkspaces(io);
  const a = await ws.handleFor(A).get();
  assert.deepEqual(a.sites, []);
  assert.equal(a.workspace.id, A);
});

// --- Concurrency regressions -------------------------------------------------
// Both of these were REPRODUCED against the first implementation: a mutate that
// returned success had its write erased, and a save that threw was persisted
// anyway. Each test below fails against that version.

/** A store whose save can be held open, so the race can be driven deterministically. */
function pausableStore() {
  const rows = new Map<WorkspaceId, { payload: unknown; version: number }>();
  let held: (() => void) | null = null;
  let holdNext = false;
  const io: SnapshotStore = {
    async load(id) {
      return rows.get(id) ?? null;
    },
    async save(id, store, expected) {
      if (holdNext) {
        holdNext = false;
        await new Promise<void>((resolve) => {
          held = resolve;
        });
      }
      const current = rows.get(id);
      if (expected === null ? current !== undefined : current?.version !== expected) {
        throw conflict(id, expected ?? 0);
      }
      const version = (current?.version ?? 0) + 1;
      rows.set(id, { payload: JSON.parse(JSON.stringify(store)), version });
      return version;
    },
  };
  return {
    io,
    rows,
    holdNextSave() {
      holdNext = true;
    },
    release() {
      held?.();
      held = null;
    },
  };
}

test("a write that reported success is not erased by cache eviction", async () => {
  // The reproduction, in order: mutate A is suspended mid-save; eviction
  // pressure drops A from the cache; a concurrent READ of A re-boots it from
  // the row Postgres has not updated yet and caches that stale object; the save
  // then completes and reports success; the next mutate saves the stale object
  // over the top, erasing a write whose promise already resolved.
  const f = pausableStore();
  const ws = createWorkspaces(f.io, 2);

  f.holdNextSave();
  const first = ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("kept")));

  // Evict A while its write is in flight.
  await ws.handleFor(asWorkspaceId("ws-filler1")).get();
  await ws.handleFor(asWorkspaceId("ws-filler2")).get();
  // And re-read it, which is what caches the stale copy.
  const duringFlight = await ws.handleFor(A).get();

  f.release();
  await first;

  // The read taken mid-flight must already see the pending write — that is what
  // proves the entry was never dropped.
  assert.deepEqual(
    duringFlight.sites.map((s) => s.name),
    ["kept"],
    "a read during the write must not fall back to the stale row",
  );

  await ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("later")));
  const finalRow = f.rows.get(A)!.payload as StoreShape;
  assert.deepEqual(
    finalRow.sites.map((s) => s.name),
    ["kept", "later"],
    "the first write must survive the second",
  );
});

test("a save that FAILED is not persisted by the next mutate", async () => {
  // The reproduction: both mutates held the same object by reference, so the
  // failed mutation's change was still on the object the second one saved.
  let failNext = true;
  const rows = new Map<WorkspaceId, { payload: unknown; version: number }>();
  const io: SnapshotStore = {
    async load(id) {
      return rows.get(id) ?? null;
    },
    async save(id, store, expected) {
      if (failNext) {
        failNext = false;
        throw new Error("snapshot write failed");
      }
      const current = rows.get(id);
      if (expected === null ? current !== undefined : current?.version !== expected) {
        throw conflict(id, expected ?? 0);
      }
      const version = (current?.version ?? 0) + 1;
      rows.set(id, { payload: JSON.parse(JSON.stringify(store)), version });
      return version;
    },
  };
  const ws = createWorkspaces(io);
  const handle = ws.handleFor(A);

  const doomed = handle.mutate((s) => s.sites.push(siteNamed("FAILED-WRITE")));
  const good = handle.mutate((s) => s.sites.push(siteNamed("ok-write")));
  await assert.rejects(() => doomed, /snapshot write failed/);
  await good;

  const row = rows.get(A)!.payload as StoreShape;
  assert.deepEqual(
    row.sites.map((s) => s.name),
    ["ok-write"],
    "the change whose save threw must not appear in the database",
  );
});

test("mutations on one workspace do not interleave", async () => {
  // Serialisation is what makes the failure path above safe to clean up.
  const order: string[] = [];
  let version = 0;
  const io: SnapshotStore = {
    async load() {
      return null;
    },
    async save() {
      await new Promise((r) => setTimeout(r, 1));
      return ++version;
    },
  };
  const ws = createWorkspaces(io);
  const h = ws.handleFor(A);
  await Promise.all([
    h.mutate(() => order.push("a-start")).then(() => order.push("a-end")),
    h.mutate(() => order.push("b-start")).then(() => order.push("b-end")),
  ]);
  assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"]);
});

test("two DIFFERENT workspaces still mutate concurrently", async () => {
  // Serialisation must be per tenant, not global — one slow customer must not
  // block every other customer's writes.
  const started: string[] = [];
  const versions = new Map<string, number>();
  const io: SnapshotStore = {
    async load() {
      return null;
    },
    async save(id) {
      started.push(String(id));
      await new Promise((r) => setTimeout(r, 5));
      const next = (versions.get(String(id)) ?? 0) + 1;
      versions.set(String(id), next);
      return next;
    },
  };
  const ws = createWorkspaces(io);
  await Promise.all([
    ws.handleFor(A).mutate(() => {}),
    ws.handleFor(B).mutate(() => {}),
  ]);
  assert.equal(started.length, 2);
});

test("a pinned cache under full pressure does not evict the entry being written", async () => {
  // A cold validator reproduced this against the first pinning attempt: `mutate`
  // pinned AFTER `ensureLoaded`, and `ensureLoaded` calls `remember`, which
  // evicts. With every older entry pinned, the only unpinned candidate was the
  // entry just inserted — so `remember` deleted its own argument and the stale
  // read came straight back.
  const rows = new Map<WorkspaceId, { payload: unknown; version: number }>();
  const releases: Array<() => void> = [];
  let blocking = true;
  const io: SnapshotStore = {
    async load(id) {
      return rows.get(id) ?? null;
    },
    async save(id, store, expected) {
      // Only the writes that set up the race are held; once released, saves run
      // straight through, or the assertion after them would never be reached.
      if (blocking) await new Promise<void>((r) => releases.push(r));
      const current = rows.get(id);
      if (expected === null ? current !== undefined : current?.version !== expected) {
        throw conflict(id, expected ?? 0);
      }
      const version = (current?.version ?? 0) + 1;
      rows.set(id, { payload: JSON.parse(JSON.stringify(store)), version });
      return version;
    },
  };
  const max = 3;
  const ws = createWorkspaces(io, max);

  // Fill the cache with mutations that are all stuck mid-save, so every entry
  // is pinned, then start one more on a fresh tenant.
  const held = ["ws-pin1", "ws-pin2", "ws-pin3"].map((n) =>
    ws.handleFor(asWorkspaceId(n)).mutate((s) => s.sites.push(siteNamed(n))),
  );
  await new Promise((r) => setTimeout(r, 0));
  const last = ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("kept")));
  await new Promise((r) => setTimeout(r, 0));

  // The read that used to see the stale row.
  const duringFlight = await ws.handleFor(A).get();
  assert.deepEqual(
    duringFlight.sites.map((s) => s.name),
    ["kept"],
    "the entry being written must still be cached under full pinning pressure",
  );

  blocking = false;
  for (const release of releases) release();
  await Promise.all([...held, last]);
  await ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("later")));
  assert.deepEqual(
    (rows.get(A)!.payload as StoreShape).sites.map((s) => s.name),
    ["kept", "later"],
  );
});

test("the per-tenant mutation queue does not retain an entry per tenant", async () => {
  // The queue map lives in the module whose entire point is a bounded cache. It
  // had no delete at all, so it grew one promise per workspace forever.
  let version = 0;
  const io: SnapshotStore = {
    async load() {
      return null;
    },
    async save() {
      return ++version;
    },
  };
  const ws = createWorkspaces(io, 4);
  for (let i = 0; i < 50; i += 1) {
    await ws.handleFor(asWorkspaceId(`ws-tenant${i}`)).mutate(() => {});
  }
  assert.ok(ws.size() <= 4, `cache bound held at ${ws.size()}`);
  assert.equal(ws.queueDepth(), 0, "every drained queue entry must be released");
});

// --- Optimistic concurrency ---------------------------------------------------
// The in-process queue serialises writes within ONE process. These cover the
// case it cannot see: a second process, a deploy overlapping the old one, or a
// webhook handled by another instance.

test("a second process cannot silently overwrite the first", async () => {
  // Two independent caches over one table — exactly two containers.
  const f = fakeStore();
  const alpha = createWorkspaces(f.io);
  const bravo = createWorkspaces(f.io);

  await alpha.handleFor(A).mutate((s) => s.sites.push(siteNamed("from-alpha")));
  // Bravo reads BEFORE alpha's next write, so it is about to hold a stale copy.
  await bravo.handleFor(A).get();
  await alpha.handleFor(A).mutate((s) => s.sites.push(siteNamed("from-alpha-2")));

  // Bravo now writes from its stale view. Under the old blind upsert this
  // silently erased from-alpha-2; now it re-reads and re-applies.
  await bravo.handleFor(A).mutate((s) => s.sites.push(siteNamed("from-bravo")));

  assert.deepEqual(
    rowStore(f, A).sites.map((s) => s.name),
    ["from-alpha", "from-alpha-2", "from-bravo"],
    "every write must survive — none may be lost to a stale overwrite",
  );
});

test("the version advances once per write", async () => {
  const f = fakeStore();
  const ws = createWorkspaces(f.io);
  await ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("one")));
  assert.equal(f.rows.get(A)!.version, 1, "the first write creates the row at 1");
  await ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("two")));
  assert.equal(f.rows.get(A)!.version, 2);
});

test("a workspace under permanent contention fails loudly rather than spinning", async () => {
  // Every save conflicts. The retry is bounded, so this must reject rather than
  // loop forever holding a connection.
  let attempts = 0;
  const io: SnapshotStore = {
    async load() {
      return { payload: null, version: attempts };
    },
    async save(id) {
      attempts += 1;
      throw conflict(String(id), attempts);
    },
  };
  const ws = createWorkspaces(io);
  await assert.rejects(
    () => ws.handleFor(A).mutate((s) => s.sites.push(siteNamed("never"))),
    (err: Error) => err.name === "SnapshotConflictError",
  );
  assert.equal(attempts, MAX_SAVE_ATTEMPTS, `gave up after ${attempts}, expected ${MAX_SAVE_ATTEMPTS}`);
});

test("a non-conflict failure is NOT retried — it is reported at once", async () => {
  // A conflict means "someone else won, try again". A dead connection means
  // "the database is not there", and hammering it three times helps nobody.
  let saves = 0;
  const io: SnapshotStore = {
    async load() {
      return null;
    },
    async save() {
      saves += 1;
      throw new Error("ECONNREFUSED");
    },
  };
  const ws = createWorkspaces(io);
  await assert.rejects(() => ws.handleFor(A).mutate(() => {}), /ECONNREFUSED/);
  assert.equal(saves, 1, "a connection failure must not be retried as if it were a conflict");
});

test("the retry re-applies the change against the FRESHER store", async () => {
  // Not a blind replay of the old document: `fn` runs again on what the other
  // writer left, so both changes end up present.
  const f = fakeStore();
  const alpha = createWorkspaces(f.io);
  const bravo = createWorkspaces(f.io);
  await alpha.handleFor(A).mutate((s) => s.sites.push(siteNamed("first")));
  await bravo.handleFor(A).get(); // bravo is now stale
  await alpha.handleFor(A).mutate((s) => s.sites.push(siteNamed("second")));

  let ran = 0;
  await bravo.handleFor(A).mutate((s) => {
    ran += 1;
    s.sites.push(siteNamed("third"));
  });
  assert.equal(ran, 2, "fn must run again on the fresh store, not once on the stale one");
  assert.deepEqual(rowStore(f, A).sites.map((s) => s.name), ["first", "second", "third"]);
});
