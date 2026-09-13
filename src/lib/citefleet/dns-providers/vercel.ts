import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "vercel",
  name: "Vercel DNS",
  marketShare: 0.7,
  websiteUrl: "https://vercel.com/",
  accountUrl: "https://vercel.com/dashboard",
  guideUrl: "https://vercel.com/docs/domains/managing-dns-records",
  api: { status: "public", docsUrl: "https://vercel.com/docs/rest-api/reference/endpoints/dns" },
  entri: "automatic",
  nameserverPatterns: ["^ns[12]\\.vercel-dns\\.com$"],
  note: "Detection applies only when Vercel is authoritative, not when a domain merely points at a Vercel deployment.",
  sourceUrls: ["https://developers.entri.com/connect/provider-list"],
});
