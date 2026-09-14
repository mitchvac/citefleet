// BotCentral proof-of-control token (BotCentral SPEC §4). The registry checks
// that https://<domain>/.well-known/botcentral.txt (plain text, non-HTML) or an
// apex DNS TXT record contains the token the publisher sends on the card
// (`botcentral-verify=<token>` — BotCentral also accepts the bare token anywhere
// in the file). The card and the origin pack must therefore carry the SAME value.
//
// Existing properties keep the shared publisher token chosen in commit f842b9d.
// New properties receive a versioned random token. The prefix matters: older
// snapshots may contain abandoned unversioned random values that were never
// deployed, so accepting every stored string would break their live proof.

export const BOTCENTRAL_VERIFY_TOKEN = "citefleet-app";
export const VERIFY_LINE_PREFIX = "botcentral-verify=";
export const SITE_VERIFY_TOKEN_PREFIX = "cfv1_";

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

export function createSiteVerifyToken(uuid = crypto.randomUUID()): string {
  const entropy = uuid.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(entropy)) throw new Error("invalid proof-token entropy");
  return `${SITE_VERIFY_TOKEN_PREFIX}${entropy}`;
}

/** The one place that decides a site's token. Card, DNS, and origin pack all call this. */
export function siteVerifyToken(site: { domain: string; verifyToken?: string }): string {
  const stored = site.verifyToken?.trim();
  return stored && /^cfv1_[0-9a-f]{32}$/.test(stored) ? stored : BOTCENTRAL_VERIFY_TOKEN;
}
