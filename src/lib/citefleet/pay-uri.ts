/**
 * What a payment QR should carry for one BotCentral invoice.
 *
 * Only two networks have a payment-URI scheme wallets widely honour: Bitcoin
 * (BIP-21) and Stellar (SEP-0007). For the XRP Ledger, Hedera and XDC there is
 * no such scheme, so the QR carries the plain address — which is what those
 * wallets expect from a scan — and the amount plus the matching field are shown
 * beside it for the payer to enter.
 *
 * The matching field is the point of failure worth shouting about: BotCentral
 * identifies a payment by destination tag, memo, or an exact amount
 * (`pay.matching`). A transfer that omits it can land on the treasury without
 * being creditable, so `warning` is non-empty whenever the QR itself cannot
 * carry that field.
 *
 * Browser-safe: no node: imports (the top-up route renders this).
 */
import type { TopupInvoice } from "./topup";

export interface PayTarget {
  /** The exact string encoded in the QR: a payment URI, or the bare address. */
  qr: string;
  /** True when `qr` is a URI a wallet can parse rather than only an address. */
  isUri: boolean;
  address: string;
  amount: string;
  ticker: string;
  networkName: string;
  /** Destination tag / memo the payment must carry, if any. */
  matchingLabel: string;
  matchingValue: string;
  /** Non-empty when the payer must type something the QR cannot carry. */
  warning: string;
  /** Issued-asset trust line the payer needs (RLUSD and similar). */
  issuer?: string;
}

function trimAmount(amount: string): string {
  // BIP-21 rejects trailing noise; keep the number, drop trailing zeros.
  if (!/^\d+(\.\d+)?$/.test(amount)) return amount;
  return amount.includes(".") ? amount.replace(/0+$/, "").replace(/\.$/, "") : amount;
}

/**
 * The payment target for an invoice, or null when BotCentral bound no address
 * (`pay.address === null`), in which case there is nothing to pay on-chain and
 * the page says so instead of showing a QR.
 */
export function payTarget(invoice: TopupInvoice): PayTarget | null {
  const pay = invoice.pay;
  const address = typeof pay.address === "string" ? pay.address.trim() : "";
  if (!address) return null;

  const tag = typeof pay.destination_tag === "number" ? String(pay.destination_tag) : "";
  const memo = typeof pay.memo === "string" ? pay.memo.trim() : "";
  const amount = trimAmount(pay.amount);
  const base = {
    address,
    amount: pay.amount,
    ticker: pay.ticker,
    networkName: pay.network_name,
    issuer: pay.issuer,
  };

  if (pay.network === "bitcoin") {
    // BIP-21. Bitcoin is matched on the exact amount, which the URI carries.
    return {
      ...base,
      qr: `bitcoin:${address}?amount=${amount}`,
      isUri: true,
      matchingLabel: "Exact amount",
      matchingValue: `${pay.amount} ${pay.ticker}`,
      warning: "Send this exact amount. BotCentral matches the payment by amount, so a different value cannot be credited automatically.",
    };
  }

  if (pay.network === "stellar") {
    // SEP-0007. The memo rides along, so nothing has to be typed by hand.
    const params = new URLSearchParams({ destination: address, amount });
    if (memo) {
      params.set("memo", memo);
      params.set("memo_type", "MEMO_TEXT");
    }
    return {
      ...base,
      qr: `web+stellar:pay?${params.toString()}`,
      isUri: true,
      matchingLabel: memo ? "Memo" : "",
      matchingValue: memo,
      warning: memo ? "" : "",
    };
  }

  // XRP Ledger, Hedera, XDC: the QR is the address alone.
  const matchingLabel = tag ? "Destination tag" : memo ? "Memo" : "";
  const matchingValue = tag || memo;
  return {
    ...base,
    qr: address,
    isUri: false,
    matchingLabel,
    matchingValue,
    warning: matchingValue
      ? `Scanning fills in the address only. Enter the ${matchingLabel.toLowerCase()} ${matchingValue} and the amount ${pay.amount} ${pay.ticker} yourself — a payment without the ${matchingLabel.toLowerCase()} cannot be matched to this invoice.`
      : `Scanning fills in the address only. Enter the amount ${pay.amount} ${pay.ticker} yourself.`,
  };
}
