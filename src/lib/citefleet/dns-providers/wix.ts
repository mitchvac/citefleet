import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "wix",
  name: "Wix",
  marketShare: 3.7,
  websiteUrl: "https://www.wix.com/",
  accountUrl: "https://manage.wix.com/account/sites",
  guideUrl: "https://support.wix.com/en/article/adding-or-updating-txt-records-in-your-wix-account",
  api: { status: "not-verified" },
  entri: "automatic",
  nameserverPatterns: ["^ns\\d+\\.wixdns\\.net$"],
  note: "No public general-purpose Wix DNS write API was verified; Entri lists Wix automatic configuration.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
