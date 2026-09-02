import assert from "node:assert/strict";
import { test } from "node:test";
import { maskStoreSecrets } from "./secrets.ts";
import type { StoreShape } from "./types.ts";

test("maskStoreSecrets hides the GitHub token and every webhook secret, keeps everything else", () => {
  const store = {
    workspace: { id: "ws", name: "CiteFleet", plan: "enterprise", region: "us", githubToken: "ghp_realtoken" },
    sites: [
      { id: "a", domain: "a.example", webhook: { secret: "s-a", createdAt: "2026-09-02T00:00:00Z", lastEvent: "push · main", recentDeliveries: ["d1"] } },
      { id: "b", domain: "b.example" },
    ],
    bots: [], tasks: [], activity: [], engines: [], control: { kill: { global: false } },
  } as unknown as StoreShape;
  const masked = maskStoreSecrets(store);
  // positive controls: the real values ARE in the input
  assert.equal(store.workspace.githubToken, "ghp_realtoken");
  assert.equal(store.sites[0].webhook?.secret, "s-a");
  // masked output
  assert.equal(masked.workspace.githubToken, "set");
  assert.equal(masked.sites[0].webhook?.secret, "");
  assert.equal(masked.sites[0].webhook?.lastEvent, "push · main");
  assert.deepEqual(masked.sites[0].webhook?.recentDeliveries, ["d1"]);
  assert.equal(masked.sites[1].webhook, undefined);
  assert.equal(JSON.stringify(masked).includes("s-a"), false);
  assert.equal(JSON.stringify(masked).includes("ghp_realtoken"), false);
  // input untouched
  assert.equal(store.sites[0].webhook?.secret, "s-a");
});
