import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { listingTransition, lookupListing } from "./botcentral.ts";
import type { ListingStatus } from "./botcentral.ts";

// CF-3 (2026-09-05): the botcentral_list task was granted from a live catalog
// read but never revoked by one, so a listing that rotted on BotCentral's side
// went on scoring as a completed submission forever. BotCentral revalidates
// origins every 6 hours and does NOT auto-unpublish, so the card stays listed
// and merely reports `verification.method: "unverified"`.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const stub = (status: number, body: unknown) => {
  globalThis.fetch = (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response) as typeof fetch;
};

const listing = (over: Partial<ListingStatus>): ListingStatus => ({
  listed: true,
  verified: true,
  ...over,
});

test("lookupListing reads the card's proof state", async () => {
  stub(200, {
    domain: "wflowprocess.app",
    verification: { method: "well-known-file", checked: "2026-09-05T04:47:45Z" },
  });
  const proven = await lookupListing("wflowprocess.app");
  assert.equal(proven.listed, true);
  assert.equal(proven.verified, true);
  assert.equal(proven.verificationMethod, "well-known-file");
});

test("lookupListing reports an unverified card as listed-but-unproven", async () => {
  stub(200, { domain: "x.test", verification: { method: "unverified" } });
  const stale = await lookupListing("x.test");
  assert.equal(stale.listed, true, "BotCentral leaves a downgraded card listed");
  assert.equal(stale.verified, false);
  assert.equal(stale.verificationMethod, "unverified");
});

test("a card with no verification block is UNKNOWN, not unproven", async () => {
  stub(200, { domain: "x.test" });
  const old = await lookupListing("x.test");
  assert.equal(old.listed, true);
  assert.equal(old.verified, undefined);
});

test("a 404 is a definitive not-listed; an error is not", async () => {
  stub(404, {});
  assert.deepEqual(await lookupListing("gone.test"), { listed: false });

  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED");
  }) as typeof fetch;
  const failed = await lookupListing("x.test");
  assert.equal(failed.listed, false);
  assert.equal(failed.error, "connect ECONNREFUSED");
});

test("CF-3 grant: a proven card completes the task", () => {
  assert.equal(listingTransition(listing({}), "queued"), "grant");
  assert.equal(listingTransition(listing({}), "blocked"), "grant");
  // Already done — nothing to do, and no repeated audit-log noise every poll.
  assert.equal(listingTransition(listing({}), "done"), "none");
});

test("CF-3 revoke: an unproven card un-completes the task", () => {
  // The reported drift: listed but no longer proven.
  assert.equal(
    listingTransition(listing({ verified: false }), "done"),
    "revoke",
  );
  // The card is gone from the catalog entirely.
  assert.equal(
    listingTransition({ listed: false }, "done"),
    "revoke",
  );
});

test("CF-3 fail slowly: an unreachable catalog revokes nothing", () => {
  // This is the case that must never revoke — a transient outage is not
  // evidence that a customer's listing went away.
  assert.equal(
    listingTransition({ listed: false, error: "catalog 502" }, "done"),
    "none",
  );
  assert.equal(
    listingTransition({ listed: false, error: "catalog unreachable" }, "done"),
    "none",
  );
  // Verified 2026-09-05: /v1/score, /v1/site and /v1/search share ONE 30/min
  // IP-keyed bucket, and hydrateListings spends one call per site per loadState
  // from a single VPS address. A burst is a routine event, not a hypothetical —
  // and without this guard it would un-list every customer at once.
  assert.equal(
    listingTransition({ listed: false, error: "catalog 429" }, "done"),
    "none",
  );
});

test("CF-3: an UNKNOWN verification block never revokes on its own", () => {
  // A shape change on BotCentral's side must not un-list every customer.
  assert.equal(
    listingTransition(listing({ verified: undefined }), "done"),
    "none",
  );
  assert.equal(
    listingTransition(listing({ verified: undefined }), "queued"),
    "grant",
  );
});

test("CF-3: a not-yet-done task is never revoked (nothing to take away)", () => {
  for (const status of ["queued", "assigned", "running", "blocked", "failed"] as const) {
    assert.equal(
      listingTransition(listing({ verified: false }), status),
      "none",
      `${status} should not be revoked`,
    );
  }
});

// Step 1 (2026-09-05): CiteFleet and BotCentral scored the same site 21 points
// apart and nothing reconciled them. The breakdown was already arriving on every
// card fetch and being discarded. Shapes below are copied from the live
// production card for wflowprocess.app, not invented.

test("the card's quality and component breakdown are read off the home page", async () => {
  stub(200, {
    domain: "wflowprocess.app",
    verification: { method: "well-known-file", note: "Token matched /.well-known/botcentral.txt (plain text)." },
    pages: [
      { rel: "page", url: "https://wflowprocess.app/privacy", score: 82, rank: { proof: 23, role: 7 } },
      {
        rel: "home",
        url: "https://wflowprocess.app/",
        score: 93,
        rank: { proof: 23, consent: 19, freshness: 15, crawl: 15, role: 15, surface: 6 },
      },
    ],
  });
  const card = await lookupListing("wflowprocess.app");
  // The home entry, not pages[0] — position is not the contract, `rel` is.
  assert.equal(card.quality, 93);
  assert.deepEqual(card.rank, {
    proof: 23,
    consent: 19,
    freshness: 15,
    crawl: 15,
    role: 15,
    surface: 6,
  });
  // The components must sum to the quality, or one of them was dropped.
  assert.equal(
    Object.values(card.rank ?? {}).reduce((a, b) => a + b, 0),
    card.quality,
  );
});

test("quality falls back to the first page when nothing is marked home", async () => {
  stub(200, { domain: "x.test", pages: [{ rel: "page", score: 82, rank: { proof: 23 } }] });
  const card = await lookupListing("x.test");
  assert.equal(card.quality, 82);
});

test("a card with no pages yields no score rather than a zero", async () => {
  // A missing score must never render as 0 — that would read as "scored badly".
  stub(200, { domain: "x.test" });
  const card = await lookupListing("x.test");
  assert.equal(card.quality, undefined);
  assert.equal(card.rank, undefined);
});

test("non-numeric rank entries are dropped, not coerced", async () => {
  stub(200, {
    domain: "x.test",
    pages: [{ rel: "home", score: 50, rank: { proof: 25, consent: "nineteen", freshness: null } }],
  });
  const card = await lookupListing("x.test");
  assert.deepEqual(card.rank, { proof: 25 });
});

test("the proof note is carried through for the blocked reason", async () => {
  stub(200, {
    domain: "x.test",
    verification: {
      method: "unverified",
      note: "Origin and robots.txt are reachable. Add DNS TXT botcentral-verify=<token> or a plain-text /.well-known/botcentral.txt.",
    },
  });
  const card = await lookupListing("x.test");
  assert.equal(card.verified, false);
  assert.match(card.verificationNote ?? "", /Add DNS TXT/);
  // And it still revokes — reading the note must not change the decision.
  assert.equal(listingTransition(card, "done"), "revoke");
});

test("a verification block with a note but no method stays UNKNOWN", async () => {
  stub(200, { domain: "x.test", verification: { note: "check pending" } });
  const card = await lookupListing("x.test");
  assert.equal(card.verified, undefined);
  assert.equal(card.verificationNote, "check pending");
  assert.equal(listingTransition(card, "done"), "none");
});
