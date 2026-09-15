import { createHash, randomBytes } from "node:crypto";
import { normalizeDomain } from "./verify-token.ts";

const API_URL = "https://api.porkbun.com/api/json/v3";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const API_TIMEOUT_MS = 8_000;

export interface PorkbunCredentials {
  apiKey: string;
  secretApiKey: string;
}

export interface PorkbunDnsDeps {
  fetch: typeof fetch;
  randomBytes?: (size: number) => Buffer;
}

type PorkbunEnvelope = {
  status?: unknown;
  code?: unknown;
  records?: unknown;
  id?: unknown;
  existingId?: unknown;
  requestToken?: unknown;
  authUrl?: unknown;
  expiration?: unknown;
  deliveryMode?: unknown;
  apikey?: unknown;
  secretapikey?: unknown;
};

type PorkbunRecord = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  content?: unknown;
};

function credential(value: unknown, prefix: "pk1_" | "sk1_", label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const exact = value.trim();
  if (!exact.startsWith(prefix) || exact.length < prefix.length + 8 || exact.length > 512) {
    throw new Error(`${label} is invalid.`);
  }
  const hasControlCharacter = [...exact].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (/\s/.test(exact) || hasControlCharacter) throw new Error(`${label} is invalid.`);
  if (exact.startsWith(`${prefix}sb_`)) {
    throw new Error("Porkbun sandbox keys cannot update live DNS.");
  }
  return exact;
}

export function readPorkbunCredentials(input: PorkbunCredentials): PorkbunCredentials {
  return {
    apiKey: credential(input.apiKey, "pk1_", "Porkbun API key"),
    secretApiKey: credential(input.secretApiKey, "sk1_", "Porkbun secret API key"),
  };
}

async function readJson(response: Response): Promise<PorkbunEnvelope> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_RESPONSE_BYTES) throw new Error("Porkbun response was too large.");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Porkbun response was too large.");
  }
  try {
    return JSON.parse(text) as PorkbunEnvelope;
  } catch {
    throw new Error("Porkbun returned an invalid response.");
  }
}

function apiError(response: Response, body: PorkbunEnvelope): Error {
  const code = typeof body.code === "string" ? body.code : "";
  const messages: Record<string, string> = {
    API_KEY_REQUIRED: "Porkbun did not return both approved credentials.",
    INVALID_API_KEYS_001: "Porkbun rejected the approved API key.",
    INVALID_API_KEYS_002: "Porkbun rejected the approved API key.",
    INVALID_USER: "The Porkbun account for this approval is not active.",
    IP_NOT_ALLOWED: "The approved Porkbun key does not allow requests from CiteFleet.",
    DOMAIN_NOT_ALLOWED: "The approved Porkbun key is not allowed to manage this domain.",
    DOMAIN_NOT_FOUND: "This domain is not in the approving Porkbun account.",
    RECORD_CONFLICT: "Porkbun reports a conflicting DNS record at the domain apex.",
    ZONE_RECORD_LIMIT: "This Porkbun DNS zone has reached its record limit.",
    RATE_LIMIT_EXCEEDED: "Porkbun is rate limiting DNS setup. Wait, then try again.",
    REQUEST_DENIED: "The Porkbun account owner denied DNS access.",
    REQUEST_EXPIRED: "The Porkbun approval expired. Start the connection again.",
    SECRET_ALREADY_CLAIMED: "This Porkbun approval was already used. Start again.",
    INVALID_CODE_VERIFIER: "Porkbun could not verify this connection. Start again.",
  };
  return new Error(messages[code] ?? `Porkbun DNS request failed (${code || response.status}).`);
}

async function request(
  path: string,
  init: RequestInit,
  deps: PorkbunDnsDeps,
): Promise<{ response: Response; body: PorkbunEnvelope }> {
  let response: Response;
  try {
    response = await deps.fetch(`${API_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new Error("Porkbun could not be reached. Try again.");
  }
  return { response, body: await readJson(response) };
}

function recordId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  return id ? id : null;
}

function isApexName(value: unknown, domain: string): boolean {
  if (typeof value !== "string") return false;
  const name = value.trim().toLowerCase().replace(/\.+$/, "");
  return name === "" || name === "@" || name === domain;
}

function callbackUrl(env: NodeJS.ProcessEnv): string {
  const raw = (env.CITEFLEET_PUBLIC_URL || env.PUBLIC_ORIGIN || "https://citefleet.app").trim();
  const url = new URL(raw);
  const localHttp =
    url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
    throw new Error("CiteFleet public URL is invalid");
  }
  return `${url.origin}/api/dns/porkbun/callback`;
}

export function porkbunCallbackUrl(env: NodeJS.ProcessEnv = process.env): string {
  return callbackUrl(env);
}

function porkbunApprovalUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("Porkbun did not return an approval URL.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "porkbun.com" ||
    !url.pathname.startsWith("/account/apiKeyApproval/") ||
    url.username ||
    url.password
  ) {
    throw new Error("Porkbun returned an invalid approval URL.");
  }
  return url.toString();
}

export async function createPorkbunAuthorization(
  rawDomain: string,
  returnUrl = porkbunCallbackUrl(),
  deps: PorkbunDnsDeps = { fetch },
): Promise<{
  requestToken: string;
  authUrl: string;
  codeVerifier: string;
  expiration: string | null;
}> {
  const domain = normalizeDomain(rawDomain);
  const verifier = (deps.randomBytes ?? randomBytes)(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const target = new URL(returnUrl);
  const localHttp =
    target.protocol === "http:" &&
    (target.hostname === "localhost" || target.hostname === "127.0.0.1");
  if ((target.protocol !== "https:" && !localHttp) || target.username || target.password) {
    throw new Error("Porkbun return URL must use HTTPS.");
  }
  const result = await request(
    "/apikey/request",
    {
      method: "POST",
      body: JSON.stringify({
        name: `CiteFleet DNS verification - ${domain}`,
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        returnUrl: target.toString(),
      }),
    },
    deps,
  );
  if (!result.response.ok || result.body.status !== "SUCCESS") {
    throw apiError(result.response, result.body);
  }
  if (
    typeof result.body.requestToken !== "string" ||
    !/^[a-f0-9]{64}$/.test(result.body.requestToken)
  ) {
    throw new Error("Porkbun did not return a valid request token.");
  }
  if (result.body.deliveryMode !== "pkce") {
    throw new Error("Porkbun did not confirm protected key delivery.");
  }
  return {
    requestToken: result.body.requestToken,
    authUrl: porkbunApprovalUrl(result.body.authUrl),
    codeVerifier: verifier,
    expiration: typeof result.body.expiration === "string" ? result.body.expiration : null,
  };
}

export async function retrievePorkbunAuthorization(
  requestToken: string,
  codeVerifier: string,
  deps: PorkbunDnsDeps = { fetch },
): Promise<PorkbunCredentials> {
  if (!/^[a-f0-9]{64}$/.test(requestToken)) throw new Error("Invalid Porkbun request token.");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
    throw new Error("Invalid Porkbun connection verifier.");
  }
  const result = await request(
    "/apikey/retrieve",
    { method: "POST", body: JSON.stringify({ requestToken, codeVerifier }) },
    deps,
  );
  if (result.body.status === "PENDING") {
    throw new Error("Porkbun approval is still pending. Complete approval, then try again.");
  }
  if (!result.response.ok || result.body.status !== "SUCCESS") {
    throw apiError(result.response, result.body);
  }
  return readPorkbunCredentials({
    apiKey: result.body.apikey as string,
    secretApiKey: result.body.secretapikey as string,
  });
}

export async function ensurePorkbunTxt(
  rawCredentials: PorkbunCredentials,
  rawDomain: string,
  value: string,
  idempotencyKey: string,
  deps: PorkbunDnsDeps = { fetch },
): Promise<{ recordId: string; created: boolean }> {
  const credentials = readPorkbunCredentials(rawCredentials);
  const domain = normalizeDomain(rawDomain);
  const authHeaders = {
    "X-API-Key": credentials.apiKey,
    "X-Secret-API-Key": credentials.secretApiKey,
  };
  const retrieved = await request(
    `/dns/retrieve/${encodeURIComponent(domain)}`,
    { method: "GET", headers: authHeaders },
    deps,
  );
  if (!retrieved.response.ok || retrieved.body.status !== "SUCCESS") {
    throw apiError(retrieved.response, retrieved.body);
  }
  if (!Array.isArray(retrieved.body.records)) {
    throw new Error("Porkbun did not return a DNS record list.");
  }
  const existing = (retrieved.body.records as PorkbunRecord[]).find(
    (record) =>
      record.type === "TXT" &&
      isApexName(record.name, domain) &&
      record.content === value &&
      recordId(record.id),
  );
  const existingId = existing ? recordId(existing.id) : null;
  if (existingId) return { recordId: existingId, created: false };

  const created = await request(
    `/dns/create/${encodeURIComponent(domain)}`,
    {
      method: "POST",
      headers: { ...authHeaders, "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ name: "", type: "TXT", content: value, ttl: 600 }),
    },
    deps,
  );
  const duplicateId =
    created.body.code === "DUPLICATE_RECORD" ? recordId(created.body.existingId) : null;
  if (duplicateId) return { recordId: duplicateId, created: false };
  if (!created.response.ok || created.body.status !== "SUCCESS") {
    throw apiError(created.response, created.body);
  }
  const createdId = recordId(created.body.id);
  if (!createdId) throw new Error("Porkbun did not return a DNS record id.");
  return { recordId: createdId, created: true };
}
