/** Compact discovery contract. Hosted copies never prove control of the origin. */
export const DISCOVERY_VERSION = "citefleet-discovery-v1" as const;
export const DISCOVERY_MAX_BYTES = 65536;
export interface DiscoveryRecord {
  name: string;
  url: string;
  summary: string;
  pages: Array<{ url: string; title: string }>;
  topics: string[];
}
export interface DiscoveryReceipt {
  version: typeof DISCOVERY_VERSION;
  status: "accepted";
  publisherRecordId: string;
  revision: number;
  idempotencyKey: string;
  digest: string;
  url: string;
  files: Array<{ path: string; sha256: string; url: string }>;
}
export interface DiscoverySubmission {
  operationId: string;
  revision: number;
  idempotencyKey: string;
  digest: string;
  status: "pending" | "accepted" | "failed";
  at: string;
  error?: string;
  receipt?: DiscoveryReceipt;
}
export interface SiteDiscovery {
  record: DiscoveryRecord;
  latest: DiscoverySubmission;
  priorReceipt?: DiscoveryReceipt;
}
export function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key)))
    throw new Error("Unexpected discovery field.");
  return object;
}
function text(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    Array.from(value).some(
      (char) =>
        char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "<" || char === ">",
    )
  )
    throw new Error("Invalid discovery text.");
  return value.trim();
}
export function discoveryUrl(value: unknown, root = false): string {
  const raw = text(value, 2048);
  const url = new URL(raw);
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|home|lan)$/.test(host) ||
    (root && url.pathname !== "/") ||
    ["\\", "<", ">", "[", "]", "(", ")"].some((char) => raw.includes(char)) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|3c|3e|5c)/i.test(raw)
  ) {
    throw new Error("Use a public HTTPS website URL without credentials, query, fragment or port.");
  }
  return root ? url.origin : url.href;
}
export function parseDiscoveryRecord(value: unknown): DiscoveryRecord {
  const obj = exactObject(value, ["name", "url", "summary", "pages", "topics"]);
  const url = discoveryUrl(obj.url, true);
  const pages = obj.pages ?? [];
  const topics = obj.topics ?? [];
  if (!Array.isArray(pages) || pages.length > 20 || !Array.isArray(topics) || topics.length > 10)
    throw new Error("At most 20 pages and 10 topics are allowed.");
  const result = {
    name: text(obj.name, 200),
    url,
    summary: text(obj.summary, 1200),
    pages: pages.map((page) => {
      const p = exactObject(page, ["url", "title"]);
      const pageUrl = discoveryUrl(p.url);
      const decoded = decodeURIComponent(new URL(pageUrl).pathname);
      if (/[&<>]/.test(decoded) || /^\/(?:api|admin|settings)(?:\/|$)/i.test(decoded))
        throw new Error("Choose public content pages only.");
      if (new URL(pageUrl).origin !== url) throw new Error("Pages must belong to this website.");
      return { url: pageUrl, title: text(p.title, 200) };
    }),
    topics: topics.map((topic) => text(topic, 80)),
  };
  if (new Set(result.pages.map((p) => p.url)).size !== result.pages.length)
    throw new Error("Duplicate page URL.");
  return result;
}
