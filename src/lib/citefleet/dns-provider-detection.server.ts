import { resolveNs } from "node:dns/promises";
import {
  matchDnsProvider,
  normalizeNameserver,
  type DnsProviderDetection,
} from "./dns-provider.ts";
import { DNS_PROVIDERS } from "./dns-providers/index.ts";
import { normalizeDomain } from "./verify-token.ts";

const LOOKUP_TIMEOUT_MS = 4_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 150;

export interface DnsDetectionDeps {
  resolveNs: (domain: string) => Promise<string[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  timeoutMs: number;
}

const defaults: DnsDetectionDeps = {
  resolveNs,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
  timeoutMs: LOOKUP_TIMEOUT_MS,
};

function errorCode(error: unknown): string {
  const candidate =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "DNS_ERROR";
  return /^[A-Z0-9_]+$/.test(candidate) ? candidate : "DNS_ERROR";
}

function retryable(error: unknown): boolean {
  return ["DNS_TIMEOUT", "EAI_AGAIN", "ETIMEOUT", "ESERVFAIL", "SERVFAIL"].includes(
    errorCode(error),
  );
}

async function lookupWithTimeout(domain: string, deps: DnsDetectionDeps): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      deps.resolveNs(domain),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("DNS lookup timed out") as Error & { code: string };
          error.code = "DNS_TIMEOUT";
          reject(error);
        }, deps.timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function detectDnsProvider(
  rawDomain: string,
  overrides: Partial<DnsDetectionDeps> = {},
): Promise<DnsProviderDetection> {
  const deps = { ...defaults, ...overrides };
  const domain = normalizeDomain(rawDomain);
  const checkedAt = deps.now().toISOString();
  if (!domain || !domain.includes(".")) {
    return {
      status: "unreachable",
      domain,
      nameservers: [],
      provider: null,
      candidates: [],
      checkedAt,
      note: "The stored domain is not valid for an authoritative DNS lookup.",
    };
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const nameservers = [
        ...new Set(
          (await lookupWithTimeout(domain, deps)).map(normalizeNameserver).filter(Boolean),
        ),
      ].sort();
      const match = matchDnsProvider(nameservers, DNS_PROVIDERS);
      if (match.status === "matched") {
        return {
          status: "matched",
          domain,
          nameservers,
          provider: { slug: match.provider.slug, name: match.provider.name },
          candidates: [],
          checkedAt,
          note: `All authoritative nameservers match ${match.provider.name}.`,
        };
      }
      const candidates = match.candidates.map(({ slug, name }) => ({ slug, name }));
      return {
        status: match.status,
        domain,
        nameservers,
        provider: null,
        candidates,
        checkedAt,
        note:
          match.status === "ambiguous"
            ? "The delegation is mixed or only partly recognized. Choose the account that actually manages the zone."
            : nameservers.length
              ? "The authoritative nameservers do not map safely to a researched account provider."
              : "No authoritative nameservers were returned.",
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS && retryable(error)) {
        await deps.sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  return {
    status: "unreachable",
    domain,
    nameservers: [],
    provider: null,
    candidates: [],
    checkedAt,
    note: `Authoritative DNS lookup failed (${errorCode(lastError)}). Choose the provider manually.`,
  };
}
