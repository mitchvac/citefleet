import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "alibaba-cloud",
  name: "Alibaba Cloud DNS",
  marketShare: 0.5,
  websiteUrl: "https://www.alibabacloud.com/product/dns",
  accountUrl: "https://dns.console.aliyun.com/",
  guideUrl: "https://www.alibabacloud.com/help/en/dns/pubz-add-parsing-record",
  api: {
    status: "public",
    docsUrl: "https://www.alibabacloud.com/help/en/dns/api-alidns-2015-01-09-adddomainrecord",
  },
  entri: "automatic",
  nameserverPatterns: [
    "^vip[1-8]\\.alidns\\.com$",
    "^ns(?:[1-9]|[12]\\d|3[0-2])\\.hichina\\.com$",
    "^ns[1-8]\\.alidns\\.com$",
  ],
  note: "Free and paid Alibaba Cloud DNS nameserver families are recognized.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
