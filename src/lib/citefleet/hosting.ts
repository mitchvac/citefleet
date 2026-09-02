import { resolve4, resolveCname } from "node:dns/promises";

/**
 * Where is this origin hosted? Answered from DNS and the homepage's response
 * headers, so the audit can say "Vercel" or "your own nginx box" and the proof
 * hint can say what that means (Vercel deploys on push; a VPS needs a rebuild).
 *
 * Signatures verified live on 2026-09-02:
 *   Vercel   → `server: Vercel`, `x-vercel-id`; CNAME *.vercel-dns.com; apex A in Vercel's anycast
 *   Netlify  → `server: Netlify`, `x-nf-request-id`; CNAME *.netlify.app
 *   GitHub   → `server: github.com`, `x-github-request-id`; CNAME *.github.io
 *   nginx/apache/caddy → self-hosted (server header); Cloudflare → `cf-ray` (a proxy in front of something)
 */

import type { HostingProvider, HostingResult } from "./hosting-hint.ts";
import { LABELS } from "./hosting-hint.ts";

export type { HostingProvider, HostingResult } from "./hosting-hint.ts";
export { LABELS, hostingHint } from "./hosting-hint.ts";

export interface HostingDeps {
  resolve4?: (host: string) => Promise<string[]>;
  resolveCname?: (host: string) => Promise<string[]>;
  citefleetIps?: () => Promise<string[]>;
  now?: () => Date;
}

// Apex addresses observed for Vercel-hosted domains (xrptokenizer.app, 2026-09-02) plus
// Vercel's documented 76.76.21.21. Only consulted when no header/CNAME signature exists;
// expect drift and treat a match as medium confidence.
const VERCEL_A = new Set(["76.76.21.21", "216.150.1.193", "216.150.16.129", "216.150.1.1", "216.150.16.1"]);

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function detectHosting(
  input: {
    domain: string;
    /** Lower-cased response headers of the homepage fetch, or null when the fetch failed. */
    headers: Record<string, string> | null;
    status: number | null;
  },
  deps: HostingDeps = {},
): Promise<HostingResult> {
  const host = input.domain.replace(/^www\./, "").toLowerCase();
  const r4 = deps.resolve4 ?? ((h: string) => resolve4(h));
  const rc = deps.resolveCname ?? ((h: string) => resolveCname(h));
  const ours = deps.citefleetIps ?? (() => resolve4("citefleet.app"));
  const checkedAt = (deps.now ?? (() => new Date()))().toISOString();

  const [a, cnameApex, cnameWww, ourIps] = await Promise.all([
    safe(() => r4(host), [] as string[]),
    safe(() => rc(host), [] as string[]),
    safe(() => rc(`www.${host}`), [] as string[]),
    safe(ours, [] as string[]),
  ]);
  const cnames = [...cnameApex, ...cnameWww].map((c) => c.toLowerCase());
  const h = input.headers ?? {};
  const server = (h["server"] || "").toLowerCase();
  const evidence: string[] = [];
  if (a.length) evidence.push(`A ${a.join(", ")}`);
  if (cnames.length) evidence.push(`CNAME ${cnames.join(", ")}`);
  if (server) evidence.push(`server: ${h["server"]}`);
  for (const k of ["x-vercel-id", "x-nf-request-id", "x-github-request-id", "cf-ray"]) {
    if (h[k]) evidence.push(`${k} present`);
  }
  const sameServerAsCiteFleet = a.some((ip) => ourIps.includes(ip));
  if (sameServerAsCiteFleet) evidence.push("same address as citefleet.app");
  if (!ourIps.length) evidence.push("citefleet.app address unknown (could not compare)");

  const done = (provider: HostingProvider, confidence: HostingResult["confidence"], deploysOnPush: boolean): HostingResult => ({
    provider,
    label: LABELS[provider],
    confidence,
    evidence,
    sameServerAsCiteFleet,
    deploysOnPush,
    checkedAt,
  });

  // Headers prove the site answered, so header rules come first. Then: no
  // answer at all is "unreachable" no matter where DNS points (a Vercel CNAME
  // with no deployment must not read as "deploys on push"). DNS-only rules last.
  if (server.includes("vercel") || h["x-vercel-id"]) return done("vercel", "high", true);
  if (server.includes("netlify") || h["x-nf-request-id"]) return done("netlify", "high", true);
  if (server.includes("github.com") || h["x-github-request-id"]) return done("github-pages", "high", true);
  if (input.status === null && !input.headers) {
    evidence.push(a.length ? "no HTTP response" : "no A record");
    if (cnames.some((c) => c.includes("vercel-dns.com") || c.endsWith("vercel.app")) || a.some((ip) => VERCEL_A.has(ip))) {
      evidence.push("DNS points at Vercel but nothing answers (no deployment or domain not assigned)");
    }
    return done("unreachable", "high", false);
  }
  if (cnames.some((c) => c.includes("vercel-dns.com") || c.endsWith("vercel.app"))) return done("vercel", "medium", true);
  if (cnames.some((c) => c.includes("netlify"))) return done("netlify", "medium", true);
  if (cnames.some((c) => c.endsWith("github.io"))) return done("github-pages", "medium", true);
  if (a.some((ip) => VERCEL_A.has(ip))) return done("vercel", "medium", true);
  if (server.includes("cloudflare") || h["cf-ray"]) return done("cloudflare", "medium", false);
  if (/nginx|apache|caddy|openresty|litespeed/.test(server)) return done("self-hosted", "high", false);
  return done("unknown", "low", false);
}

