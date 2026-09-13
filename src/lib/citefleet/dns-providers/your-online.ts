import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "your-online",
  name: "Your.Online",
  marketShare: 1.0,
  websiteUrl: "https://your.online/",
  guideUrl: "https://api.gandi.net/docs/livedns/",
  api: {
    status: "restricted",
    docsUrl: "https://api.gandi.net/docs/livedns/",
    caution: "Gandi has LiveDNS; other group brands use different APIs or manual panels.",
  },
  entri: "brand-dependent",
  nameserverPatterns: [],
  note: "Gandi and o2switch are on Entri's list, but there is no safe group-wide nameserver fingerprint.",
  sourceUrls: ["https://your.online/brands/", "https://developers.entri.com/connect/provider-list"],
});
