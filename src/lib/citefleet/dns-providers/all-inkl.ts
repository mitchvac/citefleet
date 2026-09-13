import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "all-inkl",
  name: "ALL-INKL.COM",
  marketShare: 0.5,
  websiteUrl: "https://all-inkl.com/",
  accountUrl: "https://kas.all-inkl.com/",
  guideUrl:
    "https://all-inkl.com/en/support/tutorials/provider-change/setup/dns/how-to-add-a-txt-record_157.html",
  api: { status: "not-verified" },
  entri: "automatic",
  nameserverPatterns: [],
  note: "KAS has a documented TXT workflow and Entri support; no general-purpose customer DNS API was verified.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
