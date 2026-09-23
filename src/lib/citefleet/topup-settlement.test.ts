import assert from "node:assert/strict";
import { test } from "node:test";
import { seedStore } from "./seed.ts";
import { asWorkspaceId } from "./workspace-id.ts";
import type { WorkspaceHandle } from "./workspace-handle.ts";

import { settleTopup } from "./topup.server.ts";
const input = { id: `bj_${"a".repeat(32)}`, tx: "receipt-reference" };

function workspace(frozen = false): WorkspaceHandle {
  const id = asWorkspaceId("ws-billing-regression");
  const store = seedStore(id);
  store.control.kill.doors.spend = frozen;
  return { id, get: async () => store, mutate: async (fn) => fn(store) };
}

test("manual settlement denies both customer identities and an absent principal before contacting BotCentral", async () => {
  const prior = process.env.BOTCENTRAL_SERVICE_TOKEN;
  process.env.BOTCENTRAL_SERVICE_TOKEN = "test-service-token-for-billing-only";
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return Response.json({ invoice: { id: input.id, jobs: 10, usd: "10.00", key_prefix: "bc_live_aaaaaaaa" } });
  };
  try {
    for (const userId of ["customer-one", "customer-two"]) {
      await assert.rejects(() => settleTopup(workspace(), input, { kind: "user", userId, email: `${userId}@example.test` }), /Forbidden.*operator/i);
    }
    await assert.rejects(() => Reflect.apply(settleTopup, undefined, [workspace(), input]), /Forbidden.*operator/i);
    assert.equal(requests, 0);
    // Positive control proves the same provider and function accept the privileged path.
    const ws = workspace();
    await settleTopup(ws, input, { kind: "break-glass" });
    assert.equal(requests, 1);
    assert.match((await ws.get()).activity[0].message, /Settled BotCentral invoice/);
    await assert.rejects(() => settleTopup(workspace(true), input, { kind: "break-glass" }), /spend door is frozen/);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = original;
    if (prior === undefined) delete process.env.BOTCENTRAL_SERVICE_TOKEN;
    else process.env.BOTCENTRAL_SERVICE_TOKEN = prior;
  }
});
