import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanPrefix,
  clampTopupUsd,
  MAX_TOPUP_USD,
  MIN_TOPUP_USD,
  parseTopupSearch,
  payInstructions,
  settleRequestBody,
  verifyTopupInvoice,
  type TopupInvoice,
} from "./topup.ts";

function invoice(over: Partial<TopupInvoice["pay"]> = {}): TopupInvoice {
  return {
    id: "bj_0123456789abcdef0123456789abcdef",
    status: "invoiced",
    usd: "2.00",
    jobs: 2,
    asset: "xrp",
    amount: "1.481482",
    rate_usd: "1.35",
    expires: "2026-09-03T01:00:00.000Z",
    created: "2026-09-03T00:45:00.000Z",
    pay: {
      via: "citefleet",
      topup: "",
      network: "xrpl",
      network_name: "XRP Ledger",
      ticker: "XRP",
      amount: "1.481482",
      address: null,
      destination_tag: 12345,
      matching: "destination_tag",
      ...over,
    } as TopupInvoice["pay"],
  };
}

test("parseTopupSearch: BotCentral's link params normalize; hostile input degrades to defaults", () => {
  assert.deepEqual(
    parseTopupSearch({ prefix: "bc_live_ab12cd34", jobs: "3", asset: "xrp", job: "1" }),
    {
      prefix: "bc_live_ab12cd34",
      // $3 is under the $5 minimum, so the invoice is raised to $5 — which buys 5 calls.
      jobs: 5,
      usd: 5,
      asset: "xrp",
      job: "",
    },
  );
  assert.deepEqual(parseTopupSearch({ prefix: "bc_live_pending", usd: "5.00", asset: "DOGE" }), {
    prefix: "",
    jobs: 5,
    usd: 5,
    asset: "rlusd",
    job: "",
  });
  assert.deepEqual(
    parseTopupSearch({ prefix: "'; DROP TABLE api_keys; --", jobs: "-4", asset: "" }),
    {
      prefix: "",
      jobs: 5,
      usd: 5,
      asset: "rlusd",
      job: "",
    },
  );
  assert.equal(parseTopupSearch({ jobs: "999999" }).jobs, 10_000);
  assert.equal(parseTopupSearch({ jobs: "999999" }).usd, 10_000);
  assert.equal(
    parseTopupSearch({ job: "bj_0123456789abcdef0123456789abcdef" }).job,
    "bj_0123456789abcdef0123456789abcdef",
  );
  assert.equal(parseTopupSearch({ job: "bj_short" }).job, "");
  // With nothing given, the invoice opens at the minimum rather than at one call.
  assert.deepEqual(parseTopupSearch({}), { prefix: "", jobs: 5, usd: 5, asset: "rlusd", job: "" });
});

test("cleanPrefix accepts only bc_live_ hex prefixes", () => {
  assert.equal(cleanPrefix(" bc_live_ab12cd34 "), "bc_live_ab12cd34");
  assert.equal(cleanPrefix("bc_pub_ab12cd34"), "");
  assert.equal(cleanPrefix("bc_live_ZZZZ"), "");
  assert.equal(cleanPrefix(42), "");
});

test("payInstructions: with a treasury address it names amount, address and tag; without one it says so", () => {
  const direct = payInstructions(invoice({ address: "rTreasury123", via: "direct" }));
  assert.match(direct[0], /Send exactly 1\.481482 XRP on XRP Ledger for \$2\.00 \(2 jobs\)/);
  assert.match(direct[1], /Pay to rTreasury123/);
  assert.match(direct[2], /Destination tag 12345 is required/);
  const viaOps = payInstructions(invoice());
  assert.match(viaOps[1], /no treasury address bound/);
  assert.ok(!viaOps.some((l) => /Pay to/.test(l)));
  assert.match(viaOps.at(-1)!, /Quote expires 2026-09-03T01:00:00\.000Z/);
});

test("settleRequestBody validates the operator's input before it reaches BotCentral", () => {
  assert.deepEqual(
    settleRequestBody({
      id: "bj_0123456789abcdef0123456789abcdef",
      tx: " ABCD1234 ",
      prefix: "bc_live_ab12cd34",
    }),
    { id: "bj_0123456789abcdef0123456789abcdef", tx: "ABCD1234", prefix: "bc_live_ab12cd34" },
  );
  assert.deepEqual(
    settleRequestBody({ id: "bj_0123456789abcdef0123456789abcdef", tx: "hash", prefix: "junk" }),
    {
      id: "bj_0123456789abcdef0123456789abcdef",
      tx: "hash",
    },
  );
  assert.throws(() => settleRequestBody({ id: "nope", tx: "hash" }), /Invoice id/);
  assert.throws(
    () => settleRequestBody({ id: "bj_0123456789abcdef0123456789abcdef", tx: "ab" }),
    /4–128/,
  );
  assert.throws(
    () => settleRequestBody({ id: "bj_0123456789abcdef0123456789abcdef", tx: "x".repeat(129) }),
    /4–128/,
  );
});

test("top-up amounts: the minimum is enforced and cents survive", () => {
  assert.equal(clampTopupUsd(5), 5, "the minimum itself is allowed");
  assert.equal(clampTopupUsd(7.5), 7.5, "a fractional amount is kept exactly");
  assert.equal(clampTopupUsd(1), MIN_TOPUP_USD, "below the minimum is raised to it");
  assert.equal(clampTopupUsd(0), MIN_TOPUP_USD);
  assert.equal(clampTopupUsd(-100), MIN_TOPUP_USD, "a negative amount can never credit");
  assert.equal(clampTopupUsd(99_999), MAX_TOPUP_USD, "a typo cannot quote a fortune");
  assert.equal(clampTopupUsd("25"), 25, "a typed string works");
  assert.equal(clampTopupUsd("abc"), MIN_TOPUP_USD, "junk falls back to the minimum");
  assert.equal(clampTopupUsd(7.999), 8, "sub-cent precision is rounded away");
});

test("a BotCentral link carrying usd is honoured; otherwise jobs means dollars", () => {
  assert.equal(parseTopupSearch({ usd: "25.50" }).usd, 25.5);
  assert.equal(parseTopupSearch({ jobs: "12" }).usd, 12, "twelve calls is twelve dollars");
  assert.equal(
    parseTopupSearch({}).usd,
    MIN_TOPUP_USD,
    "no amount given falls back to the minimum",
  );
  assert.equal(parseTopupSearch({ usd: "2" }).usd, MIN_TOPUP_USD, "under the minimum is raised");
});

test("verifyTopupInvoice refuses anything that is not an invoice id, before any network call", async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => verifyTopupInvoice("https://botcentral.org", "bj_short"),
      /not a BotCentral invoice id/,
    );
    await assert.rejects(
      () => verifyTopupInvoice("https://botcentral.org", "'; drop table jobs; --"),
      /not a BotCentral invoice id/,
    );
    assert.equal(called, false, "a malformed id must never reach the network");
    // Positive control: a well-formed id does call out.
    await verifyTopupInvoice("https://botcentral.org", "bj_" + "a".repeat(32)).catch(() => {});
    assert.equal(called, true);
  } finally {
    globalThis.fetch = original;
  }
});
