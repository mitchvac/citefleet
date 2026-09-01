import type {
  PlatformHealth,
  ProbeKind,
  ProbeRow,
  Site,
  SiteMonitor,
} from "./types";
import { lookupListing } from "./botcentral";
import { buildChecks } from "./reconcile";
import { ensureControl, isFrozen, pushJob } from "./control";
import { getStore, logActivity, mutateStore } from "./store";

const MARKETING = new Set([
  "/",
  "/premium",
  "/privacy",
  "/terms",
  "/cookies",
  "/guidelines",
  "/about",
  "/report",
  "/data",
]);

async function probe(
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  status: number | null;
  ms: number;
  text: string;
  contentType: string;
  error?: string;
}> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "CiteFleetMonitor/1.0 (+https://citefleet.app)",
        ...headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    return {
      status: res.status,
      ms: Date.now() - started,
      text,
      contentType: res.headers.get("content-type") || "",
    };
  } catch (error) {
    return {
      status: null,
      ms: Date.now() - started,
      text: "",
      contentType: "",
      error: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

function classify(status: number | null, text: string, contentType: string): ProbeKind {
  if (status === 402) return "payment402";
  if (!status) return "error";
  const jsonish = contentType.includes("json") || text.trim().startsWith("{");
  if (
    status === 404 ||
    (jsonish && /not[\s_-]*found|"status"\s*:\s*404/i.test(text))
  ) {
    return jsonish && status !== 404 ? "spa404" : "dead";
  }
  if (status >= 400) return "dead";
  return "ok";
}

async function probeSite(site: Site): Promise<Omit<SiteMonitor, "checks" | "blockedByKill" | "drift">> {
  const origin = site.url.replace(/\/$/, "");
  const routes = site.routes.length ? site.routes : ["/", "/privacy", "/terms"];
  const probes: ProbeRow[] = [];

  for (const path of routes.slice(0, 12)) {
    const url = `${origin}${path === "/" ? "/" : path}`;
    const bare = await probe(url);
    let kind = classify(bare.status, bare.text, bare.contentType);
    if (kind === "dead" && bare.status === 404) {
      const html = await probe(url, { Accept: "text/html" });
      if (html.status === 200 && html.contentType.includes("text/html")) kind = "spa404";
    }
    if (kind === "payment402" && MARKETING.has(path)) {
      probes.push({
        url,
        path,
        status: bare.status,
        ms: bare.ms,
        kind,
        contentType: bare.contentType,
        note: "402 on a marketing URL — crawlers will not pay. Do not 402 the public site.",
      });
    } else {
      probes.push({
        url,
        path,
        status: bare.status,
        ms: bare.ms,
        kind,
        contentType: bare.contentType,
        note: bare.error,
      });
    }
  }

  const smUrl = site.sitemapUrl || `${origin}/sitemap.xml`;
  const sm = await probe(smUrl);
  const sitemapBody = sm.text || "";
  const httpLeft = (sitemapBody.match(/http:\/\//g) || []).length;
  const sitemapUrlCount = (sitemapBody.match(/<loc>/g) || []).length;

  const wk = await probe(`${origin}/.well-known/botcentral.txt`);
  const llms = await probe(`${origin}/llms.txt`);
  const listing = await lookupListing(site.domain);

  return {
    siteId: site.id,
    name: site.name,
    domain: site.domain,
    url: origin,
    at: new Date().toISOString(),
    probes,
    catalogListed: listing.listed,
    catalogHref: listing.href,
    catalogError: listing.error,
    sitemapHttps: sm.status === 200 && httpLeft === 0,
    sitemapUrlCount,
    wellKnown: wk.status === 200 && wk.text.trim().length > 0,
    llms: llms.status === 200 && llms.text.trim().startsWith("#"),
  };
}

export async function probePlatform(): Promise<PlatformHealth> {
  const cf = await probe("https://citefleet.app/health");
  const bc = await probe("https://botcentral.org/health");
  const search = await probe("https://botcentral.org/v1/search?q=dating");
  return {
    at: new Date().toISOString(),
    citefleet: {
      ok: cf.status === 200 && /citefleet/.test(cf.text),
      status: cf.status,
      body: cf.text.slice(0, 160),
    },
    botcentral: {
      ok: bc.status === 200 && /botcentral/.test(bc.text),
      status: bc.status,
      body: bc.text.slice(0, 160),
    },
    catalogSearch: { ok: search.status === 200, status: search.status },
  };
}

export async function runMonitorCycle() {
  const before = await getStore();
  const platform = await probePlatform();
  const snapshots: Record<string, SiteMonitor> = {};

  for (const site of before.sites) {
    const raw = await probeSite(site);
    const frozen = isFrozen(before);
    const checks = buildChecks(site, raw, before, platform);
    const drift = checks.some((c) => !c.ok && c.severity !== "info");
    snapshots[site.id] = {
      ...raw,
      checks,
      drift,
      blockedByKill: frozen,
    };
  }

  await mutateStore((store) => {
    const control = ensureControl(store);
    control.lastMonitorAt = new Date().toISOString();
    control.lastReconcileAt = control.lastMonitorAt;
    control.lastCycleAt = control.lastMonitorAt;
    control.platform = platform;
    control.snapshots = snapshots;
    const failing = Object.values(snapshots).filter((s) => s.drift).length;
    pushJob(store, {
      kind: "cycle",
      ok: failing === 0 && platform.citefleet.ok && platform.botcentral.ok,
      summary: `Monitor+reconcile — ${Object.keys(snapshots).length} origins, ${failing} drifting, catalog search ${platform.catalogSearch.ok ? "ok" : "down"}.`,
    });
    logActivity(store, {
      actor: "Sentinel",
      kind: "monitor",
      message: `Control cycle: ${failing} origin(s) in drift. CiteFleet health ${platform.citefleet.ok ? "ok" : "DOWN"}. BotCentral ${platform.botcentral.ok ? "ok" : "DOWN"}.`,
    });
  });

  return (await getStore()).control;
}
