import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDatabase, deploymentRevision } from "./health.ts";

test("deploymentRevision accepts one full git SHA and normalizes its case", () => {
  assert.equal(deploymentRevision("A".repeat(40)), "a".repeat(40));
  assert.equal(deploymentRevision(" a".repeat(40)), null);
  assert.equal(deploymentRevision("abc123"), null);
  assert.equal(deploymentRevision(undefined), null);
});

test("checkDatabase reports a completed query as ready", async () => {
  assert.equal(await checkDatabase(async () => [{ ok: 1 }], 50), true);
});

test("checkDatabase fails closed on query errors and timeouts", async () => {
  assert.equal(
    await checkDatabase(async () => {
      throw new Error("offline");
    }, 50),
    false,
  );
  assert.equal(
    await checkDatabase(() => new Promise(() => undefined), 5),
    false,
  );
});
