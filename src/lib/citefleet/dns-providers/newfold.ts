import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "newfold",
  name: "Newfold Digital",
  marketShare: 3.6,
  websiteUrl: "https://newfold.com/",
  guideUrl: "https://www.networksolutions.com/help/article/manage-dns-adns-records",
  api: { status: "not-verified" },
  entri: "brand-dependent",
  nameserverPatterns: [],
  note: "Bluehost, HostGator, Network Solutions and other brands use different panels and nameservers; choose this group manually.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
