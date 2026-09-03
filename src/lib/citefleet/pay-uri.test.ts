import assert from "node:assert/strict";
import { test } from "node:test";
import { payTarget } from "./pay-uri.ts";
import type { TopupInvoice } from "./topup.ts";

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
      ...pay,
    },
  };
}

test("no treasury address bound → no payment target (this is production today)", () => {
  assert.equal(payTarget(invoice({ address: null })), null);
  assert.equal(payTarget(invoice({ address: "   " })), null);
  // Positive control: the same invoice with an address does produce one.
  assert.ok(payTarget(invoice({ address: "rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd" })));
});

test("XRP Ledger: QR carries the address; the destination tag must be typed", () => {
  const t = payTarget(invoice({ address: "rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd", destination_tag: 2623752267 }))!;
  assert.equal(t.qr, "rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd");
  assert.equal(t.isUri, false);
  assert.equal(t.matchingLabel, "Destination tag");
  assert.equal(t.matchingValue, "2623752267");
  assert.match(t.warning, /destination tag 2623752267/);
  assert.match(t.warning, /cannot be matched/);
});

test("RLUSD on the XRP Ledger keeps the issuer so a trust line can be checked", () => {
  const t = payTarget(
    invoice({
      address: "rP9jPyP5kyvFRb6ZiRghAGw5u8SGAmU4bd",
      ticker: "RLUSD",
      currency: "RLUSD",
      issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
      destination_tag: 7,
    }),
  )!;
  assert.equal(t.issuer, "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De");
  assert.equal(t.ticker, "RLUSD");
});

test("Bitcoin: BIP-21 URI with the exact amount, trailing zeros trimmed", () => {
  const t = payTarget(
    invoice({
      network: "bitcoin",
      network_name: "Bitcoin",
      ticker: "BTC",
      amount: "0.00042000",
      address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    }),
  )!;
  assert.equal(t.qr, "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.00042");
  assert.equal(t.isUri, true);
  assert.equal(t.amount, "0.00042000", "the displayed amount stays exactly as BotCentral quoted it");
  assert.match(t.warning, /exact amount/i);
});

test("Stellar: SEP-0007 URI carries destination, amount and memo", () => {
  const t = payTarget(
    invoice({
      network: "stellar",
      network_name: "Stellar",
      ticker: "XLM",
      amount: "3.5000000",
      address: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      memo: "bj-7",
    }),
  )!;
  assert.equal(t.isUri, true);
  assert.ok(t.qr.startsWith("web+stellar:pay?"), t.qr);
  const params = new URLSearchParams(t.qr.slice("web+stellar:pay?".length));
  assert.equal(params.get("destination"), "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN");
  assert.equal(params.get("amount"), "3.5");
  assert.equal(params.get("memo"), "bj-7");
  assert.equal(params.get("memo_type"), "MEMO_TEXT");
  assert.equal(t.warning, "", "the URI carries the memo, so nothing must be typed");
});

test("memo-matched networks without a URI scheme warn about the memo", () => {
  const t = payTarget(
    invoice({ network: "hedera", network_name: "Hedera", ticker: "HBAR", address: "0.0.123456", memo: "bj-9" }),
  )!;
  assert.equal(t.qr, "0.0.123456");
  assert.equal(t.matchingLabel, "Memo");
  assert.match(t.warning, /memo bj-9/);
});
