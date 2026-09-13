import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "ovh",
  name: "OVHcloud",
  marketShare: 1.9,
  websiteUrl: "https://www.ovhcloud.com/",
  accountUrl: "https://www.ovh.com/manager/",
  guideUrl: "https://docs.ovhcloud.com/en/guides/web-cloud/domains/dns-zone-txt-record-creation",
  api: {
    status: "public",
    docsUrl: "https://docs.ovhcloud.com/en/guides/manage-and-operate/api/first-steps",
  },
  entri: "automatic",
  nameserverPatterns: [],
  note: "OVH has several nameserver families; no single safe public fingerprint was verified, so selection is manual.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
