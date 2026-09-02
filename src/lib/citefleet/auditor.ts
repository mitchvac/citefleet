import type { AuditResult, Site } from "./types";
import { detectHosting } from "./hosting.ts";

const AI_AGENTS = [
  "OAI-SearchBot",
  "PerplexityBot",
  "Googlebot",
  "Bingbot",
  "ClaudeBot",
  "GPTBot",
];

async function timedGet(
  url: string,
  headers: Record<string, string> = {},
): Promise<{
  status: number | null;
  ms: number;
  text: string;
  contentType: string;
  responseHeaders: Record<string, string> | null;
  error?: string;
}> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "CiteFleetAuditor/1.0 (+https://citefleet.app)",
        ...headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k.toLowerCase()] = v;
    });
    return {
      status: res.status,
      ms: Date.now() - started,
      text,
      contentType: res.headers.get("content-type") || "",
      responseHeaders,
    };
  } catch (error) {
    return {
      status: null,
      ms: Date.now() - started,
      text: "",
      contentType: "",
      responseHeaders: null,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

function looksLikeJson404(status: number | null, text: string, contentType: string) {
  if (status === 404) return true;
  if (!text) return false;
  const jsonish = contentType.includes("json") || text.trim().startsWith("{");
  return jsonish && /not[\s_-]*found|"status"\s*:\s*404/i.test(text);
}

export async function auditSite(site: Site): Promise<AuditResult> {
  const origin = site.url.replace(/\/$/, "");
  const findings: AuditResult["findings"] = [];
  const routeChecks: AuditResult["routeChecks"] = [];

  const routes = site.routes.length ? site.routes : ["/"];
  let homepage: { responseHeaders: Record<string, string> | null; status: number | null } | undefined;
  for (const route of routes.slice(0, 12)) {
    const target = `${origin}${route === "/" ? "/" : route}`;
    const bare = await timedGet(target);
    const html = await timedGet(target, { Accept: "text/html" });
    if (route === "/" || !homepage) homepage = { responseHeaders: html.responseHeaders ?? bare.responseHeaders, status: html.status ?? bare.status };
    const spaFallbackRisk =
      looksLikeJson404(bare.status, bare.text, bare.contentType) &&
      (html.status === 200 || html.contentType.includes("text/html"));

    routeChecks.push({
      path: route,
      status: bare.status,
      ms: bare.ms,
      spaFallbackRisk,
      kind:
        bare.status === 402
          ? "payment402"
          : spaFallbackRisk
            ? "spa404"
            : !bare.status
              ? "error"
              : bare.status >= 400
                ? "dead"
                : "ok",
      error: bare.error,
    });
  }

  const spaHits = routeChecks.filter((r) => r.spaFallbackRisk);
  const paid = routeChecks.filter((r) => r.kind === "payment402");
  const dead = routeChecks.filter(
    (r) => r.status && r.status >= 400 && !r.spaFallbackRisk && r.kind !== "payment402",
  );
  if (spaHits.length) {
    findings.push({
      id: "spa-fallback",
      severity: "critical",
      title: "SPA fallback 404 (crawler-visible)",
      detail: `${spaHits.length} route(s) return JSON/404 without Accept: text/html: ${spaHits.map((r) => r.path).join(", ")}. This is the V109 class bug.`,
      playbookId: "spa_fallback",
    });
  } else if (routeChecks.every((r) => r.status && r.status < 400)) {
    findings.push({
      id: "spa-ok",
      severity: "ok",
      title: "Public routes fetchable without special headers",
      detail: `${routeChecks.length} routes returned success for a bare HTTP client.`,
      playbookId: "spa_fallback",
    });
  }

  if (dead.length) {
    findings.push({
      id: "dead-routes",
      severity: "warn",
      title: "Some public routes error",
      detail: dead.map((r) => `${r.path} → ${r.status}`).join(", "),
      playbookId: "spa_fallback",
    });
  }

  if (paid.length) {
    const onHome = paid.some((r) => r.path === "/" || r.path === "/premium");
    findings.push({
      id: "http-402",
      severity: onHome ? "critical" : "info",
      title: onHome
        ? "HTTP 402 on a marketing URL"
        : "HTTP 402 payment challenge (agent API)",
      detail: onHome
        ? `Crawlers will not pay: ${paid.map((r) => r.path).join(", ")}. Keep 402 off /, /premium, trust pages.`
        : `402 on ${paid.map((r) => r.path).join(", ")} — treat as a paid door, not a 404.`,
      playbookId: "spa_fallback",
    });
  }

  const robotsRes = await timedGet(`${origin}/robots.txt`);
  const robotsText = robotsRes.text || "";
  const allowsAi =
    AI_AGENTS.filter((agent) =>
      new RegExp(`user-agent:\\s*${agent}[\\s\\S]*?(allow:\\s*/|allow:\\s*\\*)`, "i").test(
        robotsText,
      ),
    ).length >= 2 || /allow:\s*\/\s*$/im.test(robotsText);
  const sitemapDeclared = /sitemap:\s*https?:\/\//i.test(robotsText);
  const robots = {
    ok: robotsRes.status === 200 && robotsText.length > 0,
    status: robotsRes.status,
    allowsAi,
    sitemapDeclared,
    snippet: robotsText.slice(0, 400),
  };

  if (!robots.ok) {
    findings.push({
      id: "robots-missing",
      severity: "warn",
      title: "robots.txt missing or empty",
      detail: robotsRes.error || `HTTP ${robotsRes.status}`,
      playbookId: "robots_ai",
    });
  } else if (!allowsAi) {
    findings.push({
      id: "robots-ai",
      severity: "warn",
      title: "AI crawlers not explicitly welcomed",
      detail:
        "Add Allow rules for OAI-SearchBot, PerplexityBot, Googlebot, and Bingbot — or a global Allow: /.",
      playbookId: "robots_ai",
    });
  } else {
    findings.push({
      id: "robots-ok",
      severity: "ok",
      title: "robots.txt reachable",
      detail: sitemapDeclared
        ? "Sitemap declared. AI crawler access looks open."
        : "Reachable, but no Sitemap: directive found.",
      playbookId: "robots_ai",
    });
  }

  const sitemapUrl = site.sitemapUrl || `${origin}/sitemap.xml`;
  const sm = await timedGet(sitemapUrl);
  const urlCount = (sm.text.match(/<loc>/g) || []).length;
  const sitemap = {
    ok: sm.status === 200 && (urlCount > 0 || sm.text.includes("<urlset")),
    status: sm.status,
    urlCount,
  };
  findings.push(
    sitemap.ok
      ? {
          id: "sitemap-ok",
          severity: "ok",
          title: `Sitemap readable (${urlCount} URLs)`,
          detail: sitemapUrl,
          playbookId: "sitemap",
        }
      : {
          id: "sitemap-missing",
          severity: "critical",
          title: "Sitemap not readable",
          detail: sm.error || `HTTP ${sm.status} at ${sitemapUrl}`,
          playbookId: "sitemap",
        },
  );

  if (site.indexNowKey) {
    const keyUrl = `${origin}/${site.indexNowKey}.txt`;
    const keyRes = await timedGet(keyUrl);
    const keyOk =
      keyRes.status === 200 && keyRes.text.includes(site.indexNowKey);
    findings.push(
      keyOk
        ? {
            id: "indexnow-key",
            severity: "ok",
            title: "IndexNow key file live",
            detail: keyUrl,
            playbookId: "indexnow",
          }
        : {
            id: "indexnow-key-missing",
            severity: "warn",
            title: "IndexNow key file not verified",
            detail: `${keyUrl} → ${keyRes.status ?? keyRes.error}`,
            playbookId: "indexnow",
          },
    );
  }

  const hosting = await detectHosting({
    domain: site.domain,
    headers: homepage?.responseHeaders ?? null,
    status: homepage?.status ?? null,
  });
  findings.push({
    id: "hosting",
    severity: hosting.provider === "unreachable" ? "critical" : "info",
    title: `Hosting: ${hosting.label}${hosting.sameServerAsCiteFleet ? " (same box as CiteFleet)" : ""}`,
    detail: `${hosting.evidence.join(" · ") || "no signals"}${hosting.deploysOnPush ? " · deploys on push" : ""}`,
    playbookId: "spa_fallback",
  });

  const ok = !findings.some((f) => f.severity === "critical");
  return {
    at: new Date().toISOString(),
    siteId: site.id,
    ok,
    findings,
    routeChecks,
    robots,
    sitemap,
    hosting,
  };
}
