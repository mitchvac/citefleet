import { resolveTxt } from "node:dns/promises";
import type { Site } from "./types";
import { normalizeDomain, siteVerifyToken } from "./verify-token.ts";
import { looksLikeHtml, tokenPresent } from "./origin-file-check.ts";
import { proofHint, proofRecord, wellKnownUrl } from "./proof-record.ts";

// `proofHint`, `wellKnownUrl`, `looksLikeHtml` and `tokenPresent` moved into
// browser-safe modules so a component can render the record without dragging
// `node:dns/promises` into the client bundle (client-bundle-guard.test.ts).
// Re-exported here because this module's public surface is what the rest of the
// app and `proof.test.ts` already import.
export { looksLikeHtml, tokenPresent } from "./origin-file-check.ts";
export { proofHint, proofRecord, wellKnownUrl } from "./proof-record.ts";
export type { ProofRecord } from "./proof-record.ts";

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

async function defaultFetchText(url: string) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow", // BotCentral follows redirects too (up to a few hops)
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
  const host = normalizeDomain(site.domain);

  let fileNote = "";
  try {
    const file = await fetchText(wellKnownUrl(site));
    const htmlish = looksLikeHtml(file.text) || file.contentType.toLowerCase().includes("text/html");
    if (file.status === 200 && !htmlish && tokenPresent(file.text, token)) {
      return { proven: true, method: "well-known-file", note: `Token found in ${wellKnownUrl(site)} (plain text).`, checkedAt };
    }
    fileNote =
      file.status !== 200
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

/** DNS-only verification for a provider flow that claims it wrote the TXT record. */
export async function checkDnsProof(
  site: Pick<Site, "domain" | "verifyToken">,
  deps: ProofDeps = {},
): Promise<ProofResult> {
  const resolve = deps.resolveTxt ?? ((domain: string) => resolveTxt(domain));
  const checkedAt = (deps.now ?? (() => new Date()))().toISOString();
  const token = siteVerifyToken(site);
  const host = normalizeDomain(site.domain);
  const record = proofRecord(site);
  const expected = `Expected Type ${record.type}, Name ${record.name}, Value ${record.value} for ${record.apex}.`;

  try {
    const records = await resolve(host);
    const haystack = records.map((record) => record.join("")).join(" ");
    if (tokenPresent(haystack, token)) {
      return {
        proven: true,
        method: "dns-txt",
        note: `Token found in a DNS TXT record on ${host}.`,
        checkedAt,
      };
    }
    return {
      proven: false,
      method: "none",
      note: records.length
        ? `No matching TXT record among ${records.length} on ${host}. ${expected}`
        : `No TXT records on ${host}. ${expected}`,
      checkedAt,
    };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const note =
      code === "ENODATA" || code === "ENOTFOUND"
        ? `No TXT records on ${host}.`
        : `DNS TXT lookup failed for ${host} (${error instanceof Error ? error.message : "dns error"}).`;
    return { proven: false, method: "none", note: `${note} ${expected}`, checkedAt };
  }
}

type WaitForProofOptions = {
  attempts?: number;
  delayMs?: number;
  deps?: ProofDeps;
  sleep?: (ms: number) => Promise<void>;
};

async function waitForCheck(
  site: Pick<Site, "domain" | "verifyToken">,
  check: typeof checkOriginProof,
  opts: WaitForProofOptions,
): Promise<ProofResult & { attempts: number }> {
  const attempts = Math.max(1, opts.attempts ?? 10);
  const delayMs = opts.delayMs ?? 30_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: ProofResult | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await check(site, opts.deps);
    if (last.proven) return { ...last, attempts: attempt };
    if (attempt < attempts) await sleep(delayMs);
  }
  return { ...(last as ProofResult), attempts };
}

/** Poll either accepted proof method until it appears; deploys lag pushes. */
export async function waitForProof(
  site: Pick<Site, "domain" | "verifyToken">,
  opts: WaitForProofOptions = {},
): Promise<ProofResult & { attempts: number }> {
  return waitForCheck(site, checkOriginProof, opts);
}

/** Poll only the TXT record; an existing proof file cannot satisfy a DNS install. */
export async function waitForDnsProof(
  site: Pick<Site, "domain" | "verifyToken">,
  opts: WaitForProofOptions = {},
): Promise<ProofResult & { attempts: number }> {
  return waitForCheck(site, checkDnsProof, opts);
}
