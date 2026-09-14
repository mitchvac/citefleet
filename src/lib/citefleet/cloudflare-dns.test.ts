import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cloudflareAuthorizationUrl,
  cloudflareDnsSettings,
  cloudflareOAuthConfig,
  ensureCloudflareTxt,
  exchangeCloudflareCode,
  revokeCloudflareToken,
} from "./cloudflare-dns.server.ts";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  scopes: "zone.read dns.write",
  redirectUri: "https://citefleet.app/api/dns/cloudflare/callback",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Cloudflare OAuth configuration fails closed when incomplete", () => {
  assert.equal(cloudflareOAuthConfig({}), null);
  assert.equal(cloudflareDnsSettings({}).state, "off");
  assert.equal(
    cloudflareDnsSettings({ CITEFLEET_CLOUDFLARE_CLIENT_ID: "only-one-field" }).state,
    "misconfigured",
  );
  assert.equal(
    cloudflareOAuthConfig({
      CITEFLEET_CLOUDFLARE_CLIENT_ID: "id",
      CITEFLEET_CLOUDFLARE_CLIENT_SECRET: "secret",
      CITEFLEET_CLOUDFLARE_SCOPES: "zone.read dns.write",
      CITEFLEET_PUBLIC_URL: "https://citefleet.app/path-is-ignored",
    })?.redirectUri,
    "https://citefleet.app/api/dns/cloudflare/callback",
  );
  assert.equal(
    cloudflareDnsSettings({
      CITEFLEET_CLOUDFLARE_CLIENT_ID: "id",
      CITEFLEET_CLOUDFLARE_CLIENT_SECRET: "secret",
      CITEFLEET_CLOUDFLARE_SCOPES: "scope",
      CITEFLEET_PUBLIC_URL: "http://citefleet.app",
    }).state,
    "misconfigured",
  );
});

test("authorization URL binds redirect, configured scopes, and unpredictable state", () => {
  const url = new URL(cloudflareAuthorizationUrl(config, "state-value"));
  assert.equal(url.origin, "https://dash.cloudflare.com");
  assert.equal(url.pathname, "/oauth2/auth");
  assert.equal(url.searchParams.get("client_id"), config.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("scope"), config.scopes);
  assert.equal(url.searchParams.get("state"), "state-value");
});

test("authorization code exchange uses client authentication without leaking secret into body", async () => {
  let request: Request | null = null;
  const token = await exchangeCloudflareCode("one-time-code", config, {
    fetch: async (input, init) => {
      request = new Request(input, init);
      return json({ access_token: "temporary-token" });
    },
  });
  assert.equal(token, "temporary-token");
  assert.match(request!.headers.get("authorization") ?? "", /^Basic /);
  const body = await request!.text();
  assert.match(body, /code=one-time-code/);
  assert.doesNotMatch(body, /client-secret/);
});

test("exact existing apex TXT is idempotent and creates nothing", async () => {
  const requests: Request[] = [];
  const result = await ensureCloudflareTxt("token", "WWW.Example.COM", "botcentral-verify=x", {
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/zones?")) {
        return json({
          success: true,
          result: [{ id: "zone-1", name: "example.com", status: "active" }],
        });
      }
      return json({
        success: true,
        result: [
          { id: "record-1", type: "TXT", name: "example.com", content: "botcentral-verify=x" },
        ],
      });
    },
  });
  assert.deepEqual(result, { zoneId: "zone-1", recordId: "record-1", created: false });
  assert.deepEqual(
    requests.map((request) => request.method),
    ["GET", "GET"],
  );
});

test("creates only the required TXT record in the exact matching zone", async () => {
  const requests: Request[] = [];
  const result = await ensureCloudflareTxt("token", "example.com", "botcentral-verify=unique", {
    fetch: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (requests.length === 1) {
        return json({
          success: true,
          result: [{ id: "zone-1", name: "example.com", status: "active" }],
        });
      }
      if (requests.length === 2) return json({ success: true, result: [] });
      return json({ success: true, result: { id: "record-new" } });
    },
  });
  assert.equal(result.created, true);
  assert.equal(requests.length, 3);
  assert.deepEqual(JSON.parse(await requests[2].text()), {
    type: "TXT",
    name: "example.com",
    content: "botcentral-verify=unique",
    ttl: 1,
    comment: "CiteFleet BotCentral ownership proof",
  });
});

test("ambiguous zone responses are refused before any record lookup", async () => {
  let calls = 0;
  await assert.rejects(
    ensureCloudflareTxt("token", "example.com", "value", {
      fetch: async () => {
        calls += 1;
        return json({
          success: true,
          result: [
            { id: "one", name: "example.com" },
            { id: "two", name: "example.com" },
          ],
        });
      },
    }),
    /one exact active zone/,
  );
  assert.equal(calls, 1);
});

test("token revocation makes one bounded retry", async () => {
  let calls = 0;
  const revoked = await revokeCloudflareToken("temporary-token", config, {
    fetch: async () => new Response(null, { status: ++calls === 1 ? 503 : 200 }),
  });
  assert.equal(revoked, true);
  assert.equal(calls, 2);
});
