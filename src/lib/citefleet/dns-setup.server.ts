import type { Site } from "./types.ts";
import { proofRecord } from "./proof-record.ts";
import { readEntriJobId, type DnsSetupLink, type DnsSetupSettings } from "./dns-provider.ts";

const TOKEN_URL = "https://api.goentri.com/token";
const SHARE_URL = "https://api.goentri.com/sharing/connect";
const DOCS_URL = "https://developers.entri.com/connect/shared-links";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 200;

class DnsSetupServiceError extends Error {}

interface EntriCredentials {
  applicationId: string;
  secret: string;
  shareHost: string;
}

export interface DnsSetupDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  credentials: () => EntriCredentials;
  timeoutMs: number;
}

function credentialsFromEnv(): EntriCredentials {
  return {
    applicationId: (process.env.CITEFLEET_ENTRI_APPLICATION_ID || "").trim(),
    secret: (process.env.CITEFLEET_ENTRI_SECRET || "").trim(),
    shareHost: (process.env.CITEFLEET_ENTRI_SHARE_HOST || "app.goentri.com").trim().toLowerCase(),
  };
}

const defaults: DnsSetupDeps = {
  fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  credentials: credentialsFromEnv,
  timeoutMs: REQUEST_TIMEOUT_MS,
};

export function dnsSetupSettings(
  readCredentials: () => EntriCredentials = credentialsFromEnv,
): DnsSetupSettings {
  const credentials = readCredentials();
  const state =
    credentials.applicationId && credentials.secret && validShareHost(credentials.shareHost)
      ? "ready"
      : credentials.applicationId || credentials.secret || !validShareHost(credentials.shareHost)
        ? "misconfigured"
        : "off";
  return { state, service: "entri", docsUrl: DOCS_URL };
}

function validShareHost(value: string): boolean {
  return (
    value.length <= 253 &&
    value.includes(".") &&
    !value.includes("..") &&
    value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  );
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The status is already known; cleanup failure must not replace it.
  }
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  deps: DnsSetupDeps,
): Promise<Record<string, unknown>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
    try {
      const response = await deps.fetch(url, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        await discard(response);
        if (attempt < MAX_ATTEMPTS && shouldRetry(response.status)) {
          await deps.sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new DnsSetupServiceError(
          `DNS setup service refused the request (${response.status}).`,
        );
      }
      const value = await response.json().catch(() => null);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new DnsSetupServiceError("DNS setup service returned an invalid response.");
      }
      return value as Record<string, unknown>;
    } catch (error) {
      if (error instanceof DnsSetupServiceError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        if (attempt < MAX_ATTEMPTS) {
          await deps.sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new Error("DNS setup service timed out.");
      }
      if (attempt < MAX_ATTEMPTS) {
        await deps.sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new Error("DNS setup service is unavailable.");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("DNS setup service is unavailable.");
}

function validShareLink(value: unknown, expectedHost: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname.toLowerCase() === expectedHost &&
      (url.port === "" || url.port === "443") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/share\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function createDnsSetupLink(
  site: Pick<Site, "domain">,
  userId: string,
  overrides: Partial<DnsSetupDeps> = {},
): Promise<DnsSetupLink> {
  const deps = { ...defaults, ...overrides };
  const credentials = deps.credentials();
  if (!credentials.applicationId || !credentials.secret) {
    throw new Error("Guided DNS setup is not configured.");
  }
  if (!validShareHost(credentials.shareHost)) {
    throw new Error("Guided DNS setup has an invalid sharing host.");
  }

  const record = proofRecord(site);
  const dnsRecords = [{ type: record.type, host: record.name, value: record.value, ttl: 300 }];
  const tokenResult = await postJson(
    TOKEN_URL,
    {
      applicationId: credentials.applicationId,
      secret: credentials.secret,
      domain: record.apex,
      userId,
      dnsRecords,
    },
    {},
    deps,
  );
  const token = tokenResult.auth_token;
  if (typeof token !== "string" || token.length < 16) {
    throw new Error("DNS setup service did not issue an authorization token.");
  }

  const shareResult = await postJson(
    SHARE_URL,
    {
      applicationId: credentials.applicationId,
      config: {
        applicationName: "CiteFleet",
        prefilledDomain: record.apex,
        userId,
        dnsRecords,
        checkConflicts: true,
      },
    },
    {
      Authorization: `Bearer ${token}`,
      applicationId: credentials.applicationId,
    },
    deps,
  );
  const link = validShareLink(shareResult.link, credentials.shareHost);
  const jobId = readEntriJobId(shareResult.job_id);
  if (!link || !jobId) {
    throw new Error("DNS setup service returned an invalid sharing link.");
  }
  return { link, jobId };
}
