import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "hetzner",
  name: "Hetzner",
  marketShare: 0.5,
  websiteUrl: "https://www.hetzner.com/",
  accountUrl: "https://console.hetzner.com/",
  guideUrl: "https://docs.hetzner.com/networking/dns/record-types/txt-record/",
  api: { status: "public", docsUrl: "https://docs.hetzner.cloud/reference/cloud#dns" },
  entri: "automatic",
  nameserverPatterns: [
    "^hydrogen\\.ns\\.hetzner\\.com$",
    "^oxygen\\.ns\\.hetzner\\.com$",
    "^helium\\.ns\\.hetzner\\.de$",
    "^ns1\\.first-ns\\.de$",
    "^robotns[23]\\.second-ns\\.(?:de|com)$",
  ],
  note: "Both current Console DNS nameservers and documented legacy hosting nameservers are recognized.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
