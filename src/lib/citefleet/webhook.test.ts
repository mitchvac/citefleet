import assert from "node:assert/strict";
import { test } from "node:test";
import type { Site, StoreShape } from "./types.ts";
import {
  classifyGithubEvent,
  deployedUrl,
  handleDeployedHook,
  handleGithubWebhook,
  newWebhookSecret,
  payloadUrl,
  signGithubPayload,
  siteForRepo,
  verifyGithubSignature,
} from "./webhook.ts";

function site(over: Partial<Site> = {}): Site {
  return {
    id: "site-acme", workspaceId: "ws", name: "Acme Dating", domain: "acme-dating.com", url: "https://acme-dating.com",
    status: "auditing", sitemapUrl: "https://acme-dating.com/sitemap.xml", routes: ["/"], createdAt: "2026-09-01T00:00:00.000Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 }, summary: "",
    github: { owner: "Acme", repo: "Site", branch: "main", root: "public" },
    webhook: { secret: "s3cret", createdAt: "2026-09-01T00:00:00.000Z" },
    ...over,
  };
}
function storeWith(sites: Site[]) {
  const store = { sites, activity: [] } as unknown as StoreShape;
  return {
    store,
    deps: {
      getStore: async () => store,
      mutateStore: async (fn: (s: StoreShape) => void) => { fn(store); },
      now: () => new Date("2026-09-02T12:00:00Z"),
    },
  };
}
const push = (ref: string) => JSON.stringify({ ref, repository: { full_name: "acme/site" } });
const headersFor = (raw: string, secret: string, event: string, extra: Record<string, string> = {}) => {
  const h: Record<string, string> = { "x-hub-signature-256": signGithubPayload(raw, secret), "x-github-event": event, "x-github-delivery": "d-1", ...extra };
  return (name: string) => h[name.toLowerCase()] ?? null;
};

test("secrets are 48 hex chars and the payload URL is the hooks path", () => {
  assert.match(newWebhookSecret(), /^[0-9a-f]{48}$/);
  assert.notEqual(newWebhookSecret(), newWebhookSecret());
  assert.equal(payloadUrl("https://citefleet.app/"), "https://citefleet.app/api/hooks/github");
});

test("signature verification: valid, tampered body, wrong secret, missing header", () => {
  const raw = '{"a":1}';
  const sig = signGithubPayload(raw, "k");
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  assert.equal(verifyGithubSignature(raw, sig, "k"), true);
  assert.equal(verifyGithubSignature('{"a":2}', sig, "k"), false);
  assert.equal(verifyGithubSignature(raw, sig, "other"), false);
  assert.equal(verifyGithubSignature(raw, null, "k"), false);
  assert.equal(verifyGithubSignature(raw, "sha256=short", "k"), false);
});

test("event classification: push to branch checks, other refs/events ignore, ping pings, deploy success checks", () => {
  const s = site();
  assert.deepEqual(classifyGithubEvent("push", { ref: "refs/heads/main" }, s), { action: "check", reason: "push to main" });
  assert.equal(classifyGithubEvent("push", { ref: "refs/heads/feature" }, s).action, "ignore");
  assert.equal(classifyGithubEvent("push", { ref: "refs/heads/main" }, site({ github: { owner: "a", repo: "b", branch: "release", root: "public" } })).action, "ignore");
  assert.equal(classifyGithubEvent("ping", {}, s).action, "ping");
  assert.equal(classifyGithubEvent("deployment_status", { deployment_status: { state: "success" } }, s).action, "check");
  assert.equal(classifyGithubEvent("deployment_status", { deployment_status: { state: "failure" } }, s).action, "ignore");
  assert.equal(classifyGithubEvent("issues", {}, s).action, "ignore");
});

test("siteForRepo matches owner/repo case-insensitively", () => {
  const s = site();
  assert.equal(siteForRepo({ sites: [s] }, "acme/site")?.id, "site-acme");
  assert.equal(siteForRepo({ sites: [s] }, "other/site"), undefined);
});

test("handler: non-JSON → 400, unknown repo → 404, bad signature → 401 (nothing recorded)", async () => {
  const { store, deps } = storeWith([site()]);
  const checks: string[] = [];
  const d = { ...deps, onCheck: (id: string) => checks.push(id) };
  assert.equal((await handleGithubWebhook({ rawBody: "nope", header: () => null }, d)).status, 400);
  const other = JSON.stringify({ ref: "refs/heads/main", repository: { full_name: "someone/else" } });
  assert.equal((await handleGithubWebhook({ rawBody: other, header: headersFor(other, "s3cret", "push") }, d)).status, 404);
  const raw = push("refs/heads/main");
  assert.equal((await handleGithubWebhook({ rawBody: raw, header: headersFor(raw, "wrong", "push") }, d)).status, 401);
  assert.equal(checks.length, 0);
  assert.equal(store.activity.length, 0);
  assert.equal(store.sites[0].webhook?.lastEventAt, undefined);
});

test("handler: ping → 200, push to main → 202 + check queued + audit line + last delivery", async () => {
  const { store, deps } = storeWith([site()]);
  const checks: string[] = [];
  const d = { ...deps, onCheck: (id: string) => checks.push(id) };
  const ping = JSON.stringify({ zen: "hi", repository: { full_name: "Acme/Site" } });
  const pr = await handleGithubWebhook({ rawBody: ping, header: headersFor(ping, "s3cret", "ping") }, d);
  assert.equal(pr.status, 200);
  assert.equal(pr.body.action, "ping");
  assert.equal(checks.length, 0);
  const raw = push("refs/heads/main");
  const r = await handleGithubWebhook({ rawBody: raw, header: headersFor(raw, "s3cret", "push") }, d);
  assert.equal(r.status, 202);
  assert.equal(r.body.action, "check");
  assert.deepEqual(checks, ["site-acme"]);
  assert.equal(store.sites[0].webhook?.lastDelivery, "d-1");
  assert.equal(store.sites[0].webhook?.lastEvent, "push · push to main");
  assert.match(store.activity[0].message, /Webhook received for acme-dating.com \(push to main\)/);
});

test("handler: push to another branch is acknowledged and ignored", async () => {
  const { store, deps } = storeWith([site()]);
  const checks: string[] = [];
  const raw = push("refs/heads/feature");
  const r = await handleGithubWebhook({ rawBody: raw, header: headersFor(raw, "s3cret", "push") }, { ...deps, onCheck: (id) => checks.push(id) });
  assert.equal(r.status, 202);
  assert.equal(r.body.action, "ignore");
  assert.equal(checks.length, 0);
  assert.match(store.activity[0].message, /ignored/);
});

test("deployed hook: signed {domain} queues the check; bad signature, unknown domain, bad body are refused", async () => {
  assert.equal(deployedUrl("https://citefleet.app"), "https://citefleet.app/api/hooks/deployed");
  const { store, deps } = storeWith([site()]);
  const checks: string[] = [];
  const d = { ...deps, onCheck: (id: string) => checks.push(id) };
  const body = JSON.stringify({ domain: "WWW.Acme-Dating.com" });
  const sig = signGithubPayload(body, "s3cret");
  const ok = await handleDeployedHook({ rawBody: body, header: (n) => ({ "x-citefleet-signature": sig, "x-citefleet-delivery": "ci-9" })[n.toLowerCase()] ?? null }, d);
  assert.equal(ok.status, 202);
  assert.equal(ok.body.action, "check");
  assert.deepEqual(checks, ["site-acme"]);
  assert.equal(store.sites[0].webhook?.lastDelivery, "ci-9");
  assert.match(store.activity[0].message, /Deploy hook received for acme-dating.com/);
  assert.equal((await handleDeployedHook({ rawBody: body, header: () => "sha256=bad" }, d)).status, 401);
  const other = JSON.stringify({ domain: "nobody.example" });
  assert.equal((await handleDeployedHook({ rawBody: other, header: () => signGithubPayload(other, "s3cret") }, d)).status, 404);
  assert.equal((await handleDeployedHook({ rawBody: "{}", header: () => null }, d)).status, 400);
  assert.equal((await handleDeployedHook({ rawBody: "x", header: () => null }, d)).status, 400);
  assert.equal(checks.length, 1);
});
