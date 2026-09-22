import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exchangeHostingerCode,
  hostingerAuthorizationUrl,
  hostingerRedirectUri,
  newHostingerPkce,
  registerHostingerClient,
  revokeHostingerToken,
} from "./hostinger-oauth.server.ts";

const redirectUri = "https://citefleet.app/api/hosting/hostinger/callback";

test("Hostinger authorization uses the published registration, PKCE, and token contract", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body) });
    if (String(input).endsWith("/register")) return Response.json({ client_id: "client-1" });
    if (String(input).endsWith("/token"))
      return Response.json({ access_token: "customer-token", expires_in: 3600, token_type: "Bearer" });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const clientId = await registerHostingerClient(redirectUri, fakeFetch);
  const pkce = newHostingerPkce();
  assert.match(pkce.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  const url = new URL(hostingerAuthorizationUrl({
    clientId, redirectUri, state: "state", challenge: pkce.challenge,
  }));
  assert.equal(url.origin, "https://auth.hostinger.com");
  assert.equal(url.searchParams.get("redirect_uri"), redirectUri);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), pkce.challenge);
  const token = await exchangeHostingerCode({
    clientId, redirectUri, code: "code", verifier: pkce.verifier,
  }, fakeFetch);
  assert.deepEqual(token, { accessToken: "customer-token", expiresIn: 3600 });
  await revokeHostingerToken(clientId, token.accessToken, fakeFetch);
  assert.deepEqual(JSON.parse(calls[0].body), {
    client_name: "citefleet-origin-installer", redirect_uris: [redirectUri],
  });
  assert.equal(new URLSearchParams(calls[1].body).get("code_verifier"), pkce.verifier);
  assert.equal(new URLSearchParams(calls[2].body).get("token"), "customer-token");
});

test("Hostinger OAuth rejects malformed grants and unsafe public URLs", async () => {
  assert.equal(hostingerRedirectUri({ CITEFLEET_PUBLIC_URL: "https://citefleet.app" } as NodeJS.ProcessEnv), redirectUri);
  assert.throws(
    () => hostingerRedirectUri({ CITEFLEET_PUBLIC_URL: "http://evil.example" } as NodeJS.ProcessEnv),
    /invalid/,
  );
  const badFetch = (async () => Response.json({ access_token: "", expires_in: 5 })) as typeof fetch;
  await assert.rejects(
    exchangeHostingerCode({ clientId: "c", code: "c", verifier: "v", redirectUri }, badFetch),
    /invalid access token/,
  );
  const deniedFetch = (async () => Response.json({ error: "denied" }, { status: 403 })) as typeof fetch;
  await assert.rejects(registerHostingerClient(redirectUri, deniedFetch), /returned 403/);
});
