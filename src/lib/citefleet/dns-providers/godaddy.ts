import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "godaddy",
  name: "GoDaddy",
  marketShare: 9.9,
  websiteUrl: "https://www.godaddy.com/",
  accountUrl: "https://dcc.godaddy.com/",
  guideUrl: "https://www.godaddy.com/help/add-a-txt-record-19232",
  api: {
    status: "public",
    docsUrl: "https://developer.godaddy.com/en/docs/api-users/domains/manage/dns",
    caution:
      "API eligibility varies by account; handle an eligibility refusal as a manual fallback.",
  },
  entri: "automatic",
  nameserverPatterns: ["^ns\\d+\\.domaincontrol\\.com$"],
  note: "The group share is shown; detection covers GoDaddy's domaincontrol.com nameservers.",
  sourceUrls: ["https://www.godaddy.com/help/manage-dns-records-680"],
});
