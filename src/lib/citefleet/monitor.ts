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
import { renewalEmail, renewalNotices } from "./listing-term.ts";
import { allowedEmails } from "@/lib/auth/operator-allowlist";
import { mailConfigured, sendMail } from "@/lib/mail/smtp";

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
  const locUrls = [...sitemapBody.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(
    (m) => m[1].trim(),
  );
  const locHttp = locUrls.filter((u) => /^http:\/\//i.test(u)).length;
  const sitemapUrlCount = locUrls.length;

  const wk = await probe(`${origin}/.well-known/botcentral.txt`);
  const llms = await probe(`${origin}/llms.txt`);
  const listing = await lookupListing(site.domain);
  const wellKnownText =
    wk.status === 200 &&
    !wk.contentType.includes("html") &&
    /domain:\s*\S+/i.test(wk.text);

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
    sitemapHttps: sm.status === 200 && locHttp === 0 && sitemapUrlCount > 0,
    sitemapUrlCount,
    wellKnown: wellKnownText,
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

/**
 * The renewal reminder. BotCentral states a listing's end date once (on the
 * publish response) and tells nobody before it lapses — "a registrar that does
 * not send the renewal email loses the name" (their brief, 2026-09-06). Each
 * control cycle mails every allow-listed operator once per term for every site
 * inside the window, and writes the same line to the audit log whether or not
 * a mailer is configured. A failed send is logged and retried next cycle; a
 * missing mailer is logged once and stamped, so the log does not repeat.
 */
export async function sendRenewalNotices(nowMs = Date.now()): Promise<Array<{ siteId: string; sent: number; error?: string }>> {
  const store = await getStore();
  const due = renewalNotices(store.sites, nowMs);
  const out: Array<{ siteId: string; sent: number; error?: string }> = [];
  const origin = (process.env.CITEFLEET_PUBLIC_URL || "https://citefleet.app").replace(/\/$/, "");
  for (const site of due) {
    const mail = renewalEmail(site, `${origin}/sites/${site.id}`, nowMs);
    const mailer = mailConfigured();
    const recipients = mailer ? allowedEmails() : [];
    let sent = 0;
    const failed: string[] = [];
    let error: string | undefined;
    for (const to of recipients) {
      try {
        await sendMail({ to, subject: mail.subject, text: mail.text });
        sent += 1;
      } catch (err) {
        failed.push(to);
        error = `${to}: ${err instanceof Error ? err.message : "send failed"}`;
      }
    }
    const line = mail.text.split("\n")[2];
    await mutateStore((s) => {
      const current = s.sites.find((x) => x.id === site.id);
      if (!current) return;
      // Stamp once anyone has been told (or there was nobody to tell), so the
      // next cycle does not mail the addresses that already got it. Only a
      // cycle where every send failed is retried.
      if (!recipients.length || sent > 0) current.renewalNoticeFor = site.term?.paidUntil ?? undefined;
      logActivity(s, {
        actor: "Sentinel",
        kind: "monitor",
        siteId: site.id,
        message: !mailer
          ? `Renewal reminder for ${site.domain} (no mailer configured — this line is the reminder). ${line}`
          : !recipients.length
            ? `Renewal reminder for ${site.domain} (CITEFLEET_OPERATOR_EMAILS is empty — this line is the reminder). ${line}`
            : failed.length && !sent
              ? `Renewal reminder for ${site.domain} could not be sent (${error}); will retry next cycle. ${line}`
              : failed.length
                ? `Renewal reminder for ${site.domain} sent to ${sent} of ${recipients.length} operator addresses; failed: ${failed.join(", ")}. ${line}`
                : `Renewal reminder for ${site.domain} sent to ${sent} operator address${sent === 1 ? "" : "es"}. ${line}`,
      });
    });
    out.push({ siteId: site.id, sent, error });
  }
  return out;
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

  await sendRenewalNotices();
  return (await getStore()).control;
}
