import assert from "node:assert/strict";
import { test } from "node:test";
import { createDnsSetupLink, dnsSetupSettings, type DnsSetupDeps } from "./dns-setup.server.ts";

const credentials = () => ({
  applicationId: "app-123",
  secret: "top-secret",
  shareHost: "app.goentri.com",
});
const sleep = async () => {};
const JOB_ID = "9c128fe4-63cd-4ec4-9ae8-8a9d06c0e6de";

test("settings fail closed when Entri credentials are absent or partial", () => {
  assert.equal(
    dnsSetupSettings(() => ({ applicationId: "", secret: "", shareHost: "app.goentri.com" })).state,
    "off",
  );
  assert.equal(
    dnsSetupSettings(() => ({ applicationId: "app", secret: "", shareHost: "app.goentri.com" }))
      .state,
    "misconfigured",
  );
  assert.deepEqual(dnsSetupSettings(credentials), {
    state: "ready",
    service: "entri",
    docsUrl: "https://developers.entri.com/connect/shared-links",
  });
  assert.equal(
    dnsSetupSettings(() => ({
      applicationId: "app",
      secret: "secret",
      shareHost: "app.goentri.com.evil.test:443",
    })).state,
    "misconfigured",
  );
});

test("the token is server-minted and bound to the exact domain and TXT record", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init = {}) => {
    requests.push({ url: String(input), init });
    return requests.length === 1
      ? Response.json({ auth_token: "header.payload.signature" })
      : Response.json({ link: "https://app.goentri.com/share/share-123", job_id: JOB_ID });
  };
  const result = await createDnsSetupLink({ domain: "WWW.Example.com" }, "user-7", {
    fetch: fakeFetch,
    credentials,
    sleep,
  });
  assert.deepEqual(result, {
    link: "https://app.goentri.com/share/share-123",
    jobId: JOB_ID,
  });
  const tokenBody = JSON.parse(String(requests[0].init.body));
  assert.deepEqual(tokenBody, {
    applicationId: "app-123",
    secret: "top-secret",
    domain: "example.com",
    userId: "user-7",
    dnsRecords: [{ type: "TXT", host: "@", value: "botcentral-verify=citefleet-app", ttl: 300 }],
  });
  const shareBody = JSON.parse(String(requests[1].init.body));
  assert.deepEqual(shareBody.config.dnsRecords, tokenBody.dnsRecords);
  assert.equal(
    (requests[1].init.headers as Record<string, string>).Authorization,
    "Bearer header.payload.signature",
  );
  assert.equal((requests[1].init.headers as Record<string, string>).applicationId, "app-123");
  assert.ok(requests.every(({ init }) => init.redirect === "error"));
});

test("429 and server errors retry, while a customer error does not", async () => {
  let calls = 0;
  const delays: number[] = [];
  const retrying: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 429 });
    if (calls === 2) return Response.json({ auth_token: "header.payload.signature" });
    if (calls === 3) return new Response(null, { status: 503 });
    return Response.json({ link: "https://app.goentri.com/share/x", job_id: JOB_ID });
  };
  await createDnsSetupLink({ domain: "example.com" }, "u", {
    fetch: retrying,
    credentials,
    sleep: async (ms) => {
      delays.push(ms);
    },
  });
  assert.equal(calls, 4);
  assert.deepEqual(delays, [200, 200]);

  let badCalls = 0;
  await assert.rejects(
    () =>
      createDnsSetupLink({ domain: "example.com" }, "u", {
        fetch: (async () => {
          badCalls += 1;
          return new Response("sensitive", { status: 400 });
        }) as typeof fetch,
        credentials,
        sleep,
      }),
    /refused the request \(400\)/,
  );
  assert.equal(badCalls, 1);
});

test("a returned phishing URL or malformed job is rejected", async () => {
  const responses = (link: string, job_id = JOB_ID) => {
    let call = 0;
    return (async () =>
      ++call === 1
        ? Response.json({ auth_token: "header.payload.signature" })
        : Response.json({ link, job_id })) as typeof fetch;
  };
  await assert.rejects(
    () =>
      createDnsSetupLink({ domain: "example.com" }, "u", {
        fetch: responses("https://app.goentri.com.evil.test/share/x"),
        credentials,
        sleep,
      }),
    /invalid sharing link/,
  );
  await assert.rejects(
    () =>
      createDnsSetupLink({ domain: "example.com" }, "u", {
        fetch: responses("https://app.goentri.com:8443/share/x"),
        credentials,
        sleep,
      }),
    /invalid sharing link/,
  );
  await assert.rejects(
    () =>
      createDnsSetupLink({ domain: "example.com" }, "u", {
        fetch: responses("https://app.goentri.com/share/x", "job-123"),
        credentials,
        sleep,
      }),
    /invalid sharing link/,
  );
});

test("an explicitly configured Entri sharing hostname is accepted exactly", async () => {
  let call = 0;
  const result = await createDnsSetupLink({ domain: "example.com" }, "u", {
    fetch: (async () =>
      ++call === 1
        ? Response.json({ auth_token: "header.payload.signature" })
        : Response.json({
            link: "https://domains.citefleet.app/share/share-123",
            job_id: JOB_ID,
          })) as typeof fetch,
    credentials: () => ({
      applicationId: "app-123",
      secret: "top-secret",
      shareHost: "domains.citefleet.app",
    }),
    sleep,
  });
  assert.equal(result.link, "https://domains.citefleet.app/share/share-123");
});

test("all transport errors retry once and never put the secret in the error", async () => {
  for (const makeError of [
    () => new TypeError("top-secret at internal host"),
    () => new Error("proxy included top-secret request context"),
  ]) {
    let calls = 0;
    const deps: Partial<DnsSetupDeps> = {
      fetch: (async () => {
        calls += 1;
        throw makeError();
      }) as typeof fetch,
      credentials,
      sleep,
    };
    const error = await createDnsSetupLink({ domain: "example.com" }, "u", deps).then(
      () => null,
      (reason: unknown) => reason,
    );
    assert.match(String(error), /service is unavailable/);
    assert.doesNotMatch(String(error), /top-secret/);
    assert.equal(calls, 2);
  }
});

test("an aborted request retries once and returns a generic timeout", async () => {
  let calls = 0;
  const delays: number[] = [];
  const neverResponds: typeof fetch = async (_input, init = {}) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      const fail = () => {
        const error = new Error("top-secret timed out");
        error.name = "AbortError";
        reject(error);
      };
      if (init.signal?.aborted) fail();
      else init.signal?.addEventListener("abort", fail, { once: true });
    });
  };
  const error = await createDnsSetupLink({ domain: "example.com" }, "u", {
    fetch: neverResponds,
    credentials,
    sleep: async (ms) => {
      delays.push(ms);
    },
    timeoutMs: 1,
  }).then(
    () => null,
    (reason: unknown) => reason,
  );
  assert.match(String(error), /service timed out/);
  assert.doesNotMatch(String(error), /top-secret/);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [200]);
});
