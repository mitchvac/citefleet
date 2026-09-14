import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  dnsProviderActions,
  DNS_MARKET_SOURCE,
  ENTRI_AUTO_PROVIDER_SLUG,
  matchDnsProvider,
  readEntriJobId,
  validateDnsProviders,
} from "./dns-provider.ts";
import { DNS_PROVIDERS, DNS_PROVIDER_MARKET_SHARE } from "./dns-providers/index.ts";

test("the registry has one source file per provider and an honest measured share", () => {
  const files = readdirSync(path.resolve(import.meta.dirname, "dns-providers"))
    .filter((name) => name.endsWith(".ts") && name !== "index.ts")
    .map((name) => name.slice(0, -3))
    .sort();
  assert.deepEqual(files, DNS_PROVIDERS.map(({ slug }) => slug).sort());
  assert.equal(DNS_PROVIDERS.length, 30);
  assert.equal(DNS_PROVIDER_MARKET_SHARE, 72.3);
  assert.equal(DNS_MARKET_SOURCE, "https://w3techs.com/technologies/overview/dns_server");
  assert.doesNotThrow(() => validateDnsProviders(DNS_PROVIDERS));
});

test("the checked W3Techs snapshot pins every group share, not only the total", () => {
  assert.deepEqual(
    DNS_PROVIDERS.map(({ slug, marketShare }) => [slug, marketShare]),
    [
      ["cloudflare", 18.5],
      ["godaddy", 9.9],
      ["hostinger", 4.6],
      ["united-internet", 3.7],
      ["wix", 3.7],
      ["newfold", 3.6],
      ["amazon-route53", 3.4],
      ["team-blue", 2.8],
      ["google-cloud", 2.6],
      ["namecheap", 1.9],
      ["ovh", 1.9],
      ["gmo-internet", 1.7],
      ["siteground", 1.4],
      ["ibm-ns1", 1.3],
      ["xserver", 1.3],
      ["aruba", 1.2],
      ["group-one", 1.1],
      ["your-online", 1],
      ["squarespace", 0.9],
      ["reg-ru", 0.8],
      ["sakura", 0.7],
      ["vercel", 0.7],
      ["automattic", 0.6],
      ["hetzner", 0.5],
      ["all-inkl", 0.5],
      ["microsoft-azure", 0.5],
      ["beget", 0.5],
      ["alibaba-cloud", 0.5],
      ["hosting-com", 0.5],
      ["porkbun", null],
    ],
  );
});

test("matching normalizes case and a trailing dot without accepting suffix attacks", () => {
  const good = matchDnsProvider(["ADA.NS.CLOUDFLARE.COM.", "BOB.NS.CLOUDFLARE.COM"], DNS_PROVIDERS);
  assert.equal(good.status, "matched");
  assert.equal(good.provider?.slug, "cloudflare");
  assert.equal(
    matchDnsProvider(["ada.ns.cloudflare.com.evil.test"], DNS_PROVIDERS).status,
    "unknown",
  );
  assert.equal(matchDnsProvider(["notcloudflare.com"], DNS_PROVIDERS).status, "unknown");
});

test("Porkbun is selectable, detectable, and backed by verified automation links", () => {
  const porkbun = DNS_PROVIDERS.find((provider) => provider.slug === "porkbun");
  assert.ok(porkbun);
  assert.equal(porkbun.marketShare, null);
  assert.equal(porkbun.api.status, "public");
  assert.equal(porkbun.mcp.status, "official");
  assert.equal(porkbun.entri, "automatic");
  assert.equal(
    dnsProviderActions(porkbun, {
      state: "ready",
      service: "entri",
      docsUrl: "https://developers.entri.com/connect/shared-links",
    }).guided,
    true,
  );
  assert.equal(
    matchDnsProvider(
      ["MACEIO.NS.PORKBUN.COM.", "curitiba.ns.porkbun.com", "salvador.ns.porkbun.com"],
      DNS_PROVIDERS,
    ).provider?.slug,
    "porkbun",
  );
  assert.equal(
    matchDnsProvider(["maceio.ns.porkbun.com.evil.test"], DNS_PROVIDERS).status,
    "unknown",
  );
});

test("mixed or partial delegations are ambiguous instead of guessed", () => {
  const mixed = matchDnsProvider(["ada.ns.cloudflare.com", "ns1.domaincontrol.com"], DNS_PROVIDERS);
  assert.equal(mixed.status, "ambiguous");
  assert.deepEqual(mixed.candidates.map(({ slug }) => slug).sort(), ["cloudflare", "godaddy"]);
  const partial = matchDnsProvider(
    ["ada.ns.cloudflare.com", "ns1.customer.example"],
    DNS_PROVIDERS,
  );
  assert.equal(partial.status, "ambiguous");
  assert.deepEqual(
    partial.candidates.map(({ slug }) => slug),
    ["cloudflare"],
  );
});

test("shared Squarespace infrastructure is never assigned to a Google or NS1 account", () => {
  assert.equal(
    matchDnsProvider(["ns-cloud-a1.googledomains.com"], DNS_PROVIDERS).status,
    "unknown",
  );
  assert.equal(matchDnsProvider(["dns1.p03.nsone.net"], DNS_PROVIDERS).status, "unknown");
});

test("capability claims carry official HTTPS evidence and destructive APIs carry cautions", () => {
  for (const provider of DNS_PROVIDERS) {
    assert.ok(provider.sourceUrls.length > 0, provider.slug);
    if (provider.api.status === "public") assert.ok(provider.api.docsUrl, provider.slug);
  }
  assert.match(DNS_PROVIDERS.find((p) => p.slug === "namecheap")!.api.caution!, /read and merge/i);
  assert.equal(DNS_PROVIDERS.find((p) => p.slug === "namecheap")!.mcp.status, "official");
  assert.match(DNS_PROVIDERS.find((p) => p.slug === "porkbun")!.api.caution!, /intended domain/i);
});

test("guided setup never removes the verified manual account fallback", () => {
  const cloudflare = DNS_PROVIDERS.find((provider) => provider.slug === "cloudflare")!;
  const ready = {
    state: "ready" as const,
    service: "entri" as const,
    docsUrl: "https://developers.entri.com/connect/shared-links",
  };
  assert.deepEqual(dnsProviderActions(cloudflare, ready), {
    guided: true,
    accountUrl: cloudflare.accountUrl,
  });
  assert.deepEqual(dnsProviderActions(cloudflare, { ...ready, state: "off" }), {
    guided: false,
    accountUrl: cloudflare.accountUrl,
  });

  const ns1 = DNS_PROVIDERS.find((provider) => provider.slug === "ibm-ns1")!;
  assert.equal(dnsProviderActions(ns1, ready).guided, false);
  assert.deepEqual(dnsProviderActions(undefined, ready), {
    guided: true,
    accountUrl: null,
  });
  assert.equal(dnsProviderActions(undefined, { ...ready, state: "off" }).guided, false);
  assert.equal(ENTRI_AUTO_PROVIDER_SLUG, "entri-auto");
});

test("Entri job ids accept only canonical UUID-shaped values", () => {
  assert.equal(
    readEntriJobId(" 9C128FE4-63CD-4EC4-9AE8-8A9D06C0E6DE "),
    "9c128fe4-63cd-4ec4-9ae8-8a9d06c0e6de",
  );
  assert.equal(readEntriJobId("job-123"), null);
  assert.equal(readEntriJobId(null), null);
});
