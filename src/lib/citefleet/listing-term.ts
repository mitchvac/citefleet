/**
 * The BotCentral listing year, as CiteFleet sees it. Browser-safe: no node:
 * imports (components render from it; see client-bundle-guard.test.ts).
 *
 * BotCentral bills the way a domain registry does (their brief, 2026-09-06):
 * a fixed fee per host per year, charged to the customer's `bc_live_` key when
 * a PROVEN card is written, edits inside the year free, reads free, and a
 * listing nobody renews lapses — it stays in the catalog, marked unverified,
 * until a publish with a funded key renews it.
 *
 * The public card carries no `paid_until`, so the term reaches CiteFleet only
 * two ways: the `term` block on a publish response, and the `site.lapsed`
 * webhook. Both are read here; nothing infers a term from a catalog read.
 */

export type TermStatus = "active" | "lapsed" | "unbilled";

export interface ListingTerm {
  status: TermStatus;
  /** End of the current term (ISO), or null when billing has not started for the host. */
  paidUntil: string | null;
  /** What a year costs, as BotCentral quoted it ("10.00"). */
  usd: string;
  termDays: number;
}

/** BotCentral's 402 reasons, plus "unspecified" for a 402 that named none. */
export type PaymentReason = "unknown" | "revoked" | "insufficient" | "lapsed" | "unspecified";

export interface PaymentRequired {
  reason: PaymentReason;
  usd: string;
  termDays: number;
  /** Where the customer funds the key. Names the key when one was presented. */
  topup: string;
  /** BotCentral's own sentence. */
  message: string;
}

/** Warn this many days before a listing year ends — the registrar's renewal email. */
export const RENEWAL_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const REASONS = new Set<PaymentReason>(["unknown", "revoked", "insufficient", "lapsed"]);

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function usdText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  return "";
}

/**
 * The `term` block of a publish response or a `site.lapsed` webhook. Undefined
 * when absent or malformed — production BotCentral still runs the interim code
 * that sends no term at all, and that must not read as a lapse.
 */
export function readTerm(raw: unknown): ListingTerm | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const status = r.status;
  if (status !== "active" && status !== "lapsed" && status !== "unbilled") return undefined;
  const termDays =
    typeof r.term_days === "number" && Number.isFinite(r.term_days) && r.term_days > 0
      ? Math.floor(r.term_days)
      : 365;
  return { status, paidUntil: isoOrNull(r.paid_until), usd: usdText(r.usd), termDays };
}

/** The body of a 402 from POST /internal/publish. */
export function readPayment(raw: unknown, fallbackTopup: string): PaymentRequired {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const reason = REASONS.has(r.reason as PaymentReason) ? (r.reason as PaymentReason) : "unspecified";
  const topup =
    typeof r.topup === "string" && /^https:\/\//.test(r.topup) ? r.topup : fallbackTopup;
  const termDays =
    typeof r.term_days === "number" && Number.isFinite(r.term_days) && r.term_days > 0
      ? Math.floor(r.term_days)
      : 365;
  return {
    reason,
    usd: usdText(r.usd),
    termDays,
    topup,
    message:
      typeof r.error === "string" && r.error.trim()
        ? r.error.trim()
        : "BotCentral needs a funded API key before it lists this host",
  };
}

/** Whole days until the term ends (negative once past), or null without a date. */
export function termDaysLeft(term: ListingTerm | undefined, nowMs = Date.now()): number | null {
  if (!term?.paidUntil) return null;
  const end = Date.parse(term.paidUntil);
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - nowMs) / DAY_MS);
}

export type RenewalState = "none" | "unbilled" | "active" | "due" | "lapsed";

/**
 * Where a host stands. Time decides, not the stored status: a term written as
 * "active" a year ago is lapsed today whether or not the webhook arrived.
 */
export function renewalState(term: ListingTerm | undefined, nowMs = Date.now()): RenewalState {
  if (!term) return "none";
  // BotCentral said lapsed: that stands even if its date did not parse.
  if (term.status === "lapsed") return "lapsed";
  if (term.status === "unbilled" || !term.paidUntil) return "unbilled";
  const left = termDaysLeft(term, nowMs);
  if (left === null) return "unbilled";
  if (left <= 0) return "lapsed";
  return left <= RENEWAL_WINDOW_DAYS ? "due" : "active";
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "an unknown date";
}

/** The one sentence the campaign page, the reconcile check and the reminder email share. */
export function describeTerm(term: ListingTerm | undefined, nowMs = Date.now()): string {
  const state = renewalState(term, nowMs);
  const left = termDaysLeft(term, nowMs);
  switch (state) {
    case "none":
      return "";
    case "unbilled":
      return "Not on a paid listing year yet — billing starts on the first publish sent with an API key.";
    case "active":
      return `Listing year ends ${day(term!.paidUntil)} (${left} days). Edits until then are free.`;
    case "due":
      return `Listing year ends ${day(term!.paidUntil)} — ${left} day${left === 1 ? "" : "s"} left. Renew: top up the key, then List on BotCentral.`;
    case "lapsed":
      return `Listing year ended ${day(term!.paidUntil)}. The card is listed but no longer proven until it is renewed: top up the key, then List on BotCentral.`;
  }
}

/**
 * Which sites need a renewal notice this cycle: inside the window and not yet
 * told about THIS term end. A renewed year has a new `paidUntil`, so the stamp
 * naturally resets.
 */
export function renewalNotices<T extends { term?: ListingTerm; renewalNoticeFor?: string }>(
  sites: T[],
  nowMs = Date.now(),
): T[] {
  return sites.filter(
    (s) =>
      renewalState(s.term, nowMs) === "due" &&
      Boolean(s.term?.paidUntil) &&
      s.renewalNoticeFor !== s.term!.paidUntil,
  );
}

export function renewalEmail(
  site: { name: string; domain: string; term?: ListingTerm },
  campaignUrl: string,
  nowMs = Date.now(),
): { subject: string; text: string } {
  const left = termDaysLeft(site.term, nowMs) ?? 0;
  return {
    subject: `CiteFleet: ${site.domain} listing year ends in ${left} day${left === 1 ? "" : "s"}`,
    text: [
      `${site.name} (${site.domain})`,
      "",
      describeTerm(site.term, nowMs),
      "",
      `BotCentral charges $${site.term?.usd || "10.00"} per host per year, debited from the customer's API key when the proven card is republished. Nothing on BotCentral's side sends this reminder; CiteFleet does.`,
      "",
      `Campaign: ${campaignUrl}`,
    ].join("\n"),
  };
}
