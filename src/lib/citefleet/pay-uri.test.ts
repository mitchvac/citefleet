import assert from "node:assert/strict";
import { test } from "node:test";
import { payTarget, toBaseUnits } from "./pay-uri.ts";
import { TOPUP_ASSETS, type TopupInvoice } from "./topup.ts";

/** A BotCentral invoice with the `pay` block overridden. */
function invoice(pay: Partial<TopupInvoice["pay"]>): TopupInvoice {
  return {
    id: "bj_" + "0".repeat(32),
    status: "invoiced",
    usd: "1.00",
    jobs: 1,
    asset: "xrp",
    amount: "1.000000",
    rate_usd: "1",
    expires: "2026-09-03T12:58:00.066Z",
    created: "2026-09-03T12:43:00.066Z",
    pay: {
      via: "direct",
      topup: "https://citefleet.app/topup",
      network: "xrpl",
      network_name: "XRP Ledger",
      ticker: "XRP",
      amount: "1.000000",
      address: null,
      matching: "destination_tag",
      ...pay,
    },
  };
}

test("no treasury address bound → no payment target", () => {
  assert.equal(payTarget(invoice({ address: null })), null);
  assert.equal(payTarget(invoice({ address: "   " })), null);
  assert.ok(
    payTarget(invoice({ address: "rH9eQkvc43gC4pVrMUSbCnjypcxzVnirQK" })),
    "positive control",
  );
});

test("XRP Ledger: QR carries the address; the destination tag must be typed", () => {
  const t = payTarget(
    invoice({ address: "rH9eQkvc43gC4pVrMUSbCnjypcxzVnirQK", destination_tag: 2623752267 }),
  )!;
  assert.equal(t.qr, "rH9eQkvc43gC4pVrMUSbCnjypcxzVnirQK");
  assert.equal(t.isUri, false);
  assert.equal(t.matchingLabel, "Destination tag");
  assert.match(t.warning, /destination tag 2623752267/);
  assert.match(t.warning, /cannot be matched/);
});

test("RLUSD keeps the issuer so a trust line can be checked", () => {
  const t = payTarget(
    invoice({
      address: "rH9eQkvc43gC4pVrMUSbCnjypcxzVnirQK",
      ticker: "RLUSD",
      issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
      destination_tag: 7,
    }),
  )!;
  assert.equal(t.issuer, "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De");
});

test("Bitcoin: BIP-21 URI, exact-amount warning, and no memo shown", () => {
  const t = payTarget(
    invoice({
      network: "bitcoin",
      network_name: "Bitcoin",
      ticker: "BTC",
      amount: "0.00042000",
      address: "3FY1L4qH7aCRRjVEk9f4JczoNsmHS5Rkov",
      matching: "unique_amount",
      memo: "bj_deadbeef", // BotCentral's own reference; meaningless on Bitcoin
    }),
  )!;
  assert.equal(t.qr, "bitcoin:3FY1L4qH7aCRRjVEk9f4JczoNsmHS5Rkov?amount=0.00042");
  assert.equal(t.isUri, true);
  assert.equal(t.matchingLabel, "Exact amount");
  assert.equal(t.matchingValue, "0.00042000 BTC");
  assert.doesNotMatch(t.warning, /memo/i, "a memo instruction on Bitcoin is unfollowable");
  assert.notEqual(t.matchingValue, "bj_deadbeef");
});

test("Ethereum: EIP-681 URI carries the value in wei", () => {
  const t = payTarget(
    invoice({
      network: "ethereum",
      network_name: "Ethereum",
      ticker: "ETH",
      amount: "0.000412160379847011",
      address: "0xf7D9618FC3C9A36337bE9B2e51487ec24eF09E6B",
      matching: "unique_amount",
      memo: "bj_deadbeef",
    }),
  )!;
  assert.equal(t.qr, "ethereum:0xf7D9618FC3C9A36337bE9B2e51487ec24eF09E6B?value=412160379847011");
  assert.equal(t.isUri, true);
  assert.doesNotMatch(t.warning, /memo/i);
});

test("XDC: amount-matched with no URI scheme, so the QR is the address", () => {
  const t = payTarget(
    invoice({
      network: "xdc",
      network_name: "XDC Network",
      ticker: "XDC",
      amount: "36.153331",
      address: "xdc1b87bc5003759cf477f05a0378fc8bc708f7de40",
      matching: "unique_amount",
      memo: "bj_deadbeef",
    }),
  )!;
  assert.equal(t.qr, "xdc1b87bc5003759cf477f05a0378fc8bc708f7de40");
  assert.equal(t.isUri, false);
  assert.match(t.warning, /exact amount/i);
  assert.doesNotMatch(t.warning, /memo/i);
});

test("Stellar: SEP-0007 carries the operator's fixed memo", () => {
  const t = payTarget(
    invoice({
      network: "stellar",
      network_name: "Stellar",
      ticker: "XLM",
      amount: "5.6818182",
      address: "GC7WKJQQJBKKBFP5YVRWW4KJSNCCLV3DDYOZZ5TLDLEGNSQGXSORJZQG",
      matching: "memo",
      memo: "234305006",
    }),
  )!;
  assert.ok(t.qr.startsWith("web+stellar:pay?"), t.qr);
  const params = new URLSearchParams(t.qr.slice("web+stellar:pay?".length));
  assert.equal(
    params.get("destination"),
    "GC7WKJQQJBKKBFP5YVRWW4KJSNCCLV3DDYOZZ5TLDLEGNSQGXSORJZQG",
  );
  assert.equal(params.get("amount"), "5.6818182");
  assert.equal(params.get("memo"), "234305006");
  assert.match(t.warning, /memo 234305006 is required/);
});

test("Hedera and Canton: address-only QR, memo called out as required", () => {
  const hbar = payTarget(
    invoice({
      network: "hedera",
      network_name: "Hedera",
      ticker: "HBAR",
      amount: "13.44411283",
      address: "0.0.6942669",
      matching: "memo",
      memo: "2337356342",
    }),
  )!;
  assert.equal(hbar.qr, "0.0.6942669");
  assert.equal(hbar.matchingValue, "2337356342");
  assert.match(hbar.warning, /cannot be credited/);

  const cc = payTarget(
    invoice({
      network: "canton",
      network_name: "Canton Network",
      ticker: "CC",
      amount: "9.1227558021",
      address: "party::122089d2680447a14a15e38969368f11c52a9ad7a16e41601e1c828fa74c00b89a6d",
      matching: "memo",
      memo: "2341540831",
    }),
  )!;
  assert.equal(
    cc.qr,
    "party::122089d2680447a14a15e38969368f11c52a9ad7a16e41601e1c828fa74c00b89a6d",
  );
  assert.equal(cc.matchingValue, "2341540831");
});

test("toBaseUnits converts exactly, without floating point", () => {
  assert.equal(toBaseUnits("1", 18), "1000000000000000000");
  assert.equal(toBaseUnits("0.000412160379847011", 18), "412160379847011");
  assert.equal(toBaseUnits("0.1", 8), "10000000");
  // A value that a float would mangle.
  assert.equal(toBaseUnits("0.000000000000000001", 18), "1");
});

test("the picker offers every rail BotCentral prices, including the new ones", () => {
  const ids = TOPUP_ASSETS.map((a) => a.id);
  assert.deepEqual(ids, ["rlusd", "xrp", "xlm", "btc", "hbar", "xdc", "cc", "eth"]);
});
