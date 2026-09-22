import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createJiti } from "jiti";
import { seedStore } from "./seed.ts";
import type { StoreShape } from "./types.ts";
import type { WorkspaceHandle } from "./workspace-handle.ts";
import type { WorkspaceId } from "./workspace-id.ts";

const { onboardSite, runAuditAndApply, submitIndexNowForSite, runWebhookListing, patchTask, setIndexNowKey } = await createJiti(import.meta.url).import("./dispatcher.ts") as typeof import("./dispatcher.ts");

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function workspace(): WorkspaceHandle {
  const id = "ws-indexnow-test" as WorkspaceId;
  let store: StoreShape = seedStore(id);
  return {
    id,
    async get() { return structuredClone(store); },
    async mutate<T>(fn: (current: StoreShape) => T): Promise<T> {
      const next = structuredClone(store);
      const result = fn(next);
      store = next;
      return result;
    },
  };
}

test("a live IndexNow key alone does not mark URL submission complete", async () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\nSitemap: https://example.invalid/sitemap.xml\n", { status: 200 });
    if (url.endsWith("/sitemap.xml")) return new Response('<?xml version="1.0"?><urlset><url><loc>https://example.invalid/</loc></url></urlset>', { status: 200 });
    if (url.endsWith(`/${key}.txt`)) return new Response(key, { status: 200, headers: { "content-type": "text/plain" } });
    if (url.endsWith("/.well-known/botcentral.txt")) return new Response("botcentral-verify=citefleet-app", { status: 200 });
    if (url.endsWith("/llms.txt")) return new Response("# Example", { status: 200 });
    return new Response("<!doctype html><title>Example</title>", { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;

  const ws = workspace();
  const site = await onboardSite(ws, { name: "Example", url: "https://example.invalid", indexNowKey: key });
  const audit = await runAuditAndApply(ws, site.id);
  assert.ok(audit.findings.some((finding) => finding.id === "indexnow-key"), "key-file positive control");
  const task = (await ws.get()).tasks.find((item) => item.siteId === site.id && item.playbookId === "indexnow");
  assert.ok(task);
  assert.notEqual(task.status, "done", "no IndexNow request was sent");
  assert.equal(task.checklist[1]?.done, false, "the POST checklist item stays open");
});

test("the customer action sends a real POST and records received, not indexed", async () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  let posts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith(`/${key}.txt`)) return new Response(key, { status: 200, headers: { "content-type": "text/plain" } });
    if (url.endsWith("/sitemap.xml")) return new Response('<urlset><url><loc>https://example.invalid/</loc></url></urlset>', { status: 200 });
    if (url === "https://api.indexnow.org/indexnow") {
      posts += 1;
      assert.equal(init?.method, "POST");
      return new Response("", { status: 202 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  const ws = workspace();
  const site = await onboardSite(ws, { name: "Example", url: "https://example.invalid", indexNowKey: key });
  const result = await submitIndexNowForSite(ws, site.id);
  assert.equal(posts, 1);
  assert.equal(result.accepted, true);
  assert.equal(result.pending, true);
  const current = await ws.get();
  assert.equal(current.sites.find((item) => item.id === site.id)?.indexNowSubmission?.status, 202);
  const task = current.tasks.find((item) => item.siteId === site.id && item.playbookId === "indexnow");
  assert.ok(task);
  assert.equal(task.checklist[0]?.done, true);
  assert.equal(task.checklist[1]?.done, true);
  assert.equal(task.checklist[2]?.done, false, "no deploy hook has yet fired");
  assert.notEqual(task.status, "done");
});

test("a push does not submit stale pages; a confirmed deploy does", async () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  let posts = 0;
  const ws = workspace();
  const site = await onboardSite(ws, { name: "Example", url: "https://example.invalid", indexNowKey: key });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/.well-known/botcentral.txt")) return new Response(`botcentral-verify=${site.verifyToken}`, { status: 200, headers: { "content-type": "text/plain" } });
    if (url.endsWith(`/${key}.txt`)) return new Response(key, { status: 200, headers: { "content-type": "text/plain" } });
    if (url.endsWith("/sitemap.xml")) return new Response('<urlset><url><loc>https://example.invalid/</loc></url></urlset>', { status: 200 });
    if (url === "https://api.indexnow.org/indexnow") { posts += 1; return new Response("", { status: 200 }); }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  await runWebhookListing(ws, site.id, "push to main", { attempts: 1, delayMs: 0 });
  assert.equal(posts, 0);
  const deployed = await runWebhookListing(ws, site.id, "deploy reported", { attempts: 1, delayMs: 0 });
  assert.equal(posts, 1, JSON.stringify(deployed));
  const task = (await ws.get()).tasks.find((item) => item.siteId === site.id && item.playbookId === "indexnow");
  assert.equal(task?.checklist[2]?.done, true);
  assert.equal(task?.status, "done");
});


test("manual checklist changes cannot claim an IndexNow receipt", async () => {
  const ws = workspace();
  const site = await onboardSite(ws, { name: "Example", url: "https://example.invalid" });
  const task = (await ws.get()).tasks.find((item) => item.siteId === site.id && item.playbookId === "indexnow");
  assert.ok(task);
  await assert.rejects(
    patchTask(ws, task.id, { checklistId: task.checklist[1].id, done: true }),
    /verified submission/,
  );
  await assert.rejects(patchTask(ws, task.id, { status: "done" }), /verified submission/);
  assert.notEqual((await ws.get()).tasks.find((item) => item.id === task.id)?.status, "done");
});

test("rotating the key clears the previous receipt and checklist", async () => {
  const first = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  const second = "c4d3e2f1a6b5c4d3e2f1a6b5c4d3e2f1";
  const ws = workspace();
  const site = await onboardSite(ws, { name: "Example", url: "https://example.invalid", indexNowKey: first });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/${first}.txt`)) return new Response(first, { status: 200, headers: { "content-type": "text/plain" } });
    if (url.endsWith("/sitemap.xml")) return new Response('<urlset><url><loc>https://example.invalid/</loc></url></urlset>', { status: 200 });
    if (url === "https://api.indexnow.org/indexnow") return new Response("", { status: 200 });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  assert.equal((await submitIndexNowForSite(ws, site.id)).accepted, true);
  await setIndexNowKey(ws, site.id, second);
  const current = await ws.get();
  assert.equal(current.sites.find((item) => item.id === site.id)?.indexNowSubmission, undefined);
  const task = current.tasks.find((item) => item.siteId === site.id && item.playbookId === "indexnow");
  assert.ok(task);
  assert.equal(task.status, "assigned");
  assert.ok(task.checklist.every((item) => !item.done));
});


test("a deploy notifies IndexNow even when BotCentral proof is absent", async () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  const ws = workspace();
  const site = await onboardSite(ws, { name: "Example", url: "https://example.invalid", indexNowKey: key });
  let posts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/${key}.txt`)) return new Response(key, { status: 200, headers: { "content-type": "text/plain" } });
    if (url.endsWith("/sitemap.xml")) return new Response('<urlset><url><loc>https://example.invalid/</loc></url></urlset>', { status: 200 });
    if (url.endsWith("/.well-known/botcentral.txt")) return new Response("missing", { status: 404 });
    if (url === "https://api.indexnow.org/indexnow") { posts += 1; return new Response("", { status: 200 }); }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  const result = await runWebhookListing(ws, site.id, "deploy reported", { attempts: 1, delayMs: 0 });
  assert.equal(result.ok, false, "BotCentral proof remains absent");
  assert.equal(posts, 1);
  assert.equal((await ws.get()).sites.find((item) => item.id === site.id)?.indexNowSubmission?.accepted, true);
});


test("the submissions kill switch prevents manual and deploy POSTs", async () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  const ws = workspace();
  const site = await onboardSite(ws, { name: "Example", url: "https://example.invalid", indexNowKey: key });
  await ws.mutate((store) => { store.control.kill.doors.submissions = true; });
  let posts = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://api.indexnow.org/indexnow") { posts += 1; return new Response("", { status: 200 }); }
    if (url.endsWith("/.well-known/botcentral.txt")) return new Response("missing", { status: 404 });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  await assert.rejects(submitIndexNowForSite(ws, site.id), /submissions door is frozen/);
  await runWebhookListing(ws, site.id, "deploy reported", { attempts: 1, delayMs: 0 });
  assert.equal(posts, 0);
  assert.equal((await ws.get()).sites.find((item) => item.id === site.id)?.indexNowSubmission, undefined);
});
