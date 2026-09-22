import type { Site } from "./types.ts";
import { cleanIndexNowKey } from "./indexnow.ts";
import { checkIndexNowKeyFile, checkSitemapDoc } from "./origin-file-check.ts";
import { isSitemapIndex, locsFromSitemap } from "./route-discovery.ts";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000;
const MAX_CHILD_SITEMAPS = 5;
const MAX_SITEMAP_CHARS = 5_000_000;

export interface IndexNowSubmission {
  accepted: boolean;
  keyVerified: boolean;
  /** 202 means IndexNow received the URLs and key validation is pending. */
  pending: boolean;
  status: number | null;
  urlCount: number;
  at: string;
  note: string;
}

export interface IndexNowSubmitDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  endpoint?: string;
}

function sameHostUrl(raw: string, host: string): URL {
  const url = new URL(raw.replace(/&amp;/g, "&"));
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== host.toLowerCase()) {
    throw new Error(`Sitemap URL is outside the HTTPS origin ${host}: ${raw}`);
  }
  url.hash = "";
  return url;
}

export async function submitIndexNow(
  site: Pick<Site, "url" | "domain" | "sitemapUrl" | "indexNowKey">,
  deps: IndexNowSubmitDeps = {},
): Promise<IndexNowSubmission> {
  const at = (deps.now ?? (() => new Date()))().toISOString();
  let keyVerified = false;
  const fail = (note: string, status: number | null = null, urlCount = 0, verified = keyVerified): IndexNowSubmission => ({
    accepted: false, keyVerified: verified, pending: false, status, urlCount, at, note,
  });
  const key = cleanIndexNowKey(site.indexNowKey);
  if (!key) return fail("Generate an IndexNow key before submitting URLs.");

  let origin: URL;
  try {
    origin = new URL(site.url);
    if (origin.protocol !== "https:" || origin.hostname.toLowerCase() !== site.domain.toLowerCase()) {
      return fail("The property must have an HTTPS origin matching its domain.");
    }
  } catch {
    return fail("The property origin URL is invalid.");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  async function request(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(12_000) });
        // A key or sitemap fetched via a cross-host redirect cannot prove this origin.
        if (response.url && response.url !== url) {
          throw new Error(`The response for ${url} came from a different URL: ${response.url}`);
        }
        if (response.status < 500 || attempt === 1) return response;
      } catch (error) {
        if (attempt === 1) throw error;
      }
      await sleep(300);
    }
    throw new Error("IndexNow request did not complete.");
  }

  try {
    const keyUrl = new URL(`/${key}.txt`, origin).toString();
    const keyResponse = await request(keyUrl, { method: "GET", cache: "no-store" });
    const keyVerdict = checkIndexNowKeyFile({
      status: keyResponse.status,
      text: await keyResponse.text(),
      contentType: keyResponse.headers.get("content-type") || "",
    }, key);
    if (!keyVerdict.ok) return fail(keyVerdict.reason, keyResponse.status);
    keyVerified = true;

    const sitemapUrl = sameHostUrl(site.sitemapUrl || new URL("/sitemap.xml", origin).toString(), origin.hostname);
    async function readSitemap(url: URL): Promise<string> {
      const response = await request(url.toString(), { method: "GET", cache: "no-store" });
      const text = await response.text();
      if (text.length > MAX_SITEMAP_CHARS) throw new Error(`${url} exceeds the 5 MB sitemap limit for automatic submission.`);
      const verdict = checkSitemapDoc({ status: response.status, text, contentType: response.headers.get("content-type") || "" });
      if (!verdict.ok) throw new Error(`${url}: ${verdict.reason}`);
      return text;
    }
    const first = await readSitemap(sitemapUrl);
    let pageLocs = locsFromSitemap(first);
    if (isSitemapIndex(first)) {
      if (pageLocs.length > MAX_CHILD_SITEMAPS) {
        return fail(`The sitemap index has ${pageLocs.length} child sitemaps; automatic submission supports at most ${MAX_CHILD_SITEMAPS}.`, null, 0, true);
      }
      const children = pageLocs.map((loc) => sameHostUrl(loc, origin.hostname));
      pageLocs = [];
      for (const child of children) {
        const xml = await readSitemap(child);
        if (isSitemapIndex(xml)) return fail(`Nested sitemap indexes are not supported: ${child}`, null, 0, true);
        pageLocs.push(...locsFromSitemap(xml));
      }
    }
    const urls = [...new Set(pageLocs.map((loc) => sameHostUrl(loc, origin.hostname).toString()))];
    if (!urls.length) return fail("The live sitemap contains no same-host page URLs.", null, 0, true);
    if (urls.length > MAX_URLS) return fail(`The sitemap has ${urls.length} URLs; IndexNow permits at most ${MAX_URLS} per request.`, null, urls.length, true);

    const response = await request(deps.endpoint ?? ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
      body: JSON.stringify({ host: origin.hostname, key, keyLocation: keyUrl, urlList: urls }),
    });
    if (response.status !== 200 && response.status !== 202) {
      const detail = (await response.text()).slice(0, 200).trim();
      return fail(`IndexNow returned HTTP ${response.status}${detail ? `: ${detail}` : ""}.`, response.status, urls.length, true);
    }
    return {
      accepted: true,
      keyVerified: true,
      pending: response.status === 202,
      status: response.status,
      urlCount: urls.length,
      at,
      note: response.status === 202
        ? `IndexNow received ${urls.length} URL(s); key validation is pending. This does not confirm indexing.`
        : `IndexNow received ${urls.length} URL(s). This does not confirm indexing.`,
    };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "IndexNow submission failed.");
  }
}
