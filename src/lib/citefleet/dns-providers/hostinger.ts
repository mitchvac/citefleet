import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "hostinger",
  name: "Hostinger",
  marketShare: 4.6,
  websiteUrl: "https://www.hostinger.com/",
  accountUrl: "https://hpanel.hostinger.com/",
  guideUrl: "https://www.hostinger.com/support/1583664-how-to-manage-txt-records-at-hostinger/",
  api: {
    status: "public",
    docsUrl: "https://developers.hostinger.com/#tag/dns-zone",
    caution: "An overwrite request can replace an RRset; read, merge, write, then verify.",
  },
  entri: "automatic",
  nameserverPatterns: ["^ns[12]\\.dns-parking\\.com$"],
  note: "Hostinger documents automatic setup through Entri and a public DNS Zone API.",
  sourceUrls: ["https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/"],
});
