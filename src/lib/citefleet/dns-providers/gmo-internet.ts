import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "gmo-internet",
  name: "GMO Internet / Onamae",
  marketShare: 1.7,
  websiteUrl: "https://www.gmo.jp/en/",
  accountUrl: "https://www.onamae.com/navi/login/",
  guideUrl: "https://support.lolipop.jp/hc/ja/articles/54147182462099",
  api: { status: "not-verified" },
  entri: "not-listed",
  nameserverPatterns: ["^0[1-4]\\.dnsv\\.jp$"],
  note: "Detection covers Onamae's dnsv.jp service only; the GMO group contains distinct DNS products.",
  sourceUrls: ["https://www.onamae.com/"],
});
