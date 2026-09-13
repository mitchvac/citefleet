import cloudflare from "./cloudflare.ts";
import godaddy from "./godaddy.ts";
import hostinger from "./hostinger.ts";
import unitedInternet from "./united-internet.ts";
import wix from "./wix.ts";
import newfold from "./newfold.ts";
import amazonRoute53 from "./amazon-route53.ts";
import teamBlue from "./team-blue.ts";
import googleCloud from "./google-cloud.ts";
import namecheap from "./namecheap.ts";
import ovh from "./ovh.ts";
import gmoInternet from "./gmo-internet.ts";
import siteground from "./siteground.ts";
import ibmNs1 from "./ibm-ns1.ts";
import xserver from "./xserver.ts";
import aruba from "./aruba.ts";
import groupOne from "./group-one.ts";
import yourOnline from "./your-online.ts";
import squarespace from "./squarespace.ts";
import regRu from "./reg-ru.ts";
import sakura from "./sakura.ts";
import vercel from "./vercel.ts";
import automattic from "./automattic.ts";
import hetzner from "./hetzner.ts";
import allInkl from "./all-inkl.ts";
import microsoftAzure from "./microsoft-azure.ts";
import beget from "./beget.ts";
import alibabaCloud from "./alibaba-cloud.ts";
import hostingCom from "./hosting-com.ts";
import { validateDnsProviders } from "../dns-provider.ts";

export const DNS_PROVIDERS = Object.freeze([
  cloudflare,
  godaddy,
  hostinger,
  unitedInternet,
  wix,
  newfold,
  amazonRoute53,
  teamBlue,
  googleCloud,
  namecheap,
  ovh,
  gmoInternet,
  siteground,
  ibmNs1,
  xserver,
  aruba,
  groupOne,
  yourOnline,
  squarespace,
  regRu,
  sakura,
  vercel,
  automattic,
  hetzner,
  allInkl,
  microsoftAzure,
  beget,
  alibabaCloud,
  hostingCom,
]);

validateDnsProviders(DNS_PROVIDERS);

export const DNS_PROVIDER_MARKET_SHARE = Number(
  DNS_PROVIDERS.reduce((sum, provider) => sum + provider.marketShare, 0).toFixed(1),
);

export function dnsProviderBySlug(slug: string) {
  return DNS_PROVIDERS.find((provider) => provider.slug === slug);
}
