// Browser-safe DNS provider data and matching primitives. Network lookup lives
// in dns-provider-detection.server.ts; components may import this module.

export type DnsApiStatus = "public" | "restricted" | "not-verified";
export type DnsMcpStatus = "official" | "not-verified";
export type EntriCoverage = "automatic" | "brand-dependent" | "not-listed";

export interface DnsCapability {
  status: DnsApiStatus;
  docsUrl?: string;
  caution?: string;
}

export interface DnsMcpCapability {
  status: DnsMcpStatus;
  docsUrl?: string;
}

export interface DnsProvider {
  slug: string;
  name: string;
  /** W3Techs group share on the registry's checked date, or null when not measured. */
  marketShare: number | null;
  websiteUrl: string;
  accountUrl?: string;
  guideUrl: string;
  api: DnsCapability;
  mcp: DnsMcpCapability;
  entri: EntriCoverage;
  /** Anchored, case-insensitive patterns over normalized authoritative NS hosts. */
  nameserverPatterns: readonly string[];
  note: string;
  sourceUrls: readonly string[];
  checkedAt: string;
}

export type DnsProviderInput = Omit<DnsProvider, "checkedAt" | "mcp"> & {
  mcp?: DnsMcpCapability;
  checkedAt?: string;
};

export const DNS_RESEARCH_DATE = "2026-09-12";
export const DNS_MARKET_SOURCE = "https://w3techs.com/technologies/overview/dns_server";
export const ENTRI_AUTO_PROVIDER_SLUG = "entri-auto";

export function defineDnsProvider(input: DnsProviderInput): DnsProvider {
  return Object.freeze({
    ...input,
    mcp: input.mcp ?? { status: "not-verified" as const },
    checkedAt: input.checkedAt ?? DNS_RESEARCH_DATE,
  });
}

export function normalizeNameserver(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function providerMatches(provider: DnsProvider, nameserver: string): boolean {
  return provider.nameserverPatterns.some((source) => new RegExp(source, "i").test(nameserver));
}

export type DnsProviderMatch =
  | { status: "matched"; provider: DnsProvider; candidates: readonly DnsProvider[] }
  | { status: "ambiguous"; provider: null; candidates: readonly DnsProvider[] }
  | { status: "unknown"; provider: null; candidates: readonly DnsProvider[] };

export interface DnsProviderDetection {
  status: "matched" | "ambiguous" | "unknown" | "unreachable";
  domain: string;
  nameservers: string[];
  provider: { slug: string; name: string } | null;
  candidates: Array<{ slug: string; name: string }>;
  checkedAt: string;
  note: string;
}

export interface DnsSetupSettings {
  state: "ready" | "off" | "misconfigured";
  service: "entri";
  docsUrl: string;
}

export interface CloudflareDnsSettings {
  state: "ready" | "off" | "misconfigured";
  service: "cloudflare";
  startPath: string;
  docsUrl: string;
}

export interface DnsAutomationSettings {
  entri: DnsSetupSettings;
  cloudflare: CloudflareDnsSettings;
}

export interface DnsSetupLink {
  link: string;
  jobId: string;
}

export function readEntriJobId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const jobId = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)
    ? jobId.toLowerCase()
    : null;
}

export function dnsSetupOperationId(
  setup: { operationId?: string; jobId?: string } | undefined,
): string | null {
  return setup?.operationId?.trim() || setup?.jobId?.trim() || null;
}

export function dnsProviderActions(
  provider: DnsProvider | undefined,
  settings: DnsSetupSettings | null,
): { guided: boolean; accountUrl: string | null } {
  return {
    guided: Boolean(settings?.state === "ready" && (!provider || provider.entri !== "not-listed")),
    accountUrl: provider?.accountUrl ?? null,
  };
}

/**
 * Fail closed: every authoritative nameserver must identify the same provider.
 * A mixed delegation or one unmatched host is ambiguous, never guessed.
 */
export function matchDnsProvider(
  rawNameservers: readonly string[],
  providers: readonly DnsProvider[],
): DnsProviderMatch {
  const nameservers = [...new Set(rawNameservers.map(normalizeNameserver).filter(Boolean))];
  if (!nameservers.length) return { status: "unknown", provider: null, candidates: [] };

  const complete = providers.filter(
    (provider) =>
      provider.nameserverPatterns.length > 0 &&
      nameservers.every((nameserver) => providerMatches(provider, nameserver)),
  );
  if (complete.length === 1) {
    return { status: "matched", provider: complete[0], candidates: complete };
  }

  const partial = providers.filter((provider) =>
    nameservers.some((nameserver) => providerMatches(provider, nameserver)),
  );
  const candidates = complete.length > 1 ? complete : partial;
  return candidates.length
    ? { status: "ambiguous", provider: null, candidates }
    : { status: "unknown", provider: null, candidates: [] };
}

export function validateDnsProviders(providers: readonly DnsProvider[]): void {
  const slugs = new Set<string>();
  for (const provider of providers) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(provider.slug)) {
      throw new Error(`invalid DNS provider slug: ${provider.slug}`);
    }
    if (slugs.has(provider.slug)) throw new Error(`duplicate DNS provider: ${provider.slug}`);
    slugs.add(provider.slug);
    if (
      provider.marketShare !== null &&
      !(provider.marketShare > 0 && provider.marketShare <= 100)
    ) {
      throw new Error(`invalid market share for ${provider.slug}`);
    }
    for (const url of [
      provider.websiteUrl,
      provider.accountUrl,
      provider.guideUrl,
      provider.api.docsUrl,
      provider.mcp.docsUrl,
      ...provider.sourceUrls,
    ].filter((value): value is string => Boolean(value))) {
      if (new URL(url).protocol !== "https:") throw new Error(`insecure URL for ${provider.slug}`);
    }
    for (const source of provider.nameserverPatterns) {
      if (!source.startsWith("^") || !source.endsWith("$")) {
        throw new Error(`unanchored nameserver pattern for ${provider.slug}: ${source}`);
      }
      // Compile during validation so a typo fails tests instead of a customer lookup.
      new RegExp(source, "i");
    }
  }
}
