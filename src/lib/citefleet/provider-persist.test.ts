import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeSnapshot } from "./persist.ts";
import { seedStore } from "./seed.ts";
import { chooseProvider } from "./provider-choice.ts";
import { PROVIDER_FLOWS } from "./provider-flows.ts";
import type { Site, StoreShape } from "./types.ts";
import { ROOT_WORKSPACE_ID } from "./workspace-id.ts";

// The database deliverable for the provider dropdown.
//
// `citefleet_snapshot` is one row holding the whole workspace as JSONB, so a new
// field on `Site` needs NO migration — but "needs no migration" is a claim about
// the write path, and a claim is not a proof. These tests run the exact
// transformation the round-trip applies: `saveSnapshot` writes
// `JSON.stringify(store)` into a JSONB column and `loadSnapshot` hands the parsed
// payload to `mergeSnapshot`. Everything below that is Postgres storing a JSON
// document, which is the one link these tests do not cover (see the report).

function storeWithSite(site: Partial<Site>): StoreShape {
  const store = seedStore(ROOT_WORKSPACE_ID);
  store.sites = [
    {
      id: "s1",
      workspaceId: "w1",
      name: "WflowProcess",
      domain: "wflowprocess.app",
      url: "https://wflowprocess.app/",
      status: "campaign",
      sitemapUrl: "https://wflowprocess.app/sitemap.xml",
      routes: ["/"],
      createdAt: "2026-09-01T00:00:00Z",
      scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
      summary: "",
      ...site,
    } as Site,
  ];
  return store;
}

/** Exactly what saveSnapshot → JSONB → loadSnapshot → mergeSnapshot does. */
function roundTrip(store: StoreShape): StoreShape {
  return mergeSnapshot(seedStore(ROOT_WORKSPACE_ID), JSON.parse(JSON.stringify(store)));
}

test("a chosen provider survives the snapshot round-trip with no migration", () => {
  const provider = chooseProvider(PROVIDER_FLOWS, "hostinger", new Date("2026-09-11T12:00:00Z"));
  const out = roundTrip(storeWithSite({ provider }));
  assert.deepEqual(out.sites[0].provider, {
    slug: "hostinger",
    name: "Hostinger",
    chosenAt: "2026-09-11T12:00:00.000Z",
  });
});

test("positive control: the round-trip really is doing the work", () => {
  // Rule 20 — if mergeSnapshot silently returned the seed, the test above would
  // pass for the wrong reason on an empty seed. It does not: the seed has no
  // sites at all, so a passing assertion proves the payload was read.
  assert.equal(seedStore(ROOT_WORKSPACE_ID).sites.length, 0, "seed must carry no properties");
  assert.equal(roundTrip(storeWithSite({})).sites.length, 1);
  // And a payload that is not a store falls back to the seed rather than merging.
  assert.equal(mergeSnapshot(seedStore(ROOT_WORKSPACE_ID), "not a store").sites.length, 0);
});

test("clearing the provider does not resurrect the old value", () => {
  // `undefined` is dropped by JSON.stringify, so the key disappears from the
  // JSONB document entirely. mergeSnapshot passes `sites` through wholesale, so
  // nothing reinstates it — this is the assertion that would catch a merge that
  // started deep-merging sites against the seed.
  const out = roundTrip(storeWithSite({ provider: undefined }));
  assert.equal(out.sites[0].provider, undefined);
  assert.ok(!("provider" in out.sites[0]), "the key must be absent, not null");
});

test("a provider recorded beside github and billing keeps all three", () => {
  // The field is one more key on the same document aggregate. If a future
  // mergeSnapshot change starts rebuilding sites field-by-field, this fails.
  const provider = chooseProvider(PROVIDER_FLOWS, "siteground", new Date("2026-09-11T12:00:00Z"));
  const out = roundTrip(
    storeWithSite({
      provider,
      github: { owner: "mitchvac", repo: "wflow", branch: "main", root: "public" },
      billing: { keyPrefix: "bc_live_52297216", setAt: "2026-09-06T00:00:00Z" },
    }),
  );
  assert.equal(out.sites[0].provider?.slug, "siteground");
  assert.equal(out.sites[0].github?.repo, "wflow");
  assert.equal(out.sites[0].billing?.keyPrefix, "bc_live_52297216");
});

test("a provider dropped AFTER a customer chose it still reads back", () => {
  // Storage must not validate: the reason a rootless provider is kept in the
  // registry is that a stored choice has to keep meaning something. The panel
  // explains it (providerGuidance); the snapshot just carries it.
  const out = roundTrip(
    storeWithSite({ provider: { slug: "wix", name: "Wix", chosenAt: "2026-09-01T00:00:00Z" } }),
  );
  assert.equal(out.sites[0].provider?.slug, "wix");
});

// NOT tested here: `setProvider` in dispatcher.ts, which calls `chooseProvider`
// BEFORE `mutateStore` — so a rootless slug is refused before any database work.
// That ordering is verified by reading the source, and the gate itself is covered
// by provider-choice.test.ts (all 5 refused, all 20 accepted). It is not executed
// here because dispatcher.ts uses extensionless imports ("./playbook") that the
// Vite bundler resolves and raw Node ESM does not — a pre-existing property of
// that module, not of this change.
