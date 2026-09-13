import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "hosting-com",
  name: "Hosting.com / A2 Hosting",
  marketShare: 0.5,
  websiteUrl: "https://hosting.com/",
  accountUrl: "https://my.hosting.com/",
  guideUrl: "https://kb.hosting.com/docs/hosting-com-dns-management",
  api: { status: "not-verified" },
  entri: "automatic",
  nameserverPatterns: ["^ns[1-4]\\.stableserver\\.net$", "^ns[1-4]\\.a2hosting\\.com$"],
  note: "Both current Hosting.com and legacy A2 Hosting nameservers are documented and recognized.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
