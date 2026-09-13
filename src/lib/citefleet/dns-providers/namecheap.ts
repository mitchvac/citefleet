import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "namecheap",
  name: "Namecheap",
  marketShare: 1.9,
  websiteUrl: "https://www.namecheap.com/",
  accountUrl: "https://ap.www.namecheap.com/",
  guideUrl:
    "https://www.namecheap.com/support/knowledgebase/article.aspx/579/2237/which-record-type-option-should-i-choose-for-the-information-im-about-to-enter/",
  api: {
    status: "public",
    docsUrl: "https://www.namecheap.com/support/api/methods/domains-dns/set-hosts/",
    caution:
      "setHosts deletes records omitted from the request; always read and merge the complete set.",
  },
  mcp: {
    status: "official",
    docsUrl: "https://www.namecheap.com/support/knowledgebase/article.aspx/10824/34/namecheap-mcp/",
  },
  entri: "automatic",
  nameserverPatterns: ["^dns[12]\\.registrar-servers\\.com$"],
  note: "Both a public API and official MCP exist; the legacy API's whole-set write needs special care.",
  sourceUrls: ["https://www.namecheap.com/support/api/methods/domains-dns/"],
});
