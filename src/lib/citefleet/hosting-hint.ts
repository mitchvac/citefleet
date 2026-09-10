/**
 * Browser-safe part of hosting detection: the result type, labels, and the
 * operator hint. No node: imports here — CampaignView renders this. Detection
 * itself (DNS + headers) lives in hosting.ts and only runs on the server.
 */

export type HostingProvider =
  | "vercel"
  | "netlify"
  | "github-pages"
  | "cloudflare"
  | "self-hosted"
  | "unreachable"
  | "unknown";

export interface HostingResult {
  provider: HostingProvider;
  label: string;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  /** The origin resolves to the same address as CiteFleet itself (shared box). */
  sameServerAsCiteFleet: boolean;
  /** A push to the connected repo goes live without anyone deploying by hand. */
  deploysOnPush: boolean;
  checkedAt: string;
}

export const LABELS: Record<HostingProvider, string> = {
  vercel: "Vercel",
  netlify: "Netlify",
  "github-pages": "GitHub Pages",
  cloudflare: "Behind Cloudflare",
  "self-hosted": "Self-hosted",
  unreachable: "Unreachable",
  unknown: "Unknown host",
};

/** One sentence the operator can act on, given where the site lives. */
export function hostingHint(hosting: HostingResult | undefined, domain: string): string {
  const file = `public/.well-known/botcentral.txt`;
  switch (hosting?.provider) {
    case "vercel":
    case "netlify":
    case "github-pages":
      return `Quickest is an apex DNS TXT record — no deploy at all. Otherwise ${hosting.label} deploys on push: commit ${file} to the connected repo (Push origin files does it) and the proof is live in about a minute.`;
    case "self-hosted":
      return hosting.sameServerAsCiteFleet
        ? `Quickest is an apex DNS TXT record — no deploy at all. Otherwise, self-hosted on the same box as CiteFleet: rebuild that site's container after ${file} lands.`
        : `Quickest is an apex DNS TXT record — no deploy at all. Otherwise, self-hosted: after ${file} lands in the repo, redeploy ${domain}.`;
    case "cloudflare":
      return `Behind Cloudflare: an apex DNS TXT record is the quickest route. The proof file works too, but it must still be served by the origin as plain text — Cloudflare will not serve it for you.`;
    case "unreachable":
      return `${domain} does not answer over HTTPS right now. An apex DNS TXT record needs no origin at all, so the card can be listed before the site is up; otherwise deploy the site first.`;
    default:
      return `Quickest is an apex DNS TXT record — no deploy at all. Otherwise serve the proof file as plain text at https://${domain}/.well-known/botcentral.txt.`;
  }
}
