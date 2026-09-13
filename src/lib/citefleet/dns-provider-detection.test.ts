import assert from "node:assert/strict";
import { test } from "node:test";
import { detectDnsProvider } from "./dns-provider-detection.server.ts";

const now = () => new Date("2026-09-12T12:00:00.000Z");
const sleep = async () => {};

test("authoritative lookup returns a serializable matched provider", async () => {
  const result = await detectDnsProvider("https://WWW.Example.com/path", {
    resolveNs: async (domain) => {
      assert.equal(domain, "example.com");
      return ["BOB.NS.CLOUDFLARE.COM.", "ada.ns.cloudflare.com"];
    },
    now,
    sleep,
  });
  assert.deepEqual(result, {
    status: "matched",
    domain: "example.com",
    nameservers: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
    provider: { slug: "cloudflare", name: "Cloudflare" },
    candidates: [],
    checkedAt: "2026-09-12T12:00:00.000Z",
    note: "All authoritative nameservers match Cloudflare.",
  });
});

test("transient DNS failure retries once and then succeeds", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const result = await detectDnsProvider("example.com", {
    resolveNs: async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("try again"), { code: "EAI_AGAIN" });
      return ["ns1.domaincontrol.com", "ns2.domaincontrol.com"];
    },
    now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  assert.equal(result.provider?.slug, "godaddy");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [150]);
});

test("permanent lookup errors fail soft without exposing resolver messages", async () => {
  let calls = 0;
  const result = await detectDnsProvider("example.com", {
    resolveNs: async () => {
      calls += 1;
      throw Object.assign(new Error("internal resolver hostname and secret"), {
        code: "ENOTFOUND",
      });
    },
    now,
    sleep,
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "unreachable");
  assert.match(result.note, /ENOTFOUND/);
  assert.doesNotMatch(result.note, /secret/);
});

test("lookup timeout is bounded and retries once", async () => {
  let calls = 0;
  const never = new Promise<string[]>(() => {});
  const result = await detectDnsProvider("example.com", {
    resolveNs: async () => {
      calls += 1;
      return never;
    },
    timeoutMs: 2,
    now,
    sleep,
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "unreachable");
  assert.match(result.note, /DNS_TIMEOUT/);
});
