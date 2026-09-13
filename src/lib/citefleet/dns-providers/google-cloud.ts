import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "google-cloud",
  name: "Google Cloud DNS",
  marketShare: 2.6,
  websiteUrl: "https://cloud.google.com/dns",
  accountUrl: "https://console.cloud.google.com/net-services/dns/zones",
  guideUrl: "https://cloud.google.com/dns/docs/records",
  api: {
    status: "public",
    docsUrl: "https://cloud.google.com/dns/docs/reference/v1/changes/create",
  },
  entri: "not-listed",
  nameserverPatterns: [],
  note: "Google Cloud DNS has a public API, but Squarespace can use the same googledomains.com infrastructure; choose manually.",
  sourceUrls: ["https://cloud.google.com/dns/docs/update-name-servers"],
});
