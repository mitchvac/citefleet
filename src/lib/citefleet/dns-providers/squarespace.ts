import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "squarespace",
  name: "Squarespace",
  marketShare: 0.9,
  websiteUrl: "https://www.squarespace.com/",
  accountUrl: "https://account.squarespace.com/",
  guideUrl: "https://support.squarespace.com/hc/en-us/articles/31120980444429-Adding-TXT-records",
  api: { status: "not-verified" },
  entri: "automatic",
  nameserverPatterns: [],
  note: "Squarespace says its nameserver suffixes can also appear at other providers, so automatic detection is disabled.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
