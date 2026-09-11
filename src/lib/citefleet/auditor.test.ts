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

// --- The five origin files, and the 200-that-is-really-a-404 -----------------
//
// docs/providers/README.md names this as finding 4: "Several platforms return
// HTTP 200 for a missing file. Azure Static Web Apps' navigationFallback serves
// /index.html with a 200; DigitalOcean's catchall_document does the same. A
// status-code check reports success while BotCentral rejects the HTML."
// It also says plainly: "proof.ts already guards this with looksLikeHtml — the
// audit should too." Until now it did not.

const SHELL = "<!doctype html><html><head><title>Acme</title></head><body>app</body></html>";

test("an SPA shell answering 200 for every path does NOT pass the audit", async () => {
  // Azure navigationFallback / DigitalOcean catchall_document. Before the HTML
  // guard this scored robots.txt as healthy and never looked at the other two
  // files at all.
  globalThis.fetch = (async () =>
    new Response(SHELL, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  const audit = await auditSite(site());

  const robots = audit.findings.find((f) => f.id.startsWith("robots"));
  assert.ok(robots, "positive control: a robots finding was emitted");
  assert.notEqual(robots.severity, "ok", "an app shell is not a robots.txt");

  const llms = audit.findings.find((f) => f.id === "llms-missing");
  assert.ok(llms, "llms.txt must now be checked at all");
  assert.match(llms.detail, /HTML/);

  const wk = audit.findings.find((f) => f.id === "wellknown-missing");
  assert.ok(wk, "the proof file must now be checked at all");

  assert.equal(audit.ok, false);
});

test("a fully installed pack passes all five — the positive control", async () => {
  // Without this, the failures above prove only that the audit can fail.
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const plain = { "content-type": "text/plain" };
    if (url.endsWith("/robots.txt")) {
      return new Response(
        "User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\nSitemap: https://example.invalid/sitemap.xml\n",
        { status: 200, headers: plain },
      );
    }
    if (url.endsWith("/sitemap.xml")) {
      return new Response(
        '<?xml version="1.0"?><urlset><url><loc>https://example.invalid/</loc></url></urlset>',
        { status: 200, headers: { "content-type": "application/xml" } },
      );
    }
    if (url.endsWith("/llms.txt")) {
      return new Response("<!-- Written by CiteFleet -->\n# Acme\n\n> A site.\n", { status: 200, headers: plain });
    }
    if (url.endsWith("/.well-known/botcentral.txt")) {
      return new Response("domain: example.invalid\nbotcentral-verify=citefleet-app\n", { status: 200, headers: plain });
    }
    if (url.endsWith(`/${key}.txt`)) {
      return new Response(`${key}\n`, { status: 200, headers: plain });
    }
    return new Response("<!doctype html><title>ok</title>", { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;

  const audit = await auditSite({ ...site(), indexNowKey: key });
  for (const id of ["llms-ok", "wellknown-ok", "sitemap-ok", "indexnow-key"]) {
    assert.ok(audit.findings.some((f) => f.id === id), `expected ${id}: ${audit.findings.map((f) => f.id).join(", ")}`);
  }
  assert.ok(audit.findings.some((f) => f.id.startsWith("robots") && f.severity === "ok"));
});

test("Google Cloud Storage's octet-stream proof file still passes", async () => {
  // It is not an app shell — it is the right bytes with a download content-type.
  // Flagging it here would send the customer chasing the wrong problem.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/.well-known/botcentral.txt")) {
      return new Response("botcentral-verify=citefleet-app\n", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    }
    return new Response("<!doctype html><title>x</title>", { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  const audit = await auditSite(site());
  assert.ok(audit.findings.some((f) => f.id === "wellknown-ok"));
});

test("an IndexNow key file that is an HTML page mentioning the key is refused", async () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/${key}.txt`)) {
      return new Response(`<!doctype html><body>your key is ${key}</body>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("x", { status: 404, headers: { "content-type": "text/plain" } });
  }) as typeof fetch;
  const audit = await auditSite({ ...site(), indexNowKey: key });
  assert.ok(audit.findings.some((f) => f.id === "indexnow-key-missing"));
});
