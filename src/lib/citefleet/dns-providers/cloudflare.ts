import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "cloudflare",
  name: "Cloudflare",
  marketShare: 18.5,
  websiteUrl: "https://www.cloudflare.com/",
  accountUrl: "https://dash.cloudflare.com/",
  guideUrl: "https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/",
  api: { status: "public", docsUrl: "https://developers.cloudflare.com/api/resources/dns/" },
  mcp: {
    status: "official",
    docsUrl:
      "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/",
  },
  entri: "automatic",
  nameserverPatterns: [
    "^[a-z0-9-]+\\.ns\\.cloudflare\\.com$",
    "^[a-z]+\\.foundationdns\\.(?:com|net|org)$",
    "^[a-z0-9-]+\\.secondary\\.cloudflare\\.com$",
  ],
  note: "Standard and Foundation DNS nameservers are detectable; custom nameservers require a manual choice.",
  sourceUrls: ["https://developers.cloudflare.com/dns/nameservers/"],
});
