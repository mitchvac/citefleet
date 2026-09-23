import test from "node:test";
import assert from "node:assert/strict";
import { billingPrefixFor } from "./botcentral.ts";

test("billing on rejects a public prefix with no proof of possession and missing keys", () => {
  const env = { CITEFLEET_BOTCENTRAL_BILLING: "on" };
  assert.throws(
    () =>
      billingPrefixFor({ billing: { keyPrefix: "bc_live_12345678", setAt: "2026-09-01" } }, env),
    /verify|verified/i,
  );
  assert.throws(() => billingPrefixFor({}, env), /verify|verified/i);
  assert.equal(billingPrefixFor({}, {}), "");
});

import { setBillingKey } from "./billing-key.server.ts";
import { seedStore } from "./seed.ts";
import { asWorkspaceId } from "./workspace-id.ts";
import type { WorkspaceHandle } from "./workspace-handle.ts";

test("attachment verifies possession, isolates workspace, persists no secret, and fails closed", async () => {
  const store = seedStore(asWorkspaceId("ws-billing-test"));
  store.sites.push({
    id: "mine",
    workspaceId: store.workspace.id,
    name: "Test",
    domain: "example.test",
    url: "https://example.test",
    status: "campaign",
    sitemapUrl: "https://example.test/sitemap.xml",
    routes: ["/"],
    createdAt: "2026-09-01",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
  });
  const ws: WorkspaceHandle = {
    id: asWorkspaceId(store.workspace.id),
    get: async () => structuredClone(store),
    mutate: async (fn) => fn(store),
  };
  const originalFetch = globalThis.fetch;
  const oldToken = process.env.BOTCENTRAL_SERVICE_TOKEN;
  process.env.BOTCENTRAL_SERVICE_TOKEN = "billing-test-service-token";
  const secret = `bc_live_${"a".repeat(48)}`;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(String(init?.body)).keySecret, secret);
    return Response.json({ keyPrefix: secret.slice(0, 16) });
  };
  try {
    await assert.rejects(() => setBillingKey(ws, "mine", "bc_live_12345678"), /full.*secret/i);
    assert.equal(calls, 0);
    await assert.rejects(
      () => setBillingKey(ws, "another-customers-site", secret),
      /Site not found/,
    );
    assert.equal(calls, 0);
    const result = await setBillingKey(ws, "mine", secret);
    assert.equal(result.keyPrefix, secret.slice(0, 16));
    assert.equal(
      billingPrefixFor(store.sites[0], { CITEFLEET_BOTCENTRAL_BILLING: "on" }),
      result.keyPrefix,
    );
    assert.equal(JSON.stringify({ store, result }).includes(secret), false);
    const prior = structuredClone(store.sites[0].billing);
    globalThis.fetch = async () => Response.json({ error: secret }, { status: 422 });
    await assert.rejects(() => setBillingKey(ws, "mine", secret), /could not verify/);
    assert.deepEqual(store.sites[0].billing, prior);
    globalThis.fetch = async () =>
      new Response("<html>fallback</html>", { headers: { "content-type": "text/html" } });
    await assert.rejects(() => setBillingKey(ws, "mine", secret), /unavailable/);
    assert.deepEqual(store.sites[0].billing, prior);
    await setBillingKey(ws, "mine", "");
    assert.equal(store.sites[0].billing, undefined);
    assert.throws(
      () => billingPrefixFor(store.sites[0], { CITEFLEET_BOTCENTRAL_BILLING: "on" }),
      /Verify/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (oldToken === undefined) delete process.env.BOTCENTRAL_SERVICE_TOKEN;
    else process.env.BOTCENTRAL_SERVICE_TOKEN = oldToken;
  }
});
