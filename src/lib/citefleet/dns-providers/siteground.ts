import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "siteground",
  name: "SiteGround",
  marketShare: 1.4,
  websiteUrl: "https://www.siteground.com/",
  accountUrl: "https://my.siteground.com/",
  guideUrl: "https://www.siteground.com/kb/manage-dns-records-site-tools",
  api: { status: "not-verified" },
  entri: "automatic",
  nameserverPatterns: ["^ns[12]\\.siteground\\.net$"],
  note: "No public SiteGround DNS API was verified; Entri lists automatic configuration.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
