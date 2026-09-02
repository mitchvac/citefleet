// BotCentral proof-of-control token (BotCentral SPEC §4). The registry checks
// that https://<domain>/.well-known/botcentral.txt (plain text, non-HTML) or an
// apex DNS TXT record contains the token the publisher sends on the card
// (`botcentral-verify=<token>` — BotCentral also accepts the bare token anywhere
// in the file). The card and the origin pack must therefore carry the SAME value.
//
// Operator decision (commit f842b9d, 2026-09-02): one shared publisher token,
// "citefleet-app". Every origin pack CiteFleet ever wrote contains
// `verify: citefleet-app`, so files already deployed on customer sites pass
// without a redeploy, and a new customer only needs this one line (or a DNS TXT
// record with it). The proof is "this origin opted in to CiteFleet"; publishing
// itself is still gated by BOTCENTRAL_SERVICE_TOKEN, which never leaves the server.

export const BOTCENTRAL_VERIFY_TOKEN = "citefleet-app";
export const VERIFY_LINE_PREFIX = "botcentral-verify=";

export function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

export function verifyLine(token: string = BOTCENTRAL_VERIFY_TOKEN): string {
  return `${VERIFY_LINE_PREFIX}${token}`;
}

/** The one place that decides a site's token. Card and origin pack both call this. */
export function siteVerifyToken(_site: { domain: string; verifyToken?: string }): string {
  return BOTCENTRAL_VERIFY_TOKEN;
}
