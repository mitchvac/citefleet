import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "united-internet",
  name: "United Internet / IONOS",
  marketShare: 3.7,
  websiteUrl: "https://www.ionos.com/",
  accountUrl: "https://login.ionos.com/",
  guideUrl:
    "https://www.ionos.com/help/domains/configuring-txt-and-srv-records/managing-txt-records/",
  api: { status: "public", docsUrl: "https://developer.hosting.ionos.com/docs/dns" },
  entri: "brand-dependent",
  nameserverPatterns: ["^ns1\\d{3}\\.ui-dns\\.(?:com|de|biz|org)$"],
  note: "Detection covers IONOS ui-dns nameservers. Entri also lists Strato and United Domains separately.",
  sourceUrls: ["https://www.ionos.com/help/hosting/ionos-apis/ionos-developer-apis/"],
});
