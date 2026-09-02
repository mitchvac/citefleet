import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { auditSite } from "./auditor.ts";
import type { Site } from "./types.ts";

// Integration of hosting detection into the Live audit, with fetch stubbed.
// DNS lookups run for real but every branch of detectHosting handles failures,
// so the outcome here depends only on the stubbed HTTP layer.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function site(): Site {
  return {
    id: "site-t", workspaceId: "ws", name: "T", domain: "example.invalid", url: "https://example.invalid",
    status: "auditing", sitemapUrl: "https://example.invalid/sitemap.xml", routes: ["/"], createdAt: "",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 }, summary: "",
  };
}

test("a site whose homepage answers with Vercel headers gets an info Hosting finding and site-level hosting", async () => {
  globalThis.fetch = (async () =>
    new Response("<!doctype html><title>x</title>", { status: 200, headers: { "content-type": "text/html", server: "Vercel", "x-vercel-id": "iad1::a" } })) as typeof fetch;
  const audit = await auditSite(site());
  assert.equal(audit.hosting?.provider, "vercel");
  assert.equal(audit.hosting?.deploysOnPush, true);
  const finding = audit.findings.find((f) => f.id === "hosting");
  assert.ok(finding, "hosting finding present");
  assert.equal(finding.severity, "info");
  assert.match(finding.title, /Hosting: Vercel/);
  assert.match(finding.detail, /x-vercel-id present/);
});

test("a site that never answers is a critical Unreachable finding, which keeps the SPA task from auto-closing", async () => {
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  const audit = await auditSite(site());
  assert.equal(audit.hosting?.provider, "unreachable");
  const finding = audit.findings.find((f) => f.id === "hosting");
  assert.equal(finding?.severity, "critical");
  assert.equal(finding?.playbookId, "spa_fallback", "shares the SPA task, so the dispatcher's auto-close sees a critical finding");
  assert.equal(audit.ok, false);
});
