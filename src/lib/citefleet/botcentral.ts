import type { Site, StoreShape } from "./types";
import { PLAYBOOK, playbookToTaskDraft } from "./playbook";
import { getStore, mutateStore, recalcScores } from "./store";
import { stripSecrets } from "./github";

const DEFAULT_URL = "https://botcentral.org";
const FETCH_UA = "CiteFleetPublisher/1.0 (+https://citefleet.app)";

export type ListingStatus = {
  listed: boolean;
  href?: string;
  api?: string;
  updated?: string;
  summary?: string;
  error?: string;
  card?: Record<string, unknown>;
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

function listingFromCard(host: string, card: Record<string, unknown>): ListingStatus {
  return {
    listed: true,
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

function defaultTopics(site: Site): string[] {
  if (site.domain.replace(/^www\./, "") === "resonanse.app") {
    return ["dating", "wallet", "Date-Coin"];
  }
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
    verifyToken: site.id,
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
  const res = await fetch(`${catalogUrl()}/internal/publish`, {
    method: "POST",
    headers: {
      "User-Agent": FETCH_UA,
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceToken()}`,
    },
    body: JSON.stringify(buildCard(site, current.card)),
    signal: AbortSignal.timeout(20000),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    card?: Record<string, unknown>;
  };
  if (!res.ok) {
    return {
      listed: false,
      error: payload.error || `publish ${res.status}`,
    };
  }
  const host = site.domain.replace(/^www\./, "").toLowerCase();
  return listingFromCard(host, payload.card ?? { domain: host });
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
      if (!site) continue;
      site.botcentral = update.listing;
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
      if (task && update.listing.listed && task.status !== "done") {
        task.status = "done";
        task.completedAt = update.listing.updated || new Date().toISOString();
        task.checklist = task.checklist.map((c) => ({ ...c, done: true }));
        task.evidence.unshift({
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          kind: "http",
          label: "Live on BotCentral",
          detail: update.listing.href,
          url: update.listing.href,
          ok: true,
        });
        recalcScores(store, site.id);
      }
    }
  });
  return stripSecrets(await getStore());
}
