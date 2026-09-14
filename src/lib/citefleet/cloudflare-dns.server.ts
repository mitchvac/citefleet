import type { CloudflareDnsSettings } from "./dns-provider.ts";
import { normalizeDomain } from "./verify-token.ts";

const AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const REVOKE_URL = "https://dash.cloudflare.com/oauth2/revoke";
const API_URL = "https://api.cloudflare.com/client/v4";
const DOCS_URL = "https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/";
const MAX_RESPONSE_BYTES = 1024 * 1024;

export interface CloudflareOAuthConfig {
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
}

export interface CloudflareDnsDeps {
  fetch: typeof fetch;
}

type CloudflareEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
};

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

export function cloudflareOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): CloudflareOAuthConfig | null {
  const clientId = env.CITEFLEET_CLOUDFLARE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.CITEFLEET_CLOUDFLARE_CLIENT_SECRET?.trim() ?? "";
  const scopes = env.CITEFLEET_CLOUDFLARE_SCOPES?.trim() ?? "";
  if (!clientId && !clientSecret && !scopes) return null;
  if (!clientId || !clientSecret || !scopes) throw new Error("Cloudflare OAuth is incomplete");
  return {
    clientId,
    clientSecret,
    scopes,
    redirectUri: `${publicOrigin(env)}/api/dns/cloudflare/callback`,
  };
}

export function cloudflareDnsSettings(env: NodeJS.ProcessEnv = process.env): CloudflareDnsSettings {
  try {
    return {
      state: cloudflareOAuthConfig(env) ? "ready" : "off",
      service: "cloudflare",
      startPath: "/api/dns/cloudflare/start",
      docsUrl: DOCS_URL,
    };
  } catch {
    return {
      state: "misconfigured",
      service: "cloudflare",
      startPath: "/api/dns/cloudflare/start",
      docsUrl: DOCS_URL,
    };
  }
}

export function cloudflareAuthorizationUrl(config: CloudflareOAuthConfig, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_RESPONSE_BYTES) throw new Error("Cloudflare response was too large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Cloudflare response was too large");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Cloudflare returned an invalid response");
  }
}

function apiError<T>(response: Response, body: CloudflareEnvelope<T>): Error {
  const code = body.errors?.[0]?.code;
  return new Error(`Cloudflare API request failed${code ? ` (${code})` : ` (${response.status})`}`);
}

async function api<T>(
  path: string,
  token: string,
  init: RequestInit,
  deps: CloudflareDnsDeps,
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
  const body = await readJson<CloudflareEnvelope<T>>(response);
  if (!response.ok || body.success !== true || body.result === undefined) {
    throw apiError(response, body);
  }
  return body.result;
}

export async function exchangeCloudflareCode(
  code: string,
  config: CloudflareOAuthConfig,
  deps: CloudflareDnsDeps = { fetch },
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const response = await deps.fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const result = await readJson<{ access_token?: unknown }>(response);
  if (!response.ok || typeof result.access_token !== "string" || !result.access_token) {
    throw new Error(`Cloudflare authorization failed (${response.status})`);
  }
  return result.access_token;
}

export async function ensureCloudflareTxt(
  token: string,
  rawDomain: string,
  value: string,
  deps: CloudflareDnsDeps = { fetch },
): Promise<{ zoneId: string; recordId: string; created: boolean }> {
  const domain = normalizeDomain(rawDomain);
  const zones = await api<Array<{ id?: unknown; name?: unknown; status?: unknown }>>(
    `/zones?name=${encodeURIComponent(domain)}&status=active&per_page=50`,
    token,
    { method: "GET" },
    deps,
  );
  const exact = zones.filter(
    (zone) => typeof zone.id === "string" && normalizeDomain(String(zone.name)) === domain,
  );
  if (exact.length !== 1) throw new Error("Cloudflare did not return one exact active zone");
  const zoneId = exact[0].id as string;
  const records = await api<
    Array<{ id?: unknown; name?: unknown; content?: unknown; type?: unknown }>
  >(
    `/zones/${encodeURIComponent(zoneId)}/dns_records?type=TXT&name=${encodeURIComponent(domain)}&per_page=100`,
    token,
    { method: "GET" },
    deps,
  );
  const existing = records.find(
    (record) =>
      record.type === "TXT" &&
      normalizeDomain(String(record.name)) === domain &&
      record.content === value &&
      typeof record.id === "string",
  );
  if (existing) return { zoneId, recordId: existing.id as string, created: false };

  const created = await api<{ id?: unknown }>(
    `/zones/${encodeURIComponent(zoneId)}/dns_records`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        type: "TXT",
        name: domain,
        content: value,
        ttl: 1,
        comment: "CiteFleet BotCentral ownership proof",
      }),
    },
    deps,
  );
  if (typeof created.id !== "string") throw new Error("Cloudflare did not return a DNS record id");
  return { zoneId, recordId: created.id, created: true };
}

export async function revokeCloudflareToken(
  token: string,
  config: CloudflareOAuthConfig,
  deps: CloudflareDnsDeps = { fetch },
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await deps.fetch(REVOKE_URL, {
        method: "POST",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token }),
      });
      if (response.ok) return true;
    } catch {
      // Revocation is idempotent, so one bounded retry is safe.
    }
  }
  return false;
}
