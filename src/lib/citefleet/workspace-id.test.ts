import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ROOT_WORKSPACE_ID,
  asWorkspaceId,
  isWorkspaceId,
  newWorkspaceId,
  toWorkspaceId,
} from "./workspace-id.ts";

const dir = fileURLToPath(new URL("./", import.meta.url));

test("a well-formed key is accepted and returned unchanged", () => {
  assert.equal(asWorkspaceId("ws-citefleet"), "ws-citefleet");
  assert.equal(asWorkspaceId("ws-a1b2c3d4e5f6"), "ws-a1b2c3d4e5f6");
});

test("anything that is not a workspace key is REFUSED, not coerced", () => {
  // Each of these is a real id from this codebase that a `string` parameter
  // would have accepted silently. That is the bug the brand exists to stop.
  for (const bad of [
    "default", // the old global snapshot key
    "site-9f2c1a", // a siteId
    "task-4411", // a taskId
    "u_9f2c1a", // a citefleet_users id
    "WS-CITEFLEET", // case matters: it is a primary key
    " ws-citefleet", // whitespace makes a second identity for one tenant
    "ws-citefleet ",
    "ws-", // no name
    "ws-x", // too short to be meaningful
    "ws-Has-Capitals",
    "citefleet",
    "",
  ]) {
    assert.throws(() => asWorkspaceId(bad), /is not a workspace id/, `accepted ${JSON.stringify(bad)}`);
    assert.equal(isWorkspaceId(bad), false, `isWorkspaceId said yes to ${JSON.stringify(bad)}`);
  }
});

test("toWorkspaceId returns null for junk instead of throwing", () => {
  // The parsing form, for a cookie or a database row.
  assert.equal(toWorkspaceId("nope"), null);
  assert.equal(toWorkspaceId(undefined), null);
  assert.equal(toWorkspaceId(42), null);
  assert.equal(toWorkspaceId("ws-citefleet"), "ws-citefleet");
});

test("the root workspace id is itself valid", () => {
  // It is written into the migration's backfill; if it did not satisfy the
  // validator, every existing customer would fail to resolve after deploy.
  assert.ok(isWorkspaceId(ROOT_WORKSPACE_ID));
  assert.equal(ROOT_WORKSPACE_ID, "ws-citefleet");
});

test("a minted id is valid and not the same twice", () => {
  const a = newWorkspaceId();
  const b = newWorkspaceId();
  assert.ok(isWorkspaceId(a), a);
  assert.notEqual(a, b);
});

test("the migration's backfill uses exactly the root id this code expects", () => {
  // Drift here means the deploy lands and nobody can sign in: the snapshot row
  // is keyed one way and `ROOT_WORKSPACE_ID` looks for another.
  const migrations = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
  const tenancy = readdirSync(migrations).find((f) => f.endsWith("_citefleet_tenancy.sql"));
  assert.ok(tenancy, "positive control: the tenancy migration exists");
  const sql = readFileSync(`${migrations}${tenancy}`, "utf8");
  assert.ok(sql.includes(`'${ROOT_WORKSPACE_ID}'`), `migration must backfill ${ROOT_WORKSPACE_ID}`);
  assert.ok(sql.includes("citefleet_workspaces"), "migration must create the registry");
});

test("no zero-argument store accessor exists any more", () => {
  // THE regression lock. `getStore()` / `mutateStore()` read whichever workspace
  // happened to be cached; with tenants that is whichever customer was last
  // touched. If someone re-adds the convenience, this fails.
  const store = readFileSync(`${dir}store.ts`, "utf8");
  // Positive control: the file really does export things, so a clean scan is
  // evidence about these names and not about an unreadable file.
  assert.match(store, /export function logActivity/, "positive control");
  assert.doesNotMatch(store, /export\s+(async\s+)?function\s+getStore\b/);
  assert.doesNotMatch(store, /export\s+(async\s+)?function\s+mutateStore\b/);
  assert.doesNotMatch(store, /export\s+(async\s+)?function\s+resetStore\b/);
});

test("nothing imports a tenant-less store accessor", () => {
  const offenders: string[] = [];
  let scanned = 0;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = `${d}${entry.name}`;
      if (entry.isDirectory()) walk(`${full}/`);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        scanned += 1;
        const src = readFileSync(full, "utf8");
        // An import naming getStore/mutateStore/resetStore FROM the store module.
        if (/import\s*\{[^}]*\b(getStore|mutateStore|resetStore)\b[^}]*\}\s*from\s*["'][^"']*store(\.ts)?["']/.test(src)) {
          offenders.push(entry.name);
        }
      }
    }
  };
  walk(fileURLToPath(new URL("../../", import.meta.url)));
  assert.ok(scanned > 50, `positive control: expected to scan the app, scanned ${scanned}`);
  assert.deepEqual(offenders, [], "every store access goes through a WorkspaceHandle");
});
