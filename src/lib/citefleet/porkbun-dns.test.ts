import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createPorkbunAuthorization,
  ensurePorkbunTxt,
  readPorkbunCredentials,
  retrievePorkbunAuthorization,
} from "./porkbun-dns.server.ts";

const credentials = {
  apiKey: "pk1_customer-key",
  secretApiKey: "sk1_customer-secret",
};

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("Porkbun credentials require live key prefixes and reject sandbox keys", () => {
  assert.deepEqual(readPorkbunCredentials(credentials), credentials);
  assert.throws(
    () => readPorkbunCredentials({ ...credentials, apiKey: "wrong" }),
    /API key is invalid/,
  );
  assert.throws(
    () =>
      readPorkbunCredentials({
        apiKey: "pk1_sb_customer-key",
        secretApiKey: "sk1_sb_customer-secret",
      }),
    /sandbox keys cannot update live DNS/,
  );
});

test("Porkbun authorization uses PKCE and never sends the verifier", async () => {
  let sent: Request | null = null;
  const entropy = Buffer.alloc(32, 7);
  const result = await createPorkbunAuthorization(
    "WWW.Example.COM",
    "https://citefleet.app/api/dns/porkbun/callback",
    {
      randomBytes: () => entropy,
      fetch: async (input, init) => {
        sent = new Request(input, init);
        return json({
          status: "SUCCESS",
          requestToken: "a".repeat(64),
          authUrl: `https://porkbun.com/account/apiKeyApproval/${"a".repeat(64)}`,
          expiration: "2026-09-15 12:30:00",
          deliveryMode: "pkce",
        });
      },
    },
  );
  const request = sent as unknown as Request;
  const verifier = entropy.toString("base64url");
  const body = JSON.parse(await request.text());
  assert.equal(request.url, "https://api.porkbun.com/api/json/v3/apikey/request");
  assert.equal(body.name, "CiteFleet DNS verification - example.com");
  assert.equal(body.codeChallenge, createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(body.codeChallengeMethod, "S256");
  assert.equal(body.returnUrl, "https://citefleet.app/api/dns/porkbun/callback");
  assert.doesNotMatch(JSON.stringify(body), new RegExp(verifier));
  assert.equal(result.codeVerifier, verifier);
  assert.equal(result.requestToken, "a".repeat(64));
});

test("Porkbun authorization refuses an untrusted approval URL", async () => {
  await assert.rejects(
    createPorkbunAuthorization("example.com", "https://citefleet.app/api/dns/porkbun/callback", {
      randomBytes: () => Buffer.alloc(32, 4),
      fetch: async () =>
        json({
          status: "SUCCESS",
          requestToken: "b".repeat(64),
          authUrl: `https://porkbun.com.attacker.test/account/apiKeyApproval/${"b".repeat(64)}`,
          deliveryMode: "pkce",
        }),
    }),
    /invalid approval URL/,
  );
});

test("approved PKCE request returns both generated credentials exactly once", async () => {
  let sent: Request | null = null;
  const verifier = Buffer.alloc(32, 9).toString("base64url");
  const result = await retrievePorkbunAuthorization("c".repeat(64), verifier, {
    fetch: async (input, init) => {
      sent = new Request(input, init);
      return json({
        status: "SUCCESS",
        apikey: credentials.apiKey,
        secretapikey: credentials.secretApiKey,
      });
    },
  });
  const request = sent as unknown as Request;
  assert.deepEqual(result, credentials);
  assert.equal(request.url, "https://api.porkbun.com/api/json/v3/apikey/retrieve");
  assert.deepEqual(JSON.parse(await request.text()), {
    requestToken: "c".repeat(64),
    codeVerifier: verifier,
  });
});

test("an exact existing apex TXT record is idempotent", async () => {
  const requests: Request[] = [];
  const result = await ensurePorkbunTxt(
    credentials,
    "WWW.Example.COM",
    "botcentral-verify=exact",
    "operation-1",
    {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return json({
          status: "SUCCESS",
          records: [
            {
              id: "record-1",
              name: "example.com.",
              type: "TXT",
              content: "botcentral-verify=exact",
            },
          ],
        });
      },
    },
  );
  assert.deepEqual(result, { recordId: "record-1", created: false });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].url, "https://api.porkbun.com/api/json/v3/dns/retrieve/example.com");
  assert.equal(requests[0].headers.get("x-api-key"), credentials.apiKey);
  assert.equal(requests[0].headers.get("x-secret-api-key"), credentials.secretApiKey);
});

test("creates only the exact apex TXT record with an idempotency key", async () => {
  const requests: Request[] = [];
  const result = await ensurePorkbunTxt(
    credentials,
    "example.com",
    "botcentral-verify=unique",
    "operation-2",
    {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return requests.length === 1
          ? json({
              status: "SUCCESS",
              records: [
                {
                  id: "subdomain-record",
                  name: "www.example.com",
                  type: "TXT",
                  content: "botcentral-verify=unique",
                },
              ],
            })
          : json({ status: "SUCCESS", id: "record-new" });
      },
    },
  );
  assert.deepEqual(result, { recordId: "record-new", created: true });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, "POST");
  assert.equal(requests[1].headers.get("idempotency-key"), "operation-2");
  assert.deepEqual(JSON.parse(await requests[1].text()), {
    name: "",
    type: "TXT",
    content: "botcentral-verify=unique",
    ttl: 600,
  });
});

test("a duplicate response adopts the existing record instead of retrying", async () => {
  let calls = 0;
  const result = await ensurePorkbunTxt(
    credentials,
    "example.com",
    "botcentral-verify=exact",
    "operation-3",
    {
      fetch: async () => {
        calls += 1;
        return calls === 1
          ? json({ status: "SUCCESS", records: [] })
          : json({ status: "ERROR", code: "DUPLICATE_RECORD", existingId: 42 }, 400);
      },
    },
  );
  assert.deepEqual(result, { recordId: "42", created: false });
});

test("provider failures are actionable without exposing provider response text", async () => {
  await assert.rejects(
    ensurePorkbunTxt(credentials, "example.com", "value", "operation-4", {
      fetch: async () =>
        json(
          {
            status: "ERROR",
            code: "DOMAIN_NOT_ALLOWED",
            message: "internal provider detail secret-customer-value",
          },
          403,
        ),
    }),
    (error: unknown) => {
      assert.match(String(error), /not allowed to manage this domain/);
      assert.doesNotMatch(String(error), /secret-customer-value/);
      return true;
    },
  );
  await assert.rejects(
    ensurePorkbunTxt(credentials, "example.com", "value", "operation-5", {
      fetch: async () =>
        json({ status: "SUCCESS", records: [] }, 200, {
          "content-length": String(1024 * 1024 + 1),
        }),
    }),
    /response was too large/,
  );
});

test("a domain API opt-in failure gives the exact recovery step without exposing its raw code", async () => {
  const providerCode =
    "DOMAIN_IS_NOT_OPTED_IN_TO_API_ACCESS_YOU_CAN_ENABLE_API_ACCESS_FOR_ALL_DOMAINS_GLOBALLY_FROM_YOUR_ACCOUNT_SETTINGS_AT_PORKBUNCOM";
  await assert.rejects(
    ensurePorkbunTxt(credentials, "MarketSwarm.app", "botcentral-verify=exact", "operation-6", {
      fetch: async () => json({ status: "ERROR", code: providerCode }, 400),
    }),
    (error: unknown) => {
      assert.match(String(error), /API Access to be enabled for marketswarm\.app/i);
      assert.match(String(error), /Domain Management/);
      assert.match(String(error), /open Details/);
      assert.doesNotMatch(String(error), new RegExp(providerCode));
      return true;
    },
  );
});
