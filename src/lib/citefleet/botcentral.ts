import type { Site, StoreShape, TaskStatus } from "./types";
import { PLAYBOOK, applyPlaybookHrefs, playbookToTaskDraft } from "./playbook.ts";
import { getStore, logActivity, mutateStore, recalcScores } from "./store.ts";
import { stripSecrets } from "./github.ts";
import { siteVerifyToken } from "./verify-token.ts";
import { readPayment, readTerm, type ListingTerm, type PaymentRequired } from "./listing-term.ts";
import { cleanPrefix } from "./topup.ts";

const DEFAULT_URL = "https://botcentral.org";
const FETCH_UA = "CiteFleetPublisher/1.0 (+https://citefleet.app)";

export type ListingStatus = {
  listed: boolean;
  /** See Site["botcentral"].verified — `undefined` is "unknown", never "unproven". */
  verified?: boolean;
  verificationMethod?: string;
  verificationNote?: string;
  /** BotCentral's crawl-priority score for the home page, and its components. */
  quality?: number;
  rank?: Record<string, number>;
  href?: string;
  api?: string;
  updated?: string;
  summary?: string;
  error?: string;
  card?: Record<string, unknown>;
  /** The host's paid term after a publish (absent from catalog reads and from the interim BotCentral code). */
  term?: ListingTerm;
  /** Whether this publish bought a year. False for an edit inside the term and for an unbilled write. */
  billed?: boolean;
  /** Set when BotCentral answered 402: the card was fine, the key could not pay. */
  payment?: PaymentRequired;
};

function catalogUrl() {
  return (process.env.BOTCENTRAL_URL || DEFAULT_URL).replace(/\/$/, "");
}

function serviceToken() {
  return process.env.BOTCENTRAL_SERVICE_TOKEN?.trim() || "";
}

export function publisherReady() {
  return serviceToken().length >= 16;
}

/**
 * The one switch that starts billing. Off by default: BotCentral's brief
 * (2026-09-06) is explicit that a key prefix must not be sent until a key has
 * been funded end to end, because every publish with an unfunded key is a 402.
 * Set CITEFLEET_BOTCENTRAL_BILLING=on (deploy-vps.sh reads
 * /root/citefleet-billing.on) once ten dollars has travelled the top-up path.
 */
export const BILLING_ENV = "CITEFLEET_BOTCENTRAL_BILLING";

export function billingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[BILLING_ENV] || "").trim().toLowerCase() === "on";
}

/** The prefix a publish of this site would carry, or "" — the only place the switch is consulted. */
export function billingPrefixFor(
  site: Pick<Site, "billing">,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!billingEnabled(env)) return "";
  return cleanPrefix(site.billing?.keyPrefix);
}

function publicOrigin() {
  return (process.env.CITEFLEET_PUBLIC_URL || "https://citefleet.app").replace(/\/$/, "");
}

/**
 * Read the card's proof state. BotCentral revalidates every listed origin on a
 * 6-hour cycle and reports `method: "unverified"` once an origin stops serving
 * its proof — the card stays listed and is simply no longer proven. A card that
 * carries no `verification` block at all is UNKNOWN, not unproven: returning
 * `undefined` there keeps a shape change on BotCentral's side from silently
 * revoking every listing here.
 */
function cardVerification(card: Record<string, unknown>) {
  const block = card.verification;
  if (!block || typeof block !== "object") {
    return { verified: undefined, verificationMethod: undefined };
  }
  const { method: raw, note } = block as { method?: unknown; note?: unknown };
  const method = typeof raw === "string" ? raw : undefined;
  const verificationNote = typeof note === "string" ? note : undefined;
  if (!method) {
    return { verified: undefined, verificationMethod: undefined, verificationNote };
  }
  return { verified: method !== "unverified", verificationMethod: method, verificationNote };
}

/**
 * BotCentral's own score for this origin, read off the card CiteFleet already
 * fetches — no extra request, which matters because /v1/site, /v1/score,
 * /v1/search and /v1/changes all draw on ONE 30/min IP-keyed bucket shared by
 * the whole install (measured 2026-09-05).
 *
 * The card carries no top-level score; the home page entry does. Match on
 * `rel: "home"` rather than trusting position, and fall back to the first page.
 */
function cardQuality(card: Record<string, unknown>) {
  const pages = Array.isArray(card.pages)
    ? (card.pages as Array<Record<string, unknown>>)
    : [];
  const home = pages.find((p) => p.rel === "home") ?? pages[0];
  if (!home) return { quality: undefined, rank: undefined };
  const quality = typeof home.score === "number" ? home.score : undefined;
  const raw = home.rank;
  if (!raw || typeof raw !== "object") return { quality, rank: undefined };
  const rank: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number") rank[key] = value;
  }
  return { quality, rank: Object.keys(rank).length ? rank : undefined };
}

function listingFromCard(host: string, card: Record<string, unknown>): ListingStatus {
  return {
    listed: true,
    ...cardVerification(card),
    ...cardQuality(card),
    href: `${catalogUrl()}/site/${host}`,
    api: `${catalogUrl()}/v1/site/${host}`,
    updated: typeof card.updated === "string" ? card.updated : undefined,
    summary: typeof card.summary === "string" ? card.summary : undefined,
    card,
  };
}

export async function lookupListing(domain: string): Promise<ListingStatus> {
  const host = domain.replace(/^www\./, "").toLowerCase();
  try {
    const res = await fetch(`${catalogUrl()}/v1/site/${encodeURIComponent(host)}`, {
      headers: { "User-Agent": FETCH_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { listed: false };
    if (!res.ok) return { listed: false, error: `catalog ${res.status}` };
    const card = (await res.json()) as Record<string, unknown>;
    return listingFromCard(host, card);
  } catch (err) {
    return {
      listed: false,
      error: err instanceof Error ? err.message : "catalog unreachable",
    };
  }
}

/**
 * Whether a live catalog read should grant, revoke, or leave alone the
 * `botcentral_list` task. Pure so the rule can be tested without a store.
 *
 * The asymmetry is deliberate:
 *  - GRANT needs the card to be listed AND not affirmatively unproven.
 *  - REVOKE needs an ANSWER. `error` means the catalog was unreachable, which is
 *    evidence of nothing; a transient outage must never un-list a customer.
 *  - `verified === undefined` (a card with no verification block at all) is
 *    UNKNOWN, not unproven, so it never revokes on its own. Only BotCentral
 *    saying `method: "unverified"` does.
 */
export type ListingTransition = "grant" | "revoke" | "none";

export function listingTransition(
  listing: ListingStatus,
  taskStatus: TaskStatus,
): ListingTransition {
  const proven = listing.listed && listing.verified !== false;
  if (proven) return taskStatus === "done" ? "none" : "grant";
  if (listing.error) return "none";
  return taskStatus === "done" ? "revoke" : "none";
}

function defaultTopics(site: Site): string[] {
  const words = `${site.name} ${site.summary}`
    .toLowerCase()
    .split(/[^a-z0-9+-]+/)
    .filter((w) => w.length > 3)
    .slice(0, 4);
  return words.length ? words : ["indexed-by-citefleet"];
}

export function buildCard(site: Site, existing?: Record<string, unknown>) {
  const origin = site.url.replace(/\/$/, "");
  const domain = site.domain.replace(/^www\./, "").toLowerCase();
  const existingTopics = Array.isArray(existing?.topics)
    ? (existing.topics as string[])
    : [];
  const existingPages = Array.isArray(existing?.pages)
    ? (existing.pages as Array<{ url: string; rel: string; title?: string; summary?: string }>)
    : [];
  const existingAllow = Array.isArray(existing?.allow)
    ? (existing.allow as string[])
    : [];
  return {
    domain,
    canonical:
      (typeof existing?.canonical === "string" && existing.canonical) || `${origin}/`,
    name: (typeof existing?.name === "string" && existing.name) || site.name,
    summary:
      (typeof existing?.summary === "string" && existing.summary) ||
      site.summary ||
      `${site.name} — public site submitted by CiteFleet.`,
    topics: existingTopics.length ? existingTopics : defaultTopics(site),
    allow_bots: existing?.allow_bots !== false,
    allow: existingAllow.length
      ? existingAllow
      : ["GPTBot", "PerplexityBot", "Google-Extended", "Bingbot", "OAI-SearchBot"],
    deny: Array.isArray(existing?.deny) ? (existing.deny as string[]) : [],
    pointers: {
      robots: `${origin}/robots.txt`,
      sitemap: site.sitemapUrl || `${origin}/sitemap.xml`,
      llms: `${origin}/llms.txt`,
    },
    pages: existingPages.length
      ? existingPages
      : [
          {
            url: `${origin}/`,
            rel: "home",
            title: site.name,
            summary: site.summary,
          },
          ...site.routes
            .filter((route) => route !== "/")
            .slice(0, 12)
            .map((route) => ({
              url: `${origin}${route}`,
              rel: "page" as const,
              title: route,
            })),
        ],
    // Must equal the botcentral-verify line in the origin pack (verify-token.ts).
    verifyToken: siteVerifyToken(site),
  };
}

export async function publishListing(site: Site): Promise<ListingStatus> {
  if (!publisherReady()) {
    return {
      listed: false,
      error: "BOTCENTRAL_SERVICE_TOKEN missing on CiteFleet",
    };
  }
  const current = await lookupListing(site.domain);
  // The prefix rides beside the card, not in it: who pays is a billing fact,
  // not part of what the card declares (BotCentral src/routes/internal/publish.ts).
  const keyPrefix = billingPrefixFor(site);
  try {
    const res = await fetch(`${catalogUrl()}/internal/publish`, {
      method: "POST",
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceToken()}`,
      },
      body: JSON.stringify({ ...buildCard(site, current.card), ...(keyPrefix ? { keyPrefix } : {}) }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      card?: Record<string, unknown>;
      term?: unknown;
      billed?: unknown;
    };
    if (res.status === 402) {
      // The card is fine; the key cannot pay for it. The customer's next move
      // is to fund the key, so the top-up link is the answer, not the card.
      const fallback = `${publicOrigin()}/topup?${keyPrefix ? `prefix=${encodeURIComponent(keyPrefix)}&` : ""}product=botcentral`;
      const payment = readPayment(payload, fallback);
      return { listed: false, error: payment.message, payment };
    }
    if (!res.ok) {
      return {
        listed: false,
        error: payload.error || `publish ${res.status}`,
      };
    }
    const host = site.domain.replace(/^www\./, "").toLowerCase();
    return {
      ...listingFromCard(host, payload.card ?? { domain: host }),
      term: readTerm(payload.term),
      billed: payload.billed === true,
    };
  } catch (err) {
    return {
      listed: false,
      error: err instanceof Error ? err.message : "catalog unreachable",
    };
  }
}

/**
 * Apply one catalog answer to a site: create the `botcentral_list` task if the
 * site predates it, then grant or revoke it per `listingTransition`. Shared by
 * `hydrateListings` (a public card read) and the signed BotCentral webhook
 * (site.listed / site.reverified / site.lapsed / site.unpublished), so both
 * paths move the task by exactly the same rule.
 */
export function applyCatalogState(
  store: StoreShape,
  site: Site,
  listing: ListingStatus,
  opts: { now?: string } = {},
): ListingTransition {
  let task = store.tasks.find(
    (t) => t.siteId === site.id && t.playbookId === "botcentral_list",
  );
  if (!task) {
    const step = PLAYBOOK.find((s) => s.id === "botcentral_list");
    if (step) {
      const draft = playbookToTaskDraft(site.id, step);
      task = {
        ...draft,
        id: `task-${site.id}-botcentral_list`,
        updatedAt: new Date().toISOString(),
      };
      store.tasks.push(task);
    }
  }
  // This task's state is derived from the live card, in BOTH directions.
  // Granting only (the old behaviour) let a listing rot on BotCentral's side
  // — it revalidates origins every 6 hours and does not auto-unpublish, so a
  // downgraded site stays listed and merely stops being proven — while
  // CiteFleet went on scoring it as a completed submission forever.
  //
  // Revoking requires an ANSWER, not a silence: `error` means the catalog was
  // unreachable, which is not evidence of anything. Fail slowly — a transient
  // outage must never un-list a customer.
  const now = opts.now ?? new Date().toISOString();
  const move = task ? listingTransition(listing, task.status) : "none";
  if (task && move === "grant") {
    task.status = "done";
    task.completedAt = listing.updated || now;
    task.blockedReason = undefined;
    task.updatedAt = now;
    task.checklist = task.checklist.map((c) => ({ ...c, done: true }));
    task.evidence.unshift({
      id: crypto.randomUUID(),
      at: now,
      kind: "http",
      label: "Live on BotCentral",
      detail: listing.href,
      url: listing.href,
      ok: true,
    });
    recalcScores(store, site.id);
  } else if (task && move === "revoke") {
    // BotCentral's own note names the exact remediation ("Add DNS TXT
    // botcentral-verify=<token> or a plain-text /.well-known/botcentral.txt")
    // and is more specific than anything phrased from this side.
    const reason = listing.listed
      ? `Listed on BotCentral but no longer proven (${listing.verificationMethod ?? "unverified"}). ${listing.verificationNote ?? "Re-serve the proof token at the origin, then List on BotCentral."}`
      : "The BotCentral card for this domain is gone from the catalog.";
    task.status = "blocked";
    task.blockedReason = reason;
    task.completedAt = undefined;
    task.updatedAt = now;
    task.checklist = task.checklist.map((c) => ({ ...c, done: false }));
    task.evidence.unshift({
      id: crypto.randomUUID(),
      at: now,
      kind: "http",
      label: listing.listed
        ? "BotCentral listing unproven"
        : "BotCentral listing gone",
      detail: reason,
      url: listing.href,
      ok: false,
    });
    logActivity(store, {
      actor: "botcentral",
      kind: "monitor",
      message: `${site.domain}: ${reason}`,
      siteId: site.id,
      taskId: task.id,
    });
    recalcScores(store, site.id);
  }
  return move;
}

export async function hydrateListings(_store?: StoreShape): Promise<StoreShape> {
  const snapshot = await getStore();
  const updates = await Promise.all(
    snapshot.sites.map(async (site) => ({
      id: site.id,
      listing: await lookupListing(site.domain),
    })),
  );
  await mutateStore((store) => {
    for (const update of updates) {
      const site = store.sites.find((s) => s.id === update.id);
      if (site && update.listing.error && !update.listing.listed && site.botcentral?.listed) {
        site.botcentral = { ...site.botcentral, error: update.listing.error };
        continue;
      }
      if (!site) continue;
      site.botcentral = update.listing;
      applyCatalogState(store, site, update.listing, { now: new Date().toISOString() });
    }
    applyPlaybookHrefs(store.tasks, store.sites);
  });
  return stripSecrets(await getStore());
}
