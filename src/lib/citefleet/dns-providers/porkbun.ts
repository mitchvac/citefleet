import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "porkbun",
  name: "Porkbun",
  marketShare: null,
  websiteUrl: "https://porkbun.com/",
  accountUrl: "https://porkbun.com/account/api",
  guideUrl: "https://kb.porkbun.com/article/231-how-to-add-dns-records-on-porkbun",
  api: {
    status: "public",
    docsUrl: "https://porkbun.com/api/json/v3/documentation",
    caution:
      "CiteFleet uses the generated key only for the intended domain; remove it after the DNS record verifies.",
  },
  mcp: {
    status: "official",
    docsUrl: "https://porkbun.com/mcp",
  },
  entri: "automatic",
  nameserverPatterns: ["^(?:maceio|curitiba|salvador|fortaleza)\\.ns\\.porkbun\\.com$"],
  note: "CiteFleet uses Porkbun's browser approval to add the exact proof record automatically.",
  sourceUrls: [
    "https://kb.porkbun.com/article/231-how-to-add-dns-records-on-porkbun",
    "https://porkbun.com/api/json/v3/documentation",
    "https://porkbun.com/mcp",
    "https://www.entri.com/2025-site/blog/porkbun-added-to-entri-supported-dns-providers",
  ],
  checkedAt: "2026-09-14",
});
