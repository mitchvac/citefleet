import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CACHED_WORKSPACES,
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

/** An in-memory stand-in for the citefleet_snapshot table. */
function fakeStore(over: { failSaveFor?: WorkspaceId } = {}) {
  const rows = new Map<WorkspaceId, unknown>();
  const loads: WorkspaceId[] = [];
  const saves: WorkspaceId[] = [];
  const io: SnapshotStore = {
    async load(id) {
      loads.push(id);
      return rows.get(id) ?? null;
    },
    async save(id, store) {
      saves.push(id);
      if (over.failSaveFor === id) throw new Error("snapshot write failed");
      // Round-trip through JSON exactly as a JSONB column does.
      rows.set(id, JSON.parse(JSON.stringify(store)));
    },
  };
  return { io, rows, loads, saves };
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
  const rowA = f.rows.get(A) as StoreShape;
  const rowB = f.rows.get(B) as StoreShape;
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
    async save() {},
  };
  const ws = createWorkspaces(io);
  const a = await ws.handleFor(A).get();
  assert.deepEqual(a.sites, []);
  assert.equal(a.workspace.id, A);
});
