import assert from "node:assert/strict";
import { test } from "node:test";
import type { Site } from "./types.ts";
import { applyWebhookProof, recordWebhookResult } from "./webhook-proof-state.ts";

const at = "2026-09-12T17:00:00.000Z";

function site(): Site {
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
    proof: {
      proven: true,
      method: "well-known-file",
      note: "Existing file proof.",
      checkedAt: "2026-09-12T16:00:00.000Z",
    },
    webhook: { secret: "hook-secret", createdAt: at, lastResult: "Repository hook is healthy." },
    dnsSetup: {
      providerSlug: "cloudflare",
      jobId: "job-current",
      status: "propagated",
      createdAt: at,
      updatedAt: at,
      lastResult: "Current job is polling.",
    },
  };
}

test("a failed DNS-only check preserves valid file proof", () => {
  const current = site();
  applyWebhookProof(
    current,
    {
      proven: false,
      method: "none",
      note: "TXT record missing.",
      checkedAt: at,
      attempts: 12,
    },
    "job-current",
    at,
  );
  assert.equal(current.proof?.method, "well-known-file");
  assert.equal(current.dnsSetup?.status, "failed");
  assert.equal(current.dnsSetup?.lastResult, "TXT record missing.");
});

test("an older DNS poll cannot overwrite a replacement job", () => {
  const current = site();
  applyWebhookProof(
    current,
    {
      proven: false,
      method: "none",
      note: "Old job timed out.",
      checkedAt: at,
      attempts: 12,
    },
    "job-old",
    at,
  );
  assert.equal(current.dnsSetup?.status, "propagated");
  assert.equal(current.dnsSetup?.lastResult, "Current job is polling.");

  applyWebhookProof(
    current,
    {
      proven: true,
      method: "dns-txt",
      note: "TXT record is live.",
      checkedAt: at,
      attempts: 2,
    },
    "job-old",
    at,
  );
  assert.equal(current.proof?.method, "dns-txt", "live TXT proof is valid independent of the job");
  assert.equal(current.dnsSetup?.status, "propagated");
});

test("Entri and repository hook results stay in their own fields", () => {
  const current = site();
  recordWebhookResult(current, "DNS verified.", at, {
    dnsSetupOperationId: "job-current",
    dnsStatus: "verified",
  });
  assert.equal(current.dnsSetup?.lastResult, "DNS verified.");
  assert.equal(current.dnsSetup?.status, "verified");
  assert.equal(current.webhook?.lastResult, "Repository hook is healthy.");

  recordWebhookResult(current, "Deploy hook listed.", at, {});
  assert.equal(current.webhook?.lastResult, "Deploy hook listed.");
  assert.equal(current.dnsSetup?.lastResult, "DNS verified.");

  recordWebhookResult(current, "Stale job failed.", at, {
    dnsSetupOperationId: "job-old",
    dnsStatus: "failed",
  });
  assert.equal(current.dnsSetup?.lastResult, "DNS verified.");
});
