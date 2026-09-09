// Browser-safe. Where a property's real public routes come from.
//
// Why this exists: `site.routes` had exactly one writer — `onboardSite`, which
// falls back to the literal `["/", "/privacy", "/terms", "/about"]` because
// `onboardProperty` has no `routes` parameter to pass. Nothing ever updated it
// again. Three of the four live properties therefore carried that placeholder
// as fact, and it is not a harmless default: `site.routes` is the sitemap
// `buildOriginPack` publishes, the page list in the generated llms.txt, and the
// "Public routes" line in every Grok brief.
//
// Measured against the live origins on 2026-09-09:
//
//   botcentral.org    /privacy 404  /terms 404  /about 404
//   citefleet.app     /privacy 404  /terms 404  /about 404
//   wflowprocess.app  /privacy 404  /terms 404  /about 404
//   resonanse.app     (real stored routes) /premium 200 /guidelines 200
//                     /report 200 /data 200
//
// Nine invented routes, all dead; the one property with real routes has four
// that all answer. A Grok run on 2026-09-09 probed those three paths on
// botcentral.org, found them missing, and reported the brief as wrong — which
// it was. Worse, with a working GitHub token a push would have published those
// three 404s to Google, Bing and every AI crawler as the site's canonical
// sitemap.
//
// The sitemap location is also discovered rather than assumed. `auditor.ts`
// tested robots.txt with /sitemap:\s*https?:\/\//i, which requires an absolute
// URL — botcentral.org declares `Sitemap: /sitemaps/sitemap.xml`, so the
// auditor reported "no Sitemap: directive found" and then fetched
// `${origin}/sitemap.xml`, which 404s. The real map is 27 URLs and was there
// the whole time.

/** The most routes to keep. A brief and a generated sitemap both stay readable. */
export const MAX_ROUTES = 50;
/** Child sitemaps to follow from an index. Enough for a real site, bounded. */
export const MAX_CHILD_SITEMAPS = 5;

/**
 * The sitemap URL a robots.txt declares, resolved against the origin.
 *
 * Accepts an absolute URL or a site-relative path: the sitemaps protocol asks
 * for a full URL, but relative declarations are common and crawlers follow
 * them, so a checker that only accepts absolute reports a declared sitemap as
 * missing. Returns null when no `Sitemap:` line is present at all.
 */
export function sitemapUrlFromRobots(robotsText: string, origin: string): string | null {
  const match = robotsText.match(/^\s*sitemap:\s*(\S+)\s*$/im);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return null;
  try {
    // Resolves an absolute URL as itself and a relative one against the origin.
    const url = new URL(raw, `${origin.replace(/\/$/, "")}/`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Every `<loc>` value in a sitemap or sitemap index, in document order. */
export function locsFromSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

/** True when the document lists other sitemaps rather than pages. */
export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

/**
 * Same-origin paths from a list of absolute URLs.
 *
 * Off-origin entries are dropped rather than rewritten — a sitemap may legally
 * point at a CDN host, and those are not this property's routes. "/" is always
 * first because every property has a home page and the audit needs it even when
 * the sitemap omits it.
 */
export function routesFromLocs(locs: readonly string[], origin: string): string[] {
  let host: string;
  try {
    host = new URL(origin).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return ["/"];
  }
  const paths = new Set<string>(["/"]);
  for (const loc of locs) {
    let url: URL;
    try {
      url = new URL(loc);
    } catch {
      continue;
    }
    if (url.host.replace(/^www\./, "").toLowerCase() !== host) continue;
    // Query strings and fragments are not distinct routes for this purpose.
    const path = url.pathname.replace(/\/+$/, "") || "/";
    paths.add(path);
  }
  const rest = [...paths].filter((p) => p !== "/").sort();
  return ["/", ...rest].slice(0, MAX_ROUTES);
}

export type DiscoveredRoutes = {
  /** The sitemap actually read, or null when none could be. */
  sitemapUrl: string | null;
  /** How the sitemap was located — for the operator-facing note. */
  source: "robots-declared" | "conventional-path" | "none";
  routes: string[];
  /** One sentence naming what happened, for evidence and the audit finding. */
  note: string;
};

export type DiscoverDeps = {
  fetchText: (url: string) => Promise<{ status: number | null; text: string }>;
};

/**
 * Find a property's real routes: read robots.txt for the declared sitemap, fall
 * back to the conventional path, follow one level of sitemap index, and reduce
 * the result to same-origin paths.
 *
 * Fails soft on purpose. Discovery feeding an audit must never throw the audit
 * away, so an unreachable robots.txt or an unparseable sitemap yields `["/"]`
 * and a note saying so — never the invented placeholder, and never a crash.
 */
export async function discoverRoutes(
  origin: string,
  deps: DiscoverDeps,
): Promise<DiscoveredRoutes> {
  const base = origin.replace(/\/$/, "");
  let sitemapUrl: string | null = null;
  let source: DiscoveredRoutes["source"] = "none";

  const robots = await deps.fetchText(`${base}/robots.txt`).catch(() => ({ status: null, text: "" }));
  const declared = robots.status === 200 ? sitemapUrlFromRobots(robots.text, base) : null;
  if (declared) {
    sitemapUrl = declared;
    source = "robots-declared";
  } else {
    sitemapUrl = `${base}/sitemap.xml`;
    source = "conventional-path";
  }

  const first = await deps.fetchText(sitemapUrl).catch(() => ({ status: null, text: "" }));
  if (first.status !== 200 || !first.text.includes("<loc")) {
    return {
      sitemapUrl: null,
      source: "none",
      routes: ["/"],
      note:
        source === "robots-declared"
          ? `robots.txt declares ${sitemapUrl}, but it returned ${first.status ?? "no response"}.`
          : `No sitemap declared in robots.txt, and ${sitemapUrl} returned ${first.status ?? "no response"}.`,
    };
  }

  let locs = locsFromSitemap(first.text);
  if (isSitemapIndex(first.text)) {
    const children = locs.slice(0, MAX_CHILD_SITEMAPS);
    const collected: string[] = [];
    for (const child of children) {
      const res = await deps.fetchText(child).catch(() => ({ status: null, text: "" }));
      if (res.status === 200) collected.push(...locsFromSitemap(res.text));
    }
    locs = collected;
  }

  const routes = routesFromLocs(locs, base);
  return {
    sitemapUrl,
    source,
    routes,
    note:
      `${routes.length} route${routes.length === 1 ? "" : "s"} from ${sitemapUrl}` +
      (source === "robots-declared" ? " (declared in robots.txt)." : " (conventional path; robots.txt declared none)."),
  };
}
