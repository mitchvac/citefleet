/**
 * What a payment QR should carry for one BotCentral invoice.
 *
 * The invoice's `pay.matching` decides what the payer must get right, and it is
 * the only thing that decides it:
 *
 *   destination_tag  the tag identifies the payment (XRP Ledger)
 *   memo             the memo identifies it (Stellar, Hedera, Canton). When the
 *                    treasury is an exchange deposit account the memo is what
 *                    credits the operator, so sending without it can strand the
 *                    funds — that warning is not decoration.
 *   unique_amount    the exact amount identifies it, and the chain carries no
 *                    memo at all (Bitcoin, Ethereum, XDC). BotCentral still puts
 *                    the job id in `memo` as its own reference; showing it to a
 *                    payer on those chains would be an instruction they cannot
 *                    follow, so it is ignored here.
 *
 * Only two networks have a payment-URI scheme wallets widely honour: Bitcoin
 * (BIP-21) and Ethereum (EIP-681), plus Stellar's SEP-0007. Elsewhere the QR
 * carries the plain address, which is what those wallets expect from a scan.
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

/** A decimal amount as an exact integer of the chain's smallest unit (wei, satoshi, …). */
export function toBaseUnits(amount: string, decimals: number): string {
  const [whole, frac = ""] = amount.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return String(BigInt((whole || "0") + padded));
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

  const matching =
    pay.matching ?? (typeof pay.destination_tag === "number" ? "destination_tag" : "memo");
  const amount = trimAmount(pay.amount);
  const base = {
    address,
    amount: pay.amount,
    ticker: pay.ticker,
    networkName: pay.network_name,
    issuer: pay.issuer,
  };

  // ---- matched by exact amount: no memo exists on these chains ----
  if (matching === "unique_amount") {
    const exact = {
      ...base,
      matchingLabel: "Exact amount",
      matchingValue: `${pay.amount} ${pay.ticker}`,
      warning: `Send this exact amount. It is what identifies your payment, so a different value cannot be matched to this invoice.`,
    };
    if (pay.network === "bitcoin") {
      return { ...exact, qr: `bitcoin:${address}?amount=${amount}`, isUri: true };
    }
    if (pay.network === "ethereum") {
      // EIP-681: the value rides in wei so the wallet prefills the amount.
      return {
        ...exact,
        qr: `ethereum:${address}?value=${toBaseUnits(pay.amount, 18)}`,
        isUri: true,
      };
    }
    // XDC and anything else EVM-shaped: the address alone.
    return { ...exact, qr: address, isUri: false };
  }

  // ---- matched by destination tag (XRP Ledger) ----
  if (matching === "destination_tag") {
    const tag = typeof pay.destination_tag === "number" ? String(pay.destination_tag) : "";
    return {
      ...base,
      qr: address,
      isUri: false,
      matchingLabel: tag ? "Destination tag" : "",
      matchingValue: tag,
      warning: tag
        ? `Scanning fills in the address only. Enter the destination tag ${tag} and the amount ${pay.amount} ${pay.ticker} yourself — a payment without the destination tag cannot be matched to this invoice.`
        : `Scanning fills in the address only. Enter the amount ${pay.amount} ${pay.ticker} yourself.`,
    };
  }

  // ---- matched by memo ----
  const memo = typeof pay.memo === "string" ? pay.memo.trim() : "";
  if (pay.network === "stellar") {
    // SEP-0007 carries destination, amount and memo, so nothing must be typed.
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
      warning: memo
        ? `The memo ${memo} is required and is included in this code. If you type the payment by hand instead, include it — a payment without it cannot be credited.`
        : "",
    };
  }
  return {
    ...base,
    qr: address,
    isUri: false,
    matchingLabel: memo ? "Memo" : "",
    matchingValue: memo,
    warning: memo
      ? `Scanning fills in the address only. Enter the memo ${memo} and the amount ${pay.amount} ${pay.ticker} yourself — a payment without the memo cannot be credited.`
      : `Scanning fills in the address only. Enter the amount ${pay.amount} ${pay.ticker} yourself.`,
  };
}
