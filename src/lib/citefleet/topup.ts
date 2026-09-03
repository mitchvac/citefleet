/**
 * BotCentral API-key top-up — browser-safe half. No node: imports (routes and
 * components import this file; see client-bundle-guard.test.ts).
 *
 * BotCentral's Top up buttons land on citefleet.app with `prefix`, `jobs`/`usd`,
 * `asset`, and (for an existing invoice) `job=bj_…`. The browser opens or
 * re-reads the invoice straight against BotCentral's public /v1/jobs (CORS is
 * open there and its per-IP cap applies per customer). Settlement is the
 * operator-only server half in topup.server.ts.
 */
export const TOPUP_ASSETS = [
  { id: "rlusd", label: "RLUSD · XRP Ledger" },
  { id: "xrp", label: "XRP · XRP Ledger" },
  { id: "xlm", label: "XLM · Stellar" },
  { id: "btc", label: "BTC · Bitcoin" },
  { id: "hbar", label: "HBAR · Hedera" },
  { id: "xdc", label: "XDC · XDC Network" },
  { id: "cc", label: "CC · Canton Network" },
  { id: "eth", label: "ETH · Ethereum" },
] as const;

export type TopupAsset = (typeof TOPUP_ASSETS)[number]["id"];

export const MAX_JOBS = 10_000;
const PREFIX_RE = /^bc_live_[0-9a-f]{1,48}$/;
const INVOICE_RE = /^bj_[0-9a-f]{32}$/;

export type TopupSearch = {
  prefix: string;
  jobs: number;
  asset: TopupAsset;
  job: string;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/** A bc_live_ prefix, or "" when absent, malformed, or BotCentral's `bc_live_pending` placeholder. */
export function cleanPrefix(raw: unknown): string {
  const value = str(raw);
  if (!PREFIX_RE.test(value) || value === "bc_live_pending") return "";
  return value;
}

export function isInvoiceId(raw: unknown): boolean {
  return INVOICE_RE.test(str(raw));
}

/** Normalize the query BotCentral's top-up links carry. Never throws; hostile input degrades to defaults. */
export function parseTopupSearch(raw: Record<string, unknown>): TopupSearch {
  const jobsRaw = Number(str(raw.jobs));
  const usdRaw = Number(str(raw.usd));
  let jobs = Number.isFinite(jobsRaw) && jobsRaw >= 1 ? Math.floor(jobsRaw) : 0;
  if (!jobs && Number.isFinite(usdRaw) && usdRaw >= 1) jobs = Math.floor(usdRaw);
  jobs = Math.max(1, Math.min(jobs || 1, MAX_JOBS));
  const assetRaw = str(raw.asset).toLowerCase();
  const asset = TOPUP_ASSETS.some((a) => a.id === assetRaw) ? (assetRaw as TopupAsset) : "rlusd";
  return {
    prefix: cleanPrefix(raw.prefix),
    jobs,
    asset,
    job: isInvoiceId(raw.job) ? str(raw.job) : "",
  };
}

/** Where the browser talks to BotCentral. Build-time override for a local catalog; production is botcentral.org. */
export function botcentralBase(): string {
  const env = (import.meta.env?.VITE_BOTCENTRAL_URL as string | undefined)?.trim();
  return (env || "https://botcentral.org").replace(/\/+$/, "");
}

export type TopupInvoice = {
  id: string;
  status: "invoiced" | "paid" | "done" | "failed" | "expired";
  usd: string;
  jobs: number;
  asset: string;
  amount: string;
  rate_usd: string;
  expires: string;
  created: string;
  pay: {
    via: "citefleet" | "direct";
    /** How BotCentral identifies the payment; decides what the payer must send. */
    matching?: "destination_tag" | "memo" | "unique_amount";
    topup: string;
    network: string;
    network_name: string;
    ticker: string;
    amount: string;
    address: string | null;
    destination_tag?: number;
    memo?: string;
    issuer?: string;
    currency?: string;
  };
};

async function readProblem(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as {
    detail?: string;
    title?: string;
    error?: string;
  };
  return body.detail || body.error || body.title || `${fallback} (${res.status})`;
}

export async function openTopupInvoice(
  base: string,
  input: { asset: TopupAsset; jobs: number; prefix: string },
): Promise<TopupInvoice> {
  const res = await fetch(`${base}/v1/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      kind: "topup",
      asset: input.asset,
      jobs: input.jobs,
      prefix: input.prefix || undefined,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(await readProblem(res, "BotCentral could not open the invoice"));
  return (await res.json()) as TopupInvoice;
}

export async function fetchTopupInvoice(base: string, id: string): Promise<TopupInvoice> {
  if (!isInvoiceId(id)) throw new Error("That is not a BotCentral invoice id.");
  const res = await fetch(`${base}/v1/jobs/${encodeURIComponent(id)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) throw new Error("BotCentral has no invoice with that id.");
  if (!res.ok) throw new Error(await readProblem(res, "BotCentral could not read the invoice"));
  return (await res.json()) as TopupInvoice;
}

/** What the customer must do to pay this invoice, as plain lines. Honest about the missing treasury. */
export function payInstructions(invoice: TopupInvoice): string[] {
  const pay = invoice.pay;
  const lines = [
    `Send exactly ${pay.amount} ${pay.ticker} on ${pay.network_name} for $${invoice.usd} (${invoice.jobs} job${invoice.jobs === 1 ? "" : "s"}).`,
  ];
  if (pay.address) {
    lines.push(`Pay to ${pay.address}.`);
    if (typeof pay.destination_tag === "number")
      lines.push(
        `Destination tag ${pay.destination_tag} is required; a payment without it cannot be matched.`,
      );
    if (pay.memo)
      lines.push(`Memo ${pay.memo} is required; a payment without it cannot be matched.`);
    if (pay.issuer) lines.push(`Issuer ${pay.issuer} (${pay.currency ?? pay.ticker}).`);
  } else {
    lines.push(
      "BotCentral has no treasury address bound for this network yet, so there is nothing to pay on-chain from this page. Send the invoice id to the CiteFleet operator; they take payment out of band and confirm it below, and BotCentral credits the key prefix.",
    );
  }
  lines.push(`Quote expires ${invoice.expires}.`);
  return lines;
}

export type SettleRequest = { id: string; tx: string; prefix?: string };

/** Validate what the operator submits before it reaches BotCentral. Throws on anything malformed. */
export function settleRequestBody(input: {
  id?: unknown;
  tx?: unknown;
  prefix?: unknown;
}): SettleRequest {
  const id = str(input.id);
  if (!isInvoiceId(id)) throw new Error("Invoice id must look like bj_<32 hex>.");
  const tx = str(input.tx);
  if (tx.length < 4 || tx.length > 128)
    throw new Error("Enter the transaction hash or receipt reference (4–128 characters).");
  const prefix = cleanPrefix(input.prefix);
  return prefix ? { id, tx, prefix } : { id, tx };
}
