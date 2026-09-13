import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "amazon-route53",
  name: "Amazon Route 53",
  marketShare: 3.4,
  websiteUrl: "https://aws.amazon.com/route53/",
  accountUrl: "https://console.aws.amazon.com/route53/",
  guideUrl:
    "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html",
  api: {
    status: "public",
    docsUrl:
      "https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html",
  },
  entri: "automatic",
  nameserverPatterns: ["^ns-\\d+\\.awsdns-\\d+\\.(?:com|net|org|co\\.uk)$"],
  note: "Route 53 changes are transactional; verify GetChange reaches INSYNC.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
