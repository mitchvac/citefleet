import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "beget",
  name: "Beget",
  marketShare: 0.5,
  websiteUrl: "https://beget.com/",
  accountUrl: "https://cp.beget.com/",
  guideUrl: "https://beget.com/en/kb/manual/dns",
  api: {
    status: "public",
    docsUrl: "https://beget.com/ru/kb/api/funkczii-upravleniya-dns",
    caution:
      "The legacy API accepts account credentials and changes record groups; read and merge before writing.",
  },
  entri: "not-listed",
  nameserverPatterns: ["^ns[12]\\.beget\\.ru$"],
  note: "Beget documents TXT records and a DNS API; Entri does not currently list Beget.",
  sourceUrls: ["https://beget.com/ru/kb/api/beget-api"],
});
