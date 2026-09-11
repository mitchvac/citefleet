import assert from "node:assert/strict";
import { test } from "node:test";
import { runInTransaction, type TxClient } from "./db.ts";

// The transaction logic, driven by a fake connection. Everything that matters
// about `withTransaction` is an ORDERING guarantee — BEGIN before the work,
// COMMIT only on success, ROLLBACK on failure, release always — and ordering is
// exactly what a fake can prove. No database is needed or used here; the real
// `withTransaction` is this function plus `pool.connect()`.

function fakeClient(over: Partial<{ fail: string; rows: unknown[] }> = {}) {
  const statements: string[] = [];
  let released = 0;
  const client: TxClient = {
    async query(text: string) {
      statements.push(text);
      if (over.fail && text === over.fail) throw new Error(`postgres said no: ${text}`);
      return { rows: over.rows ?? [] };
    },
    release() {
      released += 1;
    },
  };
  return { client, statements, released: () => released };
}

test("a successful transaction is BEGIN, the work, COMMIT — in that order", async () => {
  const f = fakeClient();
  const out = await runInTransaction(f.client, async (tx) => {
    await tx.query("insert into citefleet_workspaces values ($1)", ["ws-a"]);
    return "done";
  });
  assert.equal(out, "done");
  assert.deepEqual(f.statements, [
    "BEGIN",
    "insert into citefleet_workspaces values ($1)",
    "COMMIT",
  ]);
  assert.equal(f.released(), 1);
});

test("a throwing body rolls back, never commits, and rethrows the ORIGINAL error", async () => {
  const f = fakeClient();
  await assert.rejects(
    () =>
      runInTransaction(f.client, async (tx) => {
        await tx.query("insert into citefleet_domains values ($1)", ["acme.com"]);
        throw new Error("duplicate key value violates unique constraint");
      }),
    /duplicate key/,
  );
  assert.deepEqual(f.statements, [
    "BEGIN",
    "insert into citefleet_domains values ($1)",
    "ROLLBACK",
  ]);
  assert.ok(!f.statements.includes("COMMIT"), "a failed body must never commit");
  assert.equal(f.released(), 1);
});

test("a rollback that itself fails does not replace the error that caused it", async () => {
  // The connection dies mid-transaction: ROLLBACK throws too. The caller must
  // still see why the work failed, not a confusing secondary error.
  const f = fakeClient({ fail: "ROLLBACK" });
  await assert.rejects(
    () =>
      runInTransaction(f.client, async () => {
        throw new Error("the real reason");
      }),
    /the real reason/,
  );
  assert.equal(f.released(), 1, "the connection is released even when rollback fails");
});

test("the connection is released when COMMIT fails", async () => {
  const f = fakeClient({ fail: "COMMIT" });
  await assert.rejects(() => runInTransaction(f.client, async () => "ok"), /COMMIT/);
  // A leaked connection is invisible until the pool (default max 10) is empty
  // and every request hangs, so this is the assertion worth having.
  assert.equal(f.released(), 1);
});

test("tx is dead after the transaction ends — a stashed handle cannot write", async () => {
  // The failure this prevents: a caller keeps `tx`, uses it later, and the
  // statement runs on a RELEASED connection — outside any transaction, on a
  // connection that may already be serving someone else's request.
  const f = fakeClient();
  let escaped: Awaited<ReturnType<typeof capture>> | null = null;
  async function capture(tx: Parameters<Parameters<typeof runInTransaction>[1]>[0]) {
    return tx;
  }
  await runInTransaction(f.client, async (tx) => {
    escaped = await capture(tx);
  });
  assert.ok(escaped, "positive control: the handle really did escape");
  await assert.rejects(
    () => escaped!.query("delete from citefleet_workspaces"),
    /already finished/,
  );
  // And the statement never reached the connection.
  assert.deepEqual(f.statements, ["BEGIN", "COMMIT"]);
});

test("the body's return value is what comes back, not the query rows", async () => {
  const f = fakeClient({ rows: [{ id: "ws-a" }] });
  const out = await runInTransaction(f.client, async (tx) => {
    const rows = await tx.query<{ id: string }>("select id from citefleet_workspaces");
    return rows.map((r) => r.id);
  });
  assert.deepEqual(out, ["ws-a"]);
});
