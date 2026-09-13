import assert from "node:assert/strict";
import { test } from "node:test";
import type { Site, StoreShape } from "./types.ts";
import {
  entriHookUrl,
  handleEntriWebhook,
  signEntriPayload,
  verifyEntriSignature,
  type EntriHookTarget,
} from "./entri-webhook.ts";
import { endCheck } from "./webhook.ts";

const secret = "entri-test-secret";
const now = new Date("2026-09-12T16:00:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
const JOB_ID = "9c128fe4-63cd-4ec4-9ae8-8a9d06c0e6de";
const OLD_JOB_ID = "11111111-1111-4111-8111-111111111111";
const OLDER_JOB_ID = "22222222-2222-4222-8222-222222222222";
const CURRENT_JOB_ID = "33333333-3333-4333-8333-333333333333";
const NEW_JOB_ID = "44444444-4444-4444-8444-444444444444";

function site(overrides: Partial<Site> = {}): Site {
  return {
    id: "site-acme",
    workspaceId: "ws-acme",
    name: "Acme",
    domain: "acme.example",
    url: "https://acme.example",
    status: "auditing",
    sitemapUrl: "https://acme.example/sitemap.xml",
    routes: ["/"],
    createdAt: "2026-09-12T12:00:00.000Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
    dnsSetup: {
      providerSlug: "cloudflare",
      jobId: JOB_ID,
      status: "link-created",
      createdAt: "2026-09-12T15:00:00.000Z",
      updatedAt: "2026-09-12T15:00:00.000Z",
    },
    ...overrides,
  };
}

function targetFor(current: Site, checks: string[] = []) {
  const store = { sites: [current], activity: [] } as unknown as StoreShape;
  const checkKeys: string[] = [];
  const target: EntriHookTarget = {
    getStore: async () => store,
    mutateStore: async (fn) => fn(store),
    onCheck: (siteId, _reason, context) => {
      checks.push(siteId);
      checkKeys.push(context.inFlightKey);
    },
  };
  return { store, target, checkKeys };
}

function signedInput(body: Record<string, unknown>, at = timestamp) {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = {
    "entri-timestamp": at,
    "entri-signature-v3": signEntriPayload(rawBody, at, secret),
  };
  return { rawBody, header: (name: string) => headers[name.toLowerCase()] ?? null };
}

test("V3 signatures bind timestamp and raw body and the hook URL is stable", () => {
  const raw = '{"domain":"acme.example"}';
  const signature = signEntriPayload(raw, timestamp, secret);
  assert.match(signature, /^sha256=[0-9a-f]{64}$/);
  assert.equal(verifyEntriSignature(raw, timestamp, signature, secret, now), true);
  assert.equal(verifyEntriSignature(`${raw} `, timestamp, signature, secret, now), false);
  assert.equal(verifyEntriSignature(raw, timestamp, signature, "wrong", now), false);
  assert.equal(entriHookUrl("https://citefleet.app/"), "https://citefleet.app/api/hooks/entri");
});

test("bad signatures and stale timestamps are rejected before tenant resolution", async () => {
  const body = { domain: "acme.example", type: "domain.added", propagation_status: "success" };
  let resolves = 0;
  const { target } = targetFor(site());
  const deps = {
    secret,
    now: () => now,
    resolveTarget: async () => {
      resolves += 1;
      return target;
    },
  };
  const bad = signedInput(body);
  const badSignature = await handleEntriWebhook(
    {
      ...bad,
      header: (name) =>
        name === "entri-signature-v3" ? "sha256=" + "0".repeat(64) : bad.header(name),
    },
    deps,
  );
  assert.equal(badSignature.status, 401);

  const stale = String(Number(timestamp) - 301);
  assert.equal((await handleEntriWebhook(signedInput(body, stale), deps)).status, 401);
  assert.equal(resolves, 0);
});

test("propagation success is correlated, persisted, deduplicated, and queued for verification", async () => {
  const checks: string[] = [];
  const resolutions: string[][] = [];
  const { store, target, checkKeys } = targetFor(site(), checks);
  const body = {
    id: "event-1",
    job_id: JOB_ID,
    domain: "WWW.Acme.Example",
    type: "domain.added",
    propagation_status: "success",
    provider: "Cloudflare",
  };
  endCheck("site-acme");
  const deps = {
    secret,
    now: () => now,
    resolveTarget: async (...args: string[]) => {
      resolutions.push(args);
      return target;
    },
  };
  const result = await handleEntriWebhook(signedInput(body), deps);
  assert.equal(result.status, 202);
  assert.equal(result.body.action, "check");
  assert.deepEqual(checks, ["site-acme"]);
  assert.deepEqual(resolutions, [["acme.example", JOB_ID]]);
  assert.deepEqual(checkKeys, [`entri:site-acme:${JOB_ID}`]);
  assert.equal(store.sites[0].dnsSetup?.status, "propagated");
  assert.equal(store.sites[0].dnsSetup?.lastEventId, "event-1");
  assert.equal(store.sites[0].dnsSetup?.provider, "Cloudflare");
  assert.match(store.activity[0].message, /CiteFleet is verifying the live proof/);

  const duplicate = await handleEntriWebhook(signedInput(body), deps);
  assert.equal(duplicate.body.action, "duplicate");
  assert.deepEqual(checks, ["site-acme"]);
  endCheck(checkKeys[0]);
});

test("a mismatched job is ignored without mutation or a proof check", async () => {
  const checks: string[] = [];
  const { store, target } = targetFor(site(), checks);
  const result = await handleEntriWebhook(
    signedInput({
      id: "event-old",
      job_id: OLD_JOB_ID,
      domain: "acme.example",
      type: "domain.added",
      propagation_status: "success",
    }),
    { secret, now: () => now, resolveTarget: async () => target },
  );
  assert.equal(result.body.action, "ignore");
  assert.equal(store.sites[0].dnsSetup?.status, "link-created");
  assert.equal(store.activity.length, 0);
  assert.equal(checks.length, 0);
});

test("job correlation selects the right campaign when one workspace repeats a domain", async () => {
  const checks: string[] = [];
  const checkKeys: string[] = [];
  const older = site({ id: "site-older" });
  older.dnsSetup!.jobId = OLDER_JOB_ID;
  const current = site({ id: "site-current" });
  current.dnsSetup!.jobId = CURRENT_JOB_ID;
  const store = { sites: [older, current], activity: [] } as unknown as StoreShape;
  const target: EntriHookTarget = {
    getStore: async () => store,
    mutateStore: async (fn) => fn(store),
    onCheck: (siteId, _reason, context) => {
      checks.push(siteId);
      checkKeys.push(context.inFlightKey);
    },
  };

  const result = await handleEntriWebhook(
    signedInput({
      id: "event-current",
      job_id: CURRENT_JOB_ID,
      domain: "acme.example",
      type: "domain.added",
      propagation_status: "success",
    }),
    { secret, now: () => now, resolveTarget: async () => target },
  );

  assert.equal(result.body.action, "check");
  assert.equal(store.sites[0].dnsSetup?.status, "link-created");
  assert.equal(store.sites[1].dnsSetup?.status, "propagated");
  assert.deepEqual(checks, ["site-current"]);
  endCheck(checkKeys[0]);
});

test("the documented root-domain plus subdomain envelope resolves the configured host", async () => {
  const checks: string[] = [];
  const resolutions: string[][] = [];
  const { store, target, checkKeys } = targetFor(
    site({ domain: "shop.acme.example", url: "https://shop.acme.example" }),
    checks,
  );
  const result = await handleEntriWebhook(
    signedInput({
      id: "event-subdomain",
      job_id: JOB_ID,
      domain: "acme.example",
      subdomain: "shop",
      type: "domain.added",
      propagation_status: "success",
    }),
    {
      secret,
      now: () => now,
      resolveTarget: async (...args: string[]) => {
        resolutions.push(args);
        return target;
      },
    },
  );

  assert.equal(result.body.action, "check");
  assert.deepEqual(resolutions, [["shop.acme.example", JOB_ID]]);
  assert.deepEqual(checks, ["site-acme"]);
  assert.equal(store.sites[0].dnsSetup?.status, "propagated");
  endCheck(checkKeys[0]);
});

test("a missing job id or malformed JSON object is rejected before tenant resolution", async () => {
  let resolves = 0;
  const { target } = targetFor(site());
  const deps = {
    secret,
    now: () => now,
    resolveTarget: async () => {
      resolves += 1;
      return target;
    },
  };
  const missingJob = await handleEntriWebhook(
    signedInput({
      id: "event-no-job",
      domain: "acme.example",
      type: "domain.added",
      propagation_status: "success",
    }),
    deps,
  );
  assert.equal(missingJob.status, 400);

  const malformedJob = await handleEntriWebhook(
    signedInput({
      id: "event-bad-job",
      job_id: "job-123",
      domain: "acme.example",
      type: "domain.added",
      propagation_status: "success",
    }),
    deps,
  );
  assert.equal(malformedJob.status, 400);

  const rawBody = "null";
  const input = {
    rawBody,
    header: (name: string) =>
      name.toLowerCase() === "entri-timestamp"
        ? timestamp
        : name.toLowerCase() === "entri-signature-v3"
          ? signEntriPayload(rawBody, timestamp, secret)
          : null,
  };
  assert.equal((await handleEntriWebhook(input, deps)).status, 400);
  assert.equal(resolves, 0);
});

test("flow completion and propagation timeout are recorded without claiming verification", async () => {
  const checks: string[] = [];
  const { store, target } = targetFor(site(), checks);
  const deps = { secret, now: () => now, resolveTarget: async () => target };

  const completed = await handleEntriWebhook(
    signedInput({
      id: "event-complete",
      job_id: JOB_ID,
      domain: "acme.example",
      type: "domain.flow.completed",
    }),
    deps,
  );
  assert.equal(completed.body.action, "recorded");
  assert.equal(store.sites[0].dnsSetup?.status, "flow-completed");

  const timedOut = await handleEntriWebhook(
    signedInput({
      id: "event-timeout",
      job_id: JOB_ID,
      domain: "acme.example",
      type: "domain.propagation.timeout",
      propagation_status: "failed",
    }),
    deps,
  );
  assert.equal(timedOut.body.action, "recorded");
  assert.equal(store.sites[0].dnsSetup?.status, "failed");
  assert.match(store.sites[0].dnsSetup?.lastResult ?? "", /did not observe propagation/);
  assert.equal(checks.length, 0);
});

test("out-of-order callbacks cannot downgrade propagated or independently verified state", async () => {
  const current = site({
    dnsSetup: {
      ...site().dnsSetup!,
      status: "propagated",
      recentEvents: ["event-success:domain.added:success", "event-between:domain.flow.completed:"],
    },
  });
  const { store, target } = targetFor(current);
  const deps = { secret, now: () => now, resolveTarget: async () => target };
  const completed = await handleEntriWebhook(
    signedInput({
      id: "event-complete-late",
      job_id: JOB_ID,
      domain: "acme.example",
      type: "domain.flow.completed",
    }),
    deps,
  );
  assert.equal(completed.body.action, "recorded");
  assert.equal(store.sites[0].dnsSetup?.status, "propagated");

  store.sites[0].dnsSetup!.status = "verified";
  store.sites[0].dnsSetup!.lastResult = "Independent proof check passed via dns-txt.";
  const timeout = await handleEntriWebhook(
    signedInput({
      id: "event-timeout-late",
      job_id: JOB_ID,
      domain: "acme.example",
      type: "domain.propagation.timeout",
    }),
    deps,
  );
  assert.equal(timeout.body.action, "recorded");
  assert.equal(store.sites[0].dnsSetup?.status, "verified");
  assert.equal(store.sites[0].dnsSetup?.lastResult, "Independent proof check passed via dns-txt.");

  const replay = await handleEntriWebhook(
    signedInput({
      id: "event-between",
      job_id: JOB_ID,
      domain: "acme.example",
      type: "domain.flow.completed",
    }),
    deps,
  );
  assert.equal(replay.body.action, "duplicate");
});

test("a later propagation success cannot requeue an independently verified site", async () => {
  const checks: string[] = [];
  const current = site();
  current.dnsSetup!.status = "verified";
  current.dnsSetup!.lastResult = "Independent proof check passed via dns-txt.";
  const { store, target } = targetFor(current, checks);
  const result = await handleEntriWebhook(
    signedInput({
      id: "event-success-after-verification",
      job_id: JOB_ID,
      domain: "acme.example",
      type: "domain.added",
      propagation_status: "success",
    }),
    { secret, now: () => now, resolveTarget: async () => target },
  );

  assert.equal(result.body.action, "recorded");
  assert.equal(store.sites[0].dnsSetup?.status, "verified");
  assert.equal(store.sites[0].dnsSetup?.lastResult, "Independent proof check passed via dns-txt.");
  assert.deepEqual(checks, []);
});

test("a propagation update sharing an event id is not mistaken for a retry", async () => {
  const checks: string[] = [];
  const current = site();
  const { store, target, checkKeys } = targetFor(current, checks);
  const deps = { secret, now: () => now, resolveTarget: async () => target };
  const base = {
    id: "event-changing",
    job_id: JOB_ID,
    domain: "acme.example",
    type: "domain.added",
  };

  const pending = await handleEntriWebhook(
    signedInput({ ...base, propagation_status: "pending" }),
    deps,
  );
  assert.equal(pending.body.action, "recorded");
  assert.equal(store.sites[0].dnsSetup?.status, "propagating");

  const success = await handleEntriWebhook(
    signedInput({ ...base, propagation_status: "success" }),
    deps,
  );
  assert.equal(success.body.action, "check");
  assert.equal(store.sites[0].dnsSetup?.status, "propagated");
  assert.deepEqual(checks, ["site-acme"]);
  endCheck(checkKeys[0]);
});

test("a newer setup job can verify while an older job is still polling", async () => {
  const checks: string[] = [];
  const { store, target, checkKeys } = targetFor(site(), checks);
  const deps = { secret, now: () => now, resolveTarget: async () => target };
  const first = await handleEntriWebhook(
    signedInput({
      id: "event-old-job",
      job_id: JOB_ID,
      domain: "acme.example",
      type: "domain.added",
      propagation_status: "success",
    }),
    deps,
  );
  assert.equal(first.body.action, "check");

  store.sites[0].dnsSetup = {
    ...site().dnsSetup!,
    jobId: NEW_JOB_ID,
    status: "link-created",
  };
  const second = await handleEntriWebhook(
    signedInput({
      id: "event-new-job",
      job_id: NEW_JOB_ID,
      domain: "acme.example",
      type: "domain.added",
      propagation_status: "success",
    }),
    deps,
  );
  assert.equal(second.body.action, "check");
  assert.deepEqual(checks, ["site-acme", "site-acme"]);
  assert.deepEqual(checkKeys, [`entri:site-acme:${JOB_ID}`, `entri:site-acme:${NEW_JOB_ID}`]);
  for (const key of checkKeys) endCheck(key);
});
