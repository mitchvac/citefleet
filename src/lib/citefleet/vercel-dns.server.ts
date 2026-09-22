import type { VercelDnsSettings } from "./dns-provider.ts";
import { normalizeDomain } from "./verify-token.ts";

const INSTALL_URL = "https://vercel.com/integrations";
const TOKEN_URL = "https://api.vercel.com/v2/oauth/access_token";
const API_URL = "https://api.vercel.com";
const DOCS_URL = "https://vercel.com/docs/integrations/create-integration/submit-integration";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_RECORD_PAGES = 20;

export interface VercelOAuthConfig {
  integrationSlug: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface VercelDnsDeps {
  fetch: typeof fetch;
}

export interface VercelAuthorization {
  accessToken: string;
  installationId?: string;
  teamId: string | null;
}

function publicOrigin(env: NodeJS.ProcessEnv): string {
  const raw = (env.CITEFLEET_PUBLIC_URL || env.PUBLIC_ORIGIN || "https://citefleet.app").trim();
  const url = new URL(raw);
  const localHttp =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
    throw new Error("CiteFleet public URL is invalid");
  }
  return url.origin;
}

export function vercelOAuthConfig(env: NodeJS.ProcessEnv = process.env): VercelOAuthConfig | null {
  const integrationSlug = env.CITEFLEET_VERCEL_INTEGRATION_SLUG?.trim() ?? "";
  const clientId = env.CITEFLEET_VERCEL_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.CITEFLEET_VERCEL_CLIENT_SECRET?.trim() ?? "";
  if (!integrationSlug && !clientId && !clientSecret) return null;
  if (!integrationSlug || !clientId || !clientSecret) throw new Error("Vercel OAuth is incomplete");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(integrationSlug)) {
    throw new Error("Vercel integration slug is invalid");
  }
  return {
    integrationSlug,
    clientId,
    clientSecret,
    redirectUri: `${publicOrigin(env)}/api/dns/vercel/callback`,
  };
}

export function vercelDnsSettings(env: NodeJS.ProcessEnv = process.env): VercelDnsSettings {
  try {
    return {
      state: vercelOAuthConfig(env) ? "ready" : "off",
      service: "vercel",
      startPath: "/api/dns/vercel/start",
      docsUrl: DOCS_URL,
    };
  } catch {
    return {
      state: "misconfigured",
      service: "vercel",
      startPath: "/api/dns/vercel/start",
      docsUrl: DOCS_URL,
    };
  }
}

export function vercelAuthorizationUrl(config: VercelOAuthConfig, state: string): string {
  const url = new URL(`${INSTALL_URL}/${encodeURIComponent(config.integrationSlug)}/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

export function vercelCompletionUrl(raw: string | null): string | null {
  if (!raw || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "vercel.com" && !url.hostname.endsWith(".vercel.com")) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_RESPONSE_BYTES) throw new Error("Vercel response was too large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Vercel response was too large");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Vercel returned an invalid response");
  }
}

function teamQuery(teamId: string | null): string {
  return teamId ? `teamId=${encodeURIComponent(teamId)}` : "";
}

function withQuery(path: string, query: string): string {
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}

async function api<T>(
  path: string,
  token: string,
  init: RequestInit,
  deps: VercelDnsDeps,
): Promise<T> {
  const response = await deps.fetch(`${API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await readJson<T & { error?: { code?: unknown } }>(response);
  if (!response.ok) {
    const code = typeof body.error?.code === "string" ? body.error.code : response.status;
    throw new Error(`Vercel API request failed (${code})`);
  }
  return body;
}

export async function exchangeVercelCode(
  code: string,
  config: VercelOAuthConfig,
  deps: VercelDnsDeps = { fetch },
): Promise<VercelAuthorization> {
  const response = await deps.fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  const result = await readJson<{
    access_token?: unknown;
    team_id?: unknown;
    installation_id?: unknown;
  }>(response);
  if (!response.ok || typeof result.access_token !== "string" || !result.access_token) {
    throw new Error(`Vercel authorization failed (${response.status})`);
  }
  if (
    result.team_id !== null &&
    result.team_id !== undefined &&
    typeof result.team_id !== "string"
  ) {
    throw new Error("Vercel authorization returned an invalid team");
  }
  return {
    accessToken: result.access_token,
    teamId: result.team_id ?? null,
    ...(typeof result.installation_id === "string"
      ? { installationId: result.installation_id }
      : {}),
  };
}

function apexRecordName(name: unknown, domain: string): boolean {
  if (typeof name !== "string") return false;
  const value = name.trim();
  return value === "" || value === "@" || normalizeDomain(value) === domain;
}

export async function ensureVercelTxt(
  token: string,
  rawDomain: string,
  value: string,
  teamId: string | null,
  deps: VercelDnsDeps = { fetch },
): Promise<{ recordId: string; created: boolean }> {
  const domain = normalizeDomain(rawDomain);
  const scope = teamQuery(teamId);
  const detail = await api<{ domain?: { name?: unknown } }>(
    withQuery(`/v5/domains/${encodeURIComponent(domain)}`, scope),
    token,
    { method: "GET" },
    deps,
  );
  if (!detail.domain || normalizeDomain(String(detail.domain.name)) !== domain) {
    throw new Error("Vercel did not return the exact stored domain");
  }

  let until: number | null = null;
  for (let page = 0; page < MAX_RECORD_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (teamId) query.set("teamId", teamId);
    if (until !== null) query.set("until", String(until));
    const listed = await api<{
      records?: Array<{ id?: unknown; name?: unknown; type?: unknown; value?: unknown }>;
      pagination?: { next?: unknown };
    }>(
      `/v5/domains/${encodeURIComponent(domain)}/records?${query.toString()}`,
      token,
      { method: "GET" },
      deps,
    );
    if (!Array.isArray(listed.records)) throw new Error("Vercel returned invalid DNS records");
    const existing = listed.records.find(
      (record) =>
        record.type === "TXT" &&
        record.value === value &&
        apexRecordName(record.name, domain) &&
        typeof record.id === "string",
    );
    if (existing) return { recordId: existing.id as string, created: false };
    const next = listed.pagination?.next;
    if (next === null || next === undefined) break;
    if (typeof next !== "number" || !Number.isFinite(next)) {
      throw new Error("Vercel returned invalid DNS pagination");
    }
    until = next;
    if (page === MAX_RECORD_PAGES - 1) {
      throw new Error("Vercel DNS record scan exceeded the safety limit");
    }
  }

  const created = await api<{ uid?: unknown }>(
    withQuery(`/v2/domains/${encodeURIComponent(domain)}/records`, scope),
    token,
    {
      method: "POST",
      body: JSON.stringify({
        type: "TXT",
        name: "",
        ttl: 60,
        value,
        comment: "CiteFleet BotCentral ownership proof",
      }),
    },
    deps,
  );
  if (typeof created.uid !== "string" || !created.uid) {
    throw new Error("Vercel did not return a DNS record id");
  }
  return { recordId: created.uid, created: true };
}

export async function removeVercelIntegration(
  token: string,
  configurationId: string,
  teamId: string | null,
  deps: VercelDnsDeps = { fetch },
): Promise<boolean> {
  const path = withQuery(
    `/v1/integrations/configuration/${encodeURIComponent(configurationId)}`,
    teamQuery(teamId),
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await deps.fetch(`${API_URL}${path}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(8_000),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 204 || response.status === 404) return true;
      if (response.status < 500) return false;
    } catch {
      // Removal is idempotent, so one bounded retry is safe.
    }
  }
  return false;
}
