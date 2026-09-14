import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "porkbun",
  name: "Porkbun",
  marketShare: null,
  websiteUrl: "https://porkbun.com/",
  accountUrl: "https://porkbun.com/account/login",
  guideUrl: "https://kb.porkbun.com/article/68-how-to-edit-dns-records",
  api: {
    status: "public",
    docsUrl: "https://porkbun.com/api/json/v3/documentation",
    caution: "Enable API access only for the intended domain and use domain-scoped credentials.",
  },
  mcp: {
    status: "official",
    docsUrl: "https://porkbun.com/mcp",
  },
  entri: "automatic",
  nameserverPatterns: ["^(?:maceio|curitiba|salvador|fortaleza)\\.ns\\.porkbun\\.com$"],
  note: "Entri supports guided setup; Porkbun also provides a public DNS API and official MCP.",
  sourceUrls: [
    "https://kb.porkbun.com/article/153-how-to-add-your-external-domain-to-your-porkbun-account",
    "https://porkbun.com/api/json/v3/documentation",
    "https://porkbun.com/mcp",
    "https://www.entri.com/2025-site/blog/porkbun-added-to-entri-supported-dns-providers",
  ],
  checkedAt: "2026-09-14",
});
