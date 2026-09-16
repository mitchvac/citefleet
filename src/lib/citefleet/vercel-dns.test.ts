import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ensureVercelTxt,
  exchangeVercelCode,
  removeVercelIntegration,
  vercelAuthorizationUrl,
  vercelCompletionUrl,
  vercelDnsSettings,
  vercelOAuthConfig,
} from "./vercel-dns.server.ts";

const config = {
  integrationSlug: "citefleet-dns",
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://citefleet.app/api/dns/vercel/callback",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Vercel OAuth configuration fails closed when incomplete", () => {
  assert.equal(vercelOAuthConfig({}), null);
  assert.equal(vercelDnsSettings({}).state, "off");
  assert.equal(
    vercelDnsSettings({ CITEFLEET_VERCEL_CLIENT_ID: "only-one-field" }).state,
    "misconfigured",
  );
  assert.equal(
    vercelOAuthConfig({
      CITEFLEET_VERCEL_INTEGRATION_SLUG: "citefleet-dns",
      CITEFLEET_VERCEL_CLIENT_ID: "id",
      CITEFLEET_VERCEL_CLIENT_SECRET: "secret",
      CITEFLEET_PUBLIC_URL: "https://citefleet.app/path-is-ignored",
    })?.redirectUri,
    config.redirectUri,
  );
});

test("Vercel installation URL carries only the integration slug and state", () => {
  const url = new URL(vercelAuthorizationUrl(config, "state-value"));
  assert.equal(url.origin, "https://vercel.com");
  assert.equal(url.pathname, "/integrations/citefleet-dns/new");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("authorization code exchange stays server-side and returns its exact account scope", async () => {
  let request: Request | null = null;
  const authorization = await exchangeVercelCode("one-time-code", config, {
    fetch: async (input, init) => {
      request = new Request(input, init);
      return json({ access_token: "temporary-token", team_id: "team_exact" });
    },
  });
  assert.deepEqual(authorization, { accessToken: "temporary-token", teamId: "team_exact" });
  assert.equal(request!.method, "POST");
  const body = new URLSearchParams(await request!.text());
  assert.equal(body.get("client_id"), config.clientId);
  assert.equal(body.get("client_secret"), config.clientSecret);
  assert.equal(body.get("redirect_uri"), config.redirectUri);
});

test("an exact existing apex TXT is idempotent", async () => {
  const requests: Request[] = [];
  const result = await ensureVercelTxt(
    "temporary-token",
    "WWW.Example.COM",
    "botcentral-verify=x",
    "team_exact",
    {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (requests.length === 1) return json({ domain: { name: "example.com" } });
        return json({
          records: [{ id: "record-1", type: "TXT", name: "", value: "botcentral-verify=x" }],
          pagination: { count: 1, next: null, prev: null },
        });
      },
    },
  );
  assert.deepEqual(result, { recordId: "record-1", created: false });
  assert.deepEqual(
    requests.map((request) => request.method),
    ["GET", "GET"],
  );
  assert.ok(requests.every((request) => request.url.includes("teamId=team_exact")));
});

test("creates only one empty-name apex TXT after exact domain validation", async () => {
  const requests: Request[] = [];
  const result = await ensureVercelTxt(
    "temporary-token",
    "example.com",
    "botcentral-verify=unique",
    null,
    {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (requests.length === 1) return json({ domain: { name: "example.com" } });
        if (requests.length === 2) {
          return json({ records: [], pagination: { count: 0, next: null, prev: null } });
        }
        return json({ uid: "record-new", updated: Date.now() });
      },
    },
  );
  assert.deepEqual(result, { recordId: "record-new", created: true });
  assert.equal(requests[2].method, "POST");
  assert.deepEqual(JSON.parse(await requests[2].text()), {
    type: "TXT",
    name: "",
    ttl: 60,
    value: "botcentral-verify=unique",
    comment: "CiteFleet BotCentral ownership proof",
  });
});

test("a different returned domain is refused before DNS records are read", async () => {
  let calls = 0;
  await assert.rejects(
    ensureVercelTxt("token", "example.com", "value", null, {
      fetch: async () => {
        calls += 1;
        return json({ domain: { name: "other.example" } });
      },
    }),
    /exact stored domain/,
  );
  assert.equal(calls, 1);
});

test("integration removal makes one bounded retry and treats already removed as success", async () => {
  let calls = 0;
  const removed = await removeVercelIntegration("token", "icfg_exact123", "team_exact", {
    fetch: async () => new Response(null, { status: ++calls === 1 ? 503 : 404 }),
  });
  assert.equal(removed, true);
  assert.equal(calls, 2);
});

test("Vercel completion redirects cannot escape Vercel", () => {
  assert.equal(
    vercelCompletionUrl("https://vercel.com/integrations/installed"),
    "https://vercel.com/integrations/installed",
  );
  assert.equal(vercelCompletionUrl("https://evil.example/steal"), null);
  assert.equal(vercelCompletionUrl("https://vercel.com.evil.example/steal"), null);
  assert.equal(vercelCompletionUrl("javascript:alert(1)"), null);
});
