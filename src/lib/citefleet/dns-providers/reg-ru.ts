import { defineDnsProvider } from "../dns-provider.ts";

export default defineDnsProvider({
  slug: "reg-ru",
  name: "REG.RU",
  marketShare: 0.8,
  websiteUrl: "https://www.reg.ru/",
  accountUrl: "https://www.reg.ru/user/account/",
  guideUrl:
    "https://help.reg.ru/support/dns-servery-i-nastroyka-zony/nastroyka-resursnykh-zapisey-dns/nastroyka-resursnykh-zapisey-v-lichnom-kabinete",
  api: { status: "not-verified" },
  entri: "not-listed",
  nameserverPatterns: ["^ns[12]\\.reg\\.ru$", "^ns[1256]\\.hosting\\.reg\\.ru$"],
  note: "Manual apex TXT setup is documented; no public arbitrary DNS write API was verified.",
  sourceUrls: [
    "https://help.reg.ru/support/vydelennyye-servery-i-dc/dedicated/zakaz-i-nastroyka-dedicated/nastroyka-dns-dlya-dedicated-vydelennogo-servera",
  ],
});
