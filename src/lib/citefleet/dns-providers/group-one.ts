import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "group-one",
  name: "group.one / one.com",
  marketShare: 1.1,
  websiteUrl: "https://group.one/",
  accountUrl: "https://login.one.com/",
  guideUrl: "https://help.one.com/hc/en-us/articles/360000825478-How-do-I-create-a-TXT-record",
  api: {
    status: "restricted",
    caution:
      "Brands have different or reseller-only APIs; no group-wide customer API was verified.",
  },
  entri: "brand-dependent",
  nameserverPatterns: ["^ns0[12]\\.one\\.com$"],
  note: "Detection and account link cover one.com; the group has many independent brand panels.",
  sourceUrls: ["https://group.one/brands", "https://developers.entri.com/connect/provider-list"],
});
