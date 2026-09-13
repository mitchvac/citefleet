import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "automattic",
  name: "WordPress.com / Automattic",
  marketShare: 0.6,
  websiteUrl: "https://wordpress.com/",
  accountUrl: "https://wordpress.com/domains/manage",
  guideUrl: "https://wordpress.com/support/domains/custom-dns/",
  api: {
    status: "restricted",
    caution:
      "WordPress.com exposes DNS through its authenticated product surfaces rather than a general unaffiliated public API.",
  },
  mcp: { status: "official", docsUrl: "https://wordpress.com/support/mcp/mcp-capabilities/" },
  entri: "automatic",
  nameserverPatterns: ["^ns[1-3]\\.wordpress\\.com$"],
  note: "WordPress.com documents an official MCP that can add and remove DNS records.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
