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

// The listing year (BotCentral's brief, 2026-09-06). Request and response
// shapes are read from BotCentral src/routes/internal/publish.ts and
// src/lib/publish.ts, not invented. `keyPrefix` rides beside the card; 201
// carries `term` and `billed`; 402 carries reason/usd/term_days/topup.
import { billingPrefixFor, publishListing } from "./botcentral.ts";
import type { Site } from "./types.ts";

function billableSite(over: Partial<Site> = {}): Site {
  return {
    id: "site-h", workspaceId: "ws", name: "Herald", domain: "herald.example", url: "https://herald.example",
    status: "campaign", sitemapUrl: "https://herald.example/sitemap.xml", routes: ["/"], createdAt: "2026-09-01T00:00:00.000Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 }, summary: "A newsroom.",
    billing: { keyPrefix: "bc_live_52297216", setAt: "2026-09-06T00:00:00.000Z" },
    ...over,
  };
}

/** Stub the two calls publishListing makes: the card read, then the publish. Captures the publish body. */
function stubPublish(status: number, response: unknown) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.includes("/v1/site/")) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    return { ok: status >= 200 && status < 300, status, json: async () => response } as unknown as Response;
  }) as typeof fetch;
  return calls;
}
const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { await fn(); } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
};

test("the key prefix is sent only when the switch is on AND the site has a valid key", () => {
  const s = billableSite();
  assert.equal(billingPrefixFor(s, {}), "", "switch unset → never sent (the brief: not until a key is funded)");
  assert.equal(billingPrefixFor(s, { CITEFLEET_BOTCENTRAL_BILLING: "off" }), "");
  assert.equal(billingPrefixFor(s, { CITEFLEET_BOTCENTRAL_BILLING: "on" }), "bc_live_52297216");
  assert.equal(billingPrefixFor(s, { CITEFLEET_BOTCENTRAL_BILLING: " ON " }), "bc_live_52297216");
  assert.equal(billingPrefixFor(billableSite({ billing: undefined }), { CITEFLEET_BOTCENTRAL_BILLING: "on" }), "");
  // A malformed or placeholder prefix is never sent either.
  assert.equal(billingPrefixFor(billableSite({ billing: { keyPrefix: "bc_live_pending", setAt: "" } }), { CITEFLEET_BOTCENTRAL_BILLING: "on" }), "");
  assert.equal(billingPrefixFor(billableSite({ billing: { keyPrefix: "sk_live_abc", setAt: "" } }), { CITEFLEET_BOTCENTRAL_BILLING: "on" }), "");
});

test("publish: switch off → body carries no keyPrefix; the interim 201 (no term) still lists", async () => {
  await withEnv({ CITEFLEET_BOTCENTRAL_BILLING: undefined, BOTCENTRAL_SERVICE_TOKEN: "s".repeat(32) }, async () => {
    const calls = stubPublish(201, { ok: true, card: { domain: "herald.example", verification: { method: "well-known-file" } } });
    const out = await publishListing(billableSite());
    const publish = calls.find((c) => c.url.endsWith("/internal/publish"));
    assert.ok(publish, "publish was called");
    assert.equal("keyPrefix" in (publish!.body as object), false);
    assert.equal(out.listed, true);
    assert.equal(out.verified, true);
    assert.equal(out.term, undefined, "production's interim code sends no term — that is not a lapse");
    assert.equal(out.billed, false);
  });
});

test("publish: switch on → keyPrefix rides beside the card; 201 carries term and billed", async () => {
  await withEnv({ CITEFLEET_BOTCENTRAL_BILLING: "on", BOTCENTRAL_SERVICE_TOKEN: "s".repeat(32) }, async () => {
    const calls = stubPublish(201, {
      ok: true,
      billed: true,
      term: { status: "active", paid_until: "2027-09-06T17:55:07.474Z", usd: "10.00", term_days: 365 },
      card: { domain: "herald.example", verification: { method: "well-known-file" } },
    });
    const out = await publishListing(billableSite());
    const publish = calls.find((c) => c.url.endsWith("/internal/publish"))!;
    const sent = publish.body as Record<string, unknown>;
    assert.equal(sent.keyPrefix, "bc_live_52297216");
    assert.equal(sent.domain, "herald.example", "the card itself is unchanged");
    assert.equal(out.listed, true);
    assert.equal(out.billed, true);
    assert.deepEqual(out.term, { status: "active", paidUntil: "2027-09-06T17:55:07.474Z", usd: "10.00", termDays: 365 });
  });
});

test("publish: 402 → not listed, the reason and top-up link are carried, nothing is invented", async () => {
  await withEnv({ CITEFLEET_BOTCENTRAL_BILLING: "on", BOTCENTRAL_SERVICE_TOKEN: "s".repeat(32) }, async () => {
    stubPublish(402, {
      error: "API key bc_live_52297216 does not hold the $10.00 a listing costs for a year",
      reason: "insufficient",
      usd: "10.00",
      term_days: 365,
      topup: "https://citefleet.app/topup?prefix=bc_live_52297216&product=botcentral",
    });
    const out = await publishListing(billableSite());
    assert.equal(out.listed, false);
    assert.equal(out.payment?.reason, "insufficient");
    assert.equal(out.payment?.topup, "https://citefleet.app/topup?prefix=bc_live_52297216&product=botcentral");
    assert.match(out.error ?? "", /does not hold the \$10\.00/);
    // A 402 carries `error`, so `listingTransition` (fail slowly: an answer
    // with an error is not evidence of a de-listing) never revokes on it.
    assert.equal(listingTransition(out, "done"), "none");
  });
});

test("publish: a 422 (card refused) is still a plain error, not a payment", async () => {
  await withEnv({ CITEFLEET_BOTCENTRAL_BILLING: "on", BOTCENTRAL_SERVICE_TOKEN: "s".repeat(32) }, async () => {
    stubPublish(422, { error: "ownership not proven: no token" });
    const out = await publishListing(billableSite());
    assert.equal(out.listed, false);
    assert.equal(out.payment, undefined);
    assert.equal(out.error, "ownership not proven: no token");
  });
});
