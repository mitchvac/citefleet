import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "xserver",
  name: "XServer",
  marketShare: 1.3,
  websiteUrl: "https://www.xserver.ne.jp/",
  accountUrl: "https://secure.xserver.ne.jp/xapanel/login/xserver/",
  guideUrl: "https://www.xserver.ne.jp/manual/",
  api: { status: "not-verified" },
  entri: "not-listed",
  nameserverPatterns: ["^ns[1-5]\\.xserver\\.jp$"],
  note: "XServer documents manual DNS record settings; no public arbitrary-record API was verified.",
  sourceUrls: ["https://www.xserver.ne.jp/"],
});
