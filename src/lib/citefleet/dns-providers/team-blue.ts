import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "team-blue",
  name: "team.blue",
  marketShare: 2.8,
  websiteUrl: "https://team.blue/",
  guideUrl: "https://www.transip.eu/knowledgebase/527-the-dns-settings-web-hosting",
  api: {
    status: "restricted",
    docsUrl: "https://api.transip.nl/rest/docs.html",
    caution: "The group has many brands; API access is brand-specific.",
  },
  entri: "brand-dependent",
  nameserverPatterns: ["^ns0\\.transip\\.net$", "^ns1\\.transip\\.nl$", "^ns2\\.transip\\.eu$"],
  note: "Detection covers TransIP only. Entri separately lists TransIP, Register.it, Simply and Papaki.",
  sourceUrls: [
    "https://team.blue/our-brands/",
    "https://developers.entri.com/connect/provider-list",
  ],
});
