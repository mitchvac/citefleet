import type {
  PlatformHealth,
  ReconcileCheck,
  Site,
  SiteMonitor,
  StoreShape,
} from "./types";
import { isFrozen } from "./control";

const MARKETING = ["/", "/premium", "/privacy", "/terms", "/guidelines"];

export function buildChecks(
  site: Site,
  snap: Omit<SiteMonitor, "checks" | "blockedByKill" | "drift">,
  store: StoreShape,
  platform?: PlatformHealth,
): ReconcileCheck[] {
  const checks: ReconcileCheck[] = [];
  const marketing = snap.probes.filter((p) => MARKETING.includes(p.path) || p.path === "/");
  const home = snap.probes.find((p) => p.path === "/");
  const paidOnMarketing = marketing.filter((p) => p.kind === "payment402");
  const spa = snap.probes.filter((p) => p.kind === "spa404");
  const dead = snap.probes.filter((p) => p.kind === "dead" || p.kind === "error");
  const tasks = store.tasks.filter((t) => t.siteId === site.id);
  const ticksWithoutProof = tasks.filter(
    (t) =>
      t.status === "done" &&
      ["x_mentions", "directories", "press", "gsc_submit", "bing_webmaster"].includes(
        t.playbookId,
      ) &&
      !t.evidence.some((e) => e.ok && e.url),
  );

  checks.push({
    id: "ownership",
    ok: snap.wellKnown,
    severity: snap.wellKnown ? "ok" : "warn",
    title: "Origin proof",
    detail: snap.wellKnown
      ? "/.well-known/botcentral.txt is plain text"
      : "/.well-known/botcentral.txt is missing or HTML (SPA shell). Serve text/plain on the origin.",
  });

  const marketingOk = marketing.length
    ? marketing.every((p) => p.kind === "ok")
    : home?.kind === "ok";
  checks.push({
    id: "marketing-200",
    ok: marketingOk && spa.length === 0,
    severity: spa.length ? "critical" : marketingOk ? "ok" : "critical",
    title: "Marketing URLs are crawlable",
    detail: spa.length
      ? `SPA 404 on ${spa.map((p) => p.path).join(", ")}`
      : dead.length
        ? `Dead: ${dead.map((p) => `${p.path}→${p.status}`).join(", ")}`
        : `${snap.probes.filter((p) => p.kind === "ok").length} probes returned 200.`,
  });

  checks.push({
    id: "no-402-homepage",
    ok: paidOnMarketing.length === 0,
    severity: paidOnMarketing.length ? "critical" : "ok",
    title: "Do not 402 the public site",
    detail: paidOnMarketing.length
      ? `HTTP 402 on ${paidOnMarketing.map((p) => p.path).join(", ")}. Googlebot will not pay. Keep 402 on /api only.`
      : "No payment challenge on marketing paths.",
  });

  checks.push({
    id: "catalog",
    ok: snap.catalogListed,
    severity: snap.catalogListed ? "ok" : "warn",
    title: "BotCentral card",
    detail: snap.catalogListed
      ? `Listed — ${snap.catalogHref}`
      : snap.catalogError || "Not listed. Run List on BotCentral after crawl is clean.",
  });

  checks.push({
    id: "sitemap-https",
    ok: snap.sitemapHttps && snap.sitemapUrlCount > 0,
    severity: snap.sitemapHttps && snap.sitemapUrlCount > 0 ? "ok" : "warn",
    title: "Sitemap is https and populated",
    detail: `${snap.sitemapUrlCount} <loc> — ${snap.sitemapHttps ? "https only" : "contains http:// (drift)"}`,
  });

  checks.push({
    id: "search-doors",
    ok: Boolean(site.botcentral?.listed) || tasks.some((t) => t.playbookId === "gsc_submit" && t.status === "done"),
    severity: "info",
    title: "Search doors (GSC / Bing)",
    detail:
      "Helios/Nimbus still require vendor OAuth. Status here is campaign evidence, not console API truth yet.",
  });

  checks.push({
    id: "invalid-ticks",
    ok: ticksWithoutProof.length === 0,
    severity: ticksWithoutProof.length ? "warn" : "ok",
    title: "Ticks have proof",
    detail: ticksWithoutProof.length
      ? `${ticksWithoutProof.length} done task(s) have no evidence URL (checkbox without proof): ${ticksWithoutProof.map((t) => t.title).join("; ")}`
      : "Done mention/submit tasks carry a proof URL.",
  });

  const mentions = tasks.filter((t) =>
    ["x_mentions", "directories", "press"].includes(t.playbookId),
  );
  // A mention that names the brand but not the domain: assistants can cite the
  // wrong product with the same name. Only meaningful when the label differs
  // from the domain.
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brand = site.name.trim();
  const brandRe =
    brand && brand.toLowerCase() !== site.domain.toLowerCase()
      ? new RegExp(escapeRe(brand), "i")
      : null;
  const domainRe = new RegExp(escapeRe(site.domain), "i");
  const badName = Boolean(
    brandRe &&
      mentions.some((t) =>
        t.evidence.some((e) => e.detail && brandRe.test(e.detail) && !domainRe.test(e.detail)),
      ),
  );
  checks.push({
    id: "name-collision",
    ok: !badName,
    severity: badName ? "warn" : "ok",
    title: "Mentions use the exact domain",
    detail: badName
      ? `A mention packet says “${brand}” without ${site.domain}.`
      : `Evidence must include ${site.domain}, not only the brand name.`,
  });

  checks.push({
    id: "platform",
    ok: Boolean(platform?.citefleet.ok && platform?.botcentral.ok),
    severity: platform?.citefleet.ok && platform?.botcentral.ok ? "ok" : "critical",
    title: "CiteFleet + BotCentral health",
    detail: `citefleet.app ${platform?.citefleet.status ?? "?"} · botcentral.org ${platform?.botcentral.status ?? "?"}`,
  });

  checks.push({
    id: "kill",
    ok: !isFrozen(store),
    severity: isFrozen(store) ? "warn" : "ok",
    title: "Kill switch",
    detail: isFrozen(store)
      ? "Acts are frozen. Monitor still runs. Open Monitor to thaw."
      : "Acts allowed under policy.",
  });

  return checks;
}
