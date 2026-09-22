import { createHash, randomBytes } from "node:crypto";

const ISSUER = "https://auth.hostinger.com";
const REGISTER = "/api/external/v1/oauth-server/register";
const AUTHORIZE = "/api/external/v1/oauth-server/authorize";
const TOKEN = "/api/external/v1/oauth-server/token";
const REVOKE = "/api/external/v1/oauth-server/token/revoke";

export function hostingerRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  const url = new URL((env.CITEFLEET_PUBLIC_URL || env.PUBLIC_ORIGIN || "https://citefleet.app").trim());
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash)
    throw new Error("CiteFleet public URL is invalid for Hostinger authorization.");
  return `${url.origin}/api/hosting/hostinger/callback`;
}

export function newHostingerPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function hostingerAuthRequest(
  path: string,
  body: string,
  contentType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${ISSUER}${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType, Accept: "application/json" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Hostinger authorization returned ${response.status}.`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("Hostinger authorization returned an invalid response.");
  return result as Record<string, unknown>;
}

export async function registerHostingerClient(
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const result = await hostingerAuthRequest(
    REGISTER,
    JSON.stringify({ client_name: "citefleet-origin-installer", redirect_uris: [redirectUri] }),
    "application/json",
    fetchImpl,
  );
  if (typeof result.client_id !== "string" || !result.client_id || result.client_id.length > 1024)
    throw new Error("Hostinger did not return a client ID.");
  return result.client_id;
}

export function hostingerAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(`${ISSUER}${AUTHORIZE}`);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeHostingerCode(
  input: { clientId: string; code: string; verifier: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const result = await hostingerAuthRequest(
    TOKEN,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
    }).toString(),
    "application/x-www-form-urlencoded",
    fetchImpl,
  );
  if (
    typeof result.access_token !== "string" ||
    !result.access_token ||
    result.access_token.length > 8192 ||
    typeof result.expires_in !== "number" ||
    !Number.isFinite(result.expires_in) ||
    result.expires_in <= 60
  ) throw new Error("Hostinger returned an invalid access token or expiry.");
  return { accessToken: result.access_token, expiresIn: result.expires_in };
}

export async function revokeHostingerToken(
  clientId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(`${ISSUER}${REVOKE}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, token }).toString(),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Hostinger token revocation returned ${response.status}.`);
}
