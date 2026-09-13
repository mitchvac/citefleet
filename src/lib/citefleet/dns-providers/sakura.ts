import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "sakura",
  name: "Sakura Internet",
  marketShare: 0.7,
  websiteUrl: "https://www.sakura.ad.jp/",
  accountUrl: "https://secure.sakura.ad.jp/menu/",
  guideUrl: "https://help.sakura.ad.jp/domain/2144/",
  api: { status: "not-verified" },
  entri: "not-listed",
  nameserverPatterns: ["^ns[12]\\.dns\\.ne\\.jp$"],
  note: "The control panel can edit zones using Sakura nameservers; no public DNS write API was verified.",
  sourceUrls: ["https://help.sakura.ad.jp/domain/2149/"],
});
