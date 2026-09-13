import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "ibm-ns1",
  name: "IBM NS1 Connect",
  marketShare: 1.3,
  websiteUrl: "https://www.ibm.com/products/ns1-connect",
  accountUrl: "https://my.nsone.net/",
  guideUrl: "https://www.ibm.com/docs/en/ns1-connect?topic=answers-types-dns-records",
  api: {
    status: "public",
    docsUrl: "https://www.ibm.com/docs/en/ns1-connect?topic=introduction-using-api",
  },
  entri: "not-listed",
  nameserverPatterns: [],
  note: "NS1 pool names are also used behind reseller platforms such as Squarespace, so the account owner cannot be inferred safely.",
  sourceUrls: ["https://www.ibm.com/docs/en/ns1-connect?topic=nameservers-nameserver-assignments"],
});
