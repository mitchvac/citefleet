import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "aruba",
  name: "Aruba",
  marketShare: 1.2,
  websiteUrl: "https://www.aruba.it/",
  accountUrl: "https://admin.aruba.it/",
  guideUrl:
    "https://guide.aruba.it/hosting-e-domini/gestione-dns/gestione-name-server-e-record/gestire-record-txt-dmarc-dkim-spf",
  api: { status: "not-verified" },
  entri: "automatic",
  nameserverPatterns: [
    "^dns\\.technorail\\.com$",
    "^dns2\\.technorail\\.com$",
    "^dns3\\.arubadns\\.net$",
    "^dns4\\.arubadns\\.cz$",
  ],
  note: "No public Aruba DNS API was verified; Entri lists automatic configuration.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
