import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "microsoft-azure",
  name: "Microsoft Azure DNS",
  marketShare: 0.5,
  websiteUrl: "https://azure.microsoft.com/products/dns",
  accountUrl: "https://portal.azure.com/",
  guideUrl: "https://learn.microsoft.com/en-us/azure/dns/dns-operations-recordsets-portal",
  api: { status: "public", docsUrl: "https://learn.microsoft.com/en-us/rest/api/dns/record-sets" },
  entri: "not-listed",
  nameserverPatterns: ["^ns[1-4]-\\d+\\.azure-dns\\.(?:com|net|org|info)$"],
  note: "Azure DNS has a public REST API but is not named on Entri's current provider list.",
  sourceUrls: ["https://learn.microsoft.com/en-us/azure/dns/dns-zones-records"],
});
