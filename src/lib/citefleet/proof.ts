import { resolveTxt } from "node:dns/promises";
import type { Site } from "./types";
import { siteVerifyToken, verifyLine } from "./verify-token.ts";

/**
 * Pre-flight proof of control — the same rules BotCentral's verifier applies
 * (mitchvac/botcentral src/lib/verify.ts, SPEC §4): the origin serves
 * /.well-known/botcentral.txt as a non-HTML 200 containing the token, or an
 * apex DNS TXT record contains it. CiteFleet runs this BEFORE it publishes so a
 * missing proof is reported here, with the exact line to add, instead of as a
 * 422 from the registry.
 */

export type ProofMethod = "well-known-file" | "dns-txt" | "none";

export interface ProofResult {
  proven: boolean;
  method: ProofMethod;
  note: string;
  checkedAt: string;
}

export interface ProofDeps {
  fetchText?: (url: string) => Promise<{ status: number; text: string; contentType: string }>;
  resolveTxt?: (domain: string) => Promise<string[][]>;
  now?: () => Date;
}

export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase();
  return (
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("<head") ||
    head.includes("<body")
  );
}

export function tokenPresent(haystack: string, token: string): boolean {
  if (!token) return false;
  return haystack.includes(`botcentral-verify=${token}`) || haystack.includes(token);
}

export function wellKnownUrl(site: Pick<Site, "domain">): string {
  return `https://${site.domain.replace(/^www\./, "")}/.well-known/botcentral.txt`;
}

/** One sentence the operator or customer can act on. */
export function proofHint(site: Pick<Site, "domain">): string {
  return `Serve ${verifyLine(siteVerifyToken(site))} as plain text at ${wellKnownUrl(site)}, or add an apex DNS TXT record with that same line.`;
}

async function defaultFetchText(url: string) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": "CiteFleetProof/1.0 (+https://citefleet.app)", Accept: "text/plain, */*" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  return { status: res.status, text: await res.text(), contentType: res.headers.get("content-type") || "" };
}

export async function checkOriginProof(
  site: Pick<Site, "domain" | "verifyToken">,
  deps: ProofDeps = {},
): Promise<ProofResult> {
  const fetchText = deps.fetchText ?? defaultFetchText;
  const resolve = deps.resolveTxt ?? ((d: string) => resolveTxt(d));
  const checkedAt = (deps.now ?? (() => new Date()))().toISOString();
  const token = siteVerifyToken(site);
  const host = site.domain.replace(/^www\./, "").toLowerCase();

  let fileNote = "";
  try {
    const file = await fetchText(wellKnownUrl(site));
    const htmlish = looksLikeHtml(file.text) || file.contentType.toLowerCase().includes("text/html");
    if (file.status === 200 && !htmlish && tokenPresent(file.text, token)) {
      return { proven: true, method: "well-known-file", note: `Token found in ${wellKnownUrl(site)} (plain text).`, checkedAt };
    }
    fileNote =
      file.status >= 300 && file.status < 400
        ? `${wellKnownUrl(site)} redirected (${file.status}); the file must be served at that exact URL`
        : file.status !== 200
        ? `${wellKnownUrl(site)} returned ${file.status}`
        : htmlish
          ? `${wellKnownUrl(site)} returned HTML (an app shell does not count)`
          : `${wellKnownUrl(site)} is plain text but does not contain the token`;
  } catch (err) {
    fileNote = `${wellKnownUrl(site)} unreachable (${err instanceof Error ? err.message : "fetch failed"})`;
  }

  let dnsNote = "";
  try {
    const records = await resolve(host);
    const hay = records.map((r) => r.join("")).join(" ");
    if (tokenPresent(hay, token)) {
      return { proven: true, method: "dns-txt", note: `Token found in a DNS TXT record on ${host}.`, checkedAt };
    }
    dnsNote = records.length ? `no matching TXT record among ${records.length} on ${host}` : `no TXT records on ${host}`;
  } catch (err) {
    // Node's resolver throws for "no records" (ENODATA) and "no such name" (ENOTFOUND).
    const code = (err as { code?: string })?.code;
    dnsNote =
      code === "ENODATA" || code === "ENOTFOUND"
        ? `no TXT records on ${host}`
        : `DNS TXT lookup failed for ${host} (${err instanceof Error ? err.message : "dns error"})`;
  }

  return { proven: false, method: "none", note: `${fileNote}; ${dnsNote}. ${proofHint(site)}`, checkedAt };
}

/** Poll the proof until it appears; deploys lag pushes by seconds to minutes. */
export async function waitForProof(
  site: Pick<Site, "domain" | "verifyToken">,
  opts: { attempts?: number; delayMs?: number; deps?: ProofDeps; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ProofResult & { attempts: number }> {
  const attempts = Math.max(1, opts.attempts ?? 10);
  const delayMs = opts.delayMs ?? 30_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: ProofResult | undefined;
  for (let i = 1; i <= attempts; i++) {
    last = await checkOriginProof(site, opts.deps);
    if (last.proven) return { ...last, attempts: i };
    if (i < attempts) await sleep(delayMs);
  }
  return { ...(last as ProofResult), attempts };
}
