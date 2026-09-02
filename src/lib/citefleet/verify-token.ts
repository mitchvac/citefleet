import { createHash, createHmac } from "node:crypto";

// BotCentral proof-of-control token (BotCentral SPEC §4). The registry checks
// that https://<domain>/.well-known/botcentral.txt (or an apex DNS TXT record)
// contains `botcentral-verify=<token>` for the token the publisher sends on the
// card. CiteFleet therefore has to send and write the SAME token, and it must
// be stable per domain so re-onboarding a site never invalidates the file the
// customer already deployed.
//
// Token = first 32 hex chars (128 bits) of HMAC-SHA256(secret, apex domain).
// Secret = BOTCENTRAL_VERIFY_SECRET, else BOTCENTRAL_SERVICE_TOKEN (required in
// production to publish at all). Without either (local dev) it degrades to an
// unkeyed SHA-256 so onboarding still works; that token is guessable, but the
// proof is still "can you place it at the origin", which nobody else can.

export const VERIFY_LINE_PREFIX = "botcentral-verify=";

export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

export function verifyTokenFor(domain: string, secret?: string): string {
  const host = normalizeDomain(domain);
  if (!host) throw new Error("verifyTokenFor: domain required");
  const key = secret ?? verifySecretFromEnv();
  const digest = key
    ? createHmac("sha256", key).update(host).digest("hex")
    : createHash("sha256").update(`citefleet:${host}`).digest("hex");
  return digest.slice(0, 32);
}

export function verifySecretFromEnv(): string {
  return (
    process.env.BOTCENTRAL_VERIFY_SECRET?.trim() ||
    process.env.BOTCENTRAL_SERVICE_TOKEN?.trim() ||
    ""
  );
}

export function verifyLine(token: string): string {
  return `${VERIFY_LINE_PREFIX}${token}`;
}

/** The one place that decides a site's token: persisted value first, else derived. Card and origin pack both call this. */
export function siteVerifyToken(site: { domain: string; verifyToken?: string }): string {
  return site.verifyToken || verifyTokenFor(site.domain);
}
