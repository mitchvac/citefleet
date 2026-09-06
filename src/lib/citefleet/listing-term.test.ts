import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RENEWAL_WINDOW_DAYS,
  describeTerm,
  readPayment,
  readTerm,
  renewalEmail,
  renewalNotices,
  renewalState,
  termDaysLeft,
  type ListingTerm,
} from "./listing-term.ts";

// Shapes below are BotCentral's, read from its src/lib/listing-term.ts
// (`describeTerm`) and src/routes/internal/publish.ts (the 402 body) on
// 2026-09-06, not invented.
const NOW = Date.parse("2026-09-06T18:00:00.000Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();
const term = (over: Partial<ListingTerm>): ListingTerm => ({
  status: "active",
  paidUntil: at(365),
  usd: "10.00",
  termDays: 365,
  ...over,
});

test("readTerm parses BotCentral's term block and rejects anything else", () => {
  assert.deepEqual(
    readTerm({ status: "active", paid_until: "2027-09-06T17:55:07.474Z", usd: "10.00", term_days: 365 }),
    { status: "active", paidUntil: "2027-09-06T17:55:07.474Z", usd: "10.00", termDays: 365 },
  );
  assert.deepEqual(readTerm({ status: "unbilled", paid_until: null, usd: "10.00", term_days: 365 }), {
    status: "unbilled",
    paidUntil: null,
    usd: "10.00",
    termDays: 365,
  });
  // The interim production code sends no term at all; that is "no term", never a lapse.
  assert.equal(readTerm(undefined), undefined);
  assert.equal(readTerm({}), undefined);
  assert.equal(readTerm({ status: "paid" }), undefined);
  assert.equal(readTerm("active"), undefined);
  // A malformed date degrades to null, and a missing term_days to the documented 365.
  assert.deepEqual(readTerm({ status: "active", paid_until: "soon", usd: 10 }), {
    status: "active",
    paidUntil: null,
    usd: "10.00",
    termDays: 365,
  });
});

test("readPayment reads the 402 body and falls back to a CiteFleet top-up link", () => {
  const body = {
    error: "API key bc_live_52297216 does not hold the $10.00 a listing costs for a year",
    reason: "insufficient",
    usd: "10.00",
    term_days: 365,
    topup: "https://citefleet.app/topup?prefix=bc_live_52297216&product=botcentral",
  };
  assert.deepEqual(readPayment(body, "https://citefleet.app/topup?product=botcentral"), {
    reason: "insufficient",
    usd: "10.00",
    termDays: 365,
    topup: body.topup,
    message: body.error,
  });
  for (const reason of ["unknown", "revoked", "lapsed"]) {
    assert.equal(readPayment({ reason }, "https://x/topup").reason, reason);
  }
  // An unrecognised reason is reported as such, not mapped onto "unknown"
  // (which means "no key matches this prefix" and would misdirect the fix).
  const odd = readPayment({ reason: "declined", topup: "http://not-https" }, "https://citefleet.app/topup");
  assert.equal(odd.reason, "unspecified");
  assert.equal(odd.topup, "https://citefleet.app/topup");
  assert.match(odd.message, /funded API key/);
});

test("renewalState is decided by the clock, not the stored status", () => {
  assert.equal(renewalState(undefined, NOW), "none");
  assert.equal(renewalState(term({ status: "unbilled", paidUntil: null }), NOW), "unbilled");
  assert.equal(renewalState(term({ paidUntil: at(200) }), NOW), "active");
  assert.equal(renewalState(term({ paidUntil: at(RENEWAL_WINDOW_DAYS) }), NOW), "due");
  assert.equal(renewalState(term({ paidUntil: at(1) }), NOW), "due");
  // Stored as active a year ago; today it is over. The webhook may not have arrived.
  assert.equal(renewalState(term({ status: "active", paidUntil: at(-1) }), NOW), "lapsed");
  assert.equal(renewalState(term({ status: "lapsed", paidUntil: at(-40) }), NOW), "lapsed");
  // BotCentral said lapsed but its date did not parse: still lapsed, never "unbilled".
  assert.equal(renewalState(term({ status: "lapsed", paidUntil: null }), NOW), "lapsed");
  assert.match(describeTerm(term({ status: "lapsed", paidUntil: null }), NOW), /ended an unknown date/);
  assert.equal(termDaysLeft(term({ paidUntil: at(10) }), NOW), 10);
  assert.equal(termDaysLeft(term({ paidUntil: null }), NOW), null);
});

test("describeTerm names the date and the move for every state", () => {
  assert.equal(describeTerm(undefined, NOW), "");
  assert.match(describeTerm(term({ status: "unbilled", paidUntil: null }), NOW), /Not on a paid listing year yet/);
  const active = describeTerm(term({ paidUntil: at(200) }), NOW);
  assert.match(active, /ends 2027-03-25 \(200 days\)/);
  assert.match(active, /free/);
  const due = describeTerm(term({ paidUntil: at(1) }), NOW);
  assert.match(due, /1 day left/);
  assert.match(due, /top up the key, then List on BotCentral/);
  const lapsed = describeTerm(term({ paidUntil: at(-3) }), NOW);
  assert.match(lapsed, /ended 2026-09-03/);
  assert.match(lapsed, /no longer proven until it is renewed/);
});

test("renewalNotices: inside the window, once per term end, never for unbilled or lapsed", () => {
  const sites = [
    { id: "due", term: term({ paidUntil: at(20) }) },
    { id: "already-told", term: term({ paidUntil: at(20) }), renewalNoticeFor: at(20) },
    { id: "told-about-last-year", term: term({ paidUntil: at(20) }), renewalNoticeFor: at(-345) },
    { id: "far", term: term({ paidUntil: at(200) }) },
    { id: "unbilled", term: term({ status: "unbilled", paidUntil: null }) },
    { id: "lapsed", term: term({ paidUntil: at(-2) }) },
    { id: "none" },
  ];
  assert.deepEqual(
    renewalNotices(sites, NOW).map((s) => s.id),
    ["due", "told-about-last-year"],
  );
});

test("renewalEmail says what ends when, what it costs, and where to act", () => {
  const mail = renewalEmail(
    { name: "Herald", domain: "herald.example", term: term({ paidUntil: at(12) }) },
    "https://citefleet.app/sites/site-1",
    NOW,
  );
  assert.equal(mail.subject, "CiteFleet: herald.example listing year ends in 12 days");
  assert.match(mail.text, /Herald \(herald.example\)/);
  assert.match(mail.text, /12 days left/);
  assert.match(mail.text, /\$10\.00 per host per year/);
  assert.match(mail.text, /https:\/\/citefleet\.app\/sites\/site-1/);
  // Nothing on BotCentral's side sends this; the text says so rather than implying otherwise.
  assert.match(mail.text, /CiteFleet does/);
});
