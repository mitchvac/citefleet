import assert from "node:assert/strict";
import { test } from "node:test";
import type { Site, StoreShape, Task } from "./types.ts";
import { applyCatalogState } from "./botcentral.ts";
import {
  BOTCENTRAL_HOOK_PATH,
  botcentralHookSecret,
  botcentralHookUrl,
  handleBotcentralWebhook,
  signGithubPayload,
  type CatalogHookDeps,
} from "./webhook.ts";

// BotCentral → CiteFleet. Verified live 2026-09-06 on 144.91.66.158:
// BOTCENTRAL_PUBLISHER_WEBHOOK=https://citefleet.app/api/hooks/botcentral,
// BOTCENTRAL_WEBHOOK_SECRET unset, so the events are signed with the shared
// service token — and nginx showed 26 of them answered 404 because this route
// did not exist. Payload shapes are copied from BotCentral src/lib/publisher.ts
// `notifyPublisher` and src/lib/publish.ts (`lapseListing`, `reverifyDomain`).

const SECRET = "169b" + "f".repeat(60);
const NOW = new Date("2026-09-06T18:00:00.000Z");

function site(over: Partial<Site> = {}): Site {
  return {
    id: "site-herald", workspaceId: "ws", name: "Herald", domain: "herald.example", url: "https://herald.example",
    status: "campaign", sitemapUrl: "https://herald.example/sitemap.xml", routes: ["/"], createdAt: "2026-09-01T00:00:00.000Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 }, summary: "",
    botcentral: { listed: true, verified: true, verificationMethod: "well-known-file", href: "https://botcentral.org/site/herald.example" },
    ...over,
  };
}
function listingTask(status: Task["status"]): Task {
  return {
    id: "task-site-herald-botcentral_list", siteId: "site-herald", playbookId: "botcentral_list", title: "List on BotCentral",
    description: "", status, priority: 2, checklist: [{ id: "c1", label: "listed", done: status === "done" }], evidence: [],
    updatedAt: "2026-09-01T00:00:00.000Z", completedAt: status === "done" ? "2026-09-01T00:00:00.000Z" : undefined,
  };
}
function harness(sites: Site[], tasks: Task[] = [listingTask("done")]) {
  const store = { sites, tasks, activity: [] } as unknown as StoreShape;
  const deps: CatalogHookDeps = {
    getStore: async () => store,
    mutateStore: async (fn) => { fn(store); },
    apply: applyCatalogState,
    catalogUrl: "https://botcentral.org",
    secret: SECRET,
    now: () => NOW,
  };
  return { store, deps };
}
const body = (event: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ botcentral: "1.1", event, created: NOW.toISOString(), publisher: "citefleet", domain: "herald.example", href: "/v1/site/herald.example", ...extra });
// BotCentral always sends x-botcentral-event; default it to the body's event so
// each test names only the header it wants to be wrong.
const bodyEvent = (raw: string) => { try { return String((JSON.parse(raw) as { event?: unknown }).event ?? ""); } catch { return ""; } };
const headers = (raw: string, secret = SECRET, event: string | null = bodyEvent(raw)) => {
  const h: Record<string, string> = { "x-botcentral-signature": signGithubPayload(raw, secret) };
  if (event) h["x-botcentral-event"] = event;
  return (name: string) => h[name.toLowerCase()] ?? null;
};
const post = (raw: string, deps: CatalogHookDeps, secret = SECRET, event: string | null = bodyEvent(raw)) =>
  handleBotcentralWebhook({ rawBody: raw, header: headers(raw, secret, event) }, deps);

test("the hook path and the secret order match what BotCentral is configured with", () => {
  assert.equal(BOTCENTRAL_HOOK_PATH, "/api/hooks/botcentral");
  assert.equal(botcentralHookUrl("https://citefleet.app/"), "https://citefleet.app/api/hooks/botcentral");
  // BotCentral: BOTCENTRAL_WEBHOOK_SECRET, else the publisher token (= the shared service token).
  assert.equal(botcentralHookSecret({ BOTCENTRAL_WEBHOOK_SECRET: " w ", BOTCENTRAL_SERVICE_TOKEN: "t" }), "w");
  assert.equal(botcentralHookSecret({ BOTCENTRAL_SERVICE_TOKEN: "t" }), "t");
  assert.equal(botcentralHookSecret({}), "");
});

test("fails closed: bad signature, wrong secret, no secret, missing header all answer 401", async () => {
  const { deps } = harness([site()]);
  const raw = body("site.reverified", { verification: { method: "unverified", note: "gone" } });
  assert.equal((await post(raw, deps, "other-secret-of-the-same-length".padEnd(64, "x"))).status, 401);
  assert.equal((await handleBotcentralWebhook({ rawBody: raw, header: () => null }, deps)).status, 401);
  assert.equal((await post(raw, { ...deps, secret: "" })).status, 401);
  // A blank or short secret is "not configured", whoever supplied it — the
  // same floor /health reports, so the two can never disagree.
  assert.equal((await post(raw, { ...deps, secret: "   " })).status, 401);
  assert.equal((await post(raw, { ...deps, secret: "x" })).status, 401);
  // A padded secret is used trimmed on both sides.
  assert.equal((await post(raw, { ...deps, secret: `  ${SECRET}  ` })).status, 202);
  const tampered = raw.replace("herald.example", "herald.example.evil");
  assert.equal((await handleBotcentralWebhook({ rawBody: tampered, header: headers(raw) }, deps)).status, 401);
});

test("rejects a non-JSON body, an unknown event, and a header that disagrees with the body", async () => {
  const { deps } = harness([site()]);
  assert.equal((await post("not json", deps)).status, 400);
  assert.equal((await post(body("site.exploded"), deps)).status, 400);
  assert.equal((await post(body("site.reverified"), deps, SECRET, "site.lapsed")).status, 400);
  // The header is required: BotCentral always sends it, so a body without one is not BotCentral.
  assert.equal((await post(body("site.reverified"), deps, SECRET, null)).status, 400);
  assert.equal((await post(JSON.stringify({ event: "site.reverified" }), deps)).status, 400);
});

test("a signed event for a host that is not a property is acknowledged and ignored (the fixture filter)", async () => {
  const { store, deps } = harness([site()]);
  const raw = JSON.stringify({ event: "site.reverified", domain: "clearwater.credit", verification: { method: "unverified" } });
  const res = await post(raw, deps);
  assert.equal(res.status, 202);
  assert.equal(res.body.action, "ignore");
  assert.equal(res.body.domain, "clearwater.credit");
  // Nothing written: no audit line about a site nobody here owns.
  assert.equal(store.activity.length, 0);
});

test("site.reverified downgrading the card revokes the listing task, with BotCentral's own note", async () => {
  const { store, deps } = harness([site()]);
  const note = "Origin reachable, no token. Add DNS TXT botcentral-verify=<token> or a plain-text /.well-known/botcentral.txt.";
  const res = await post(body("site.reverified", { verification: { method: "unverified", note } }), deps, SECRET, "site.reverified");
  assert.equal(res.status, 202);
  assert.equal(res.body.action, "revoke");
  const s = store.sites[0];
  assert.equal(s.botcentral?.listed, true);
  assert.equal(s.botcentral?.verified, false);
  assert.equal(s.botcentral?.verificationNote, note);
  assert.deepEqual(s.catalogHook, { lastEventAt: NOW.toISOString(), lastEvent: "site.reverified" });
  const task = store.tasks[0];
  assert.equal(task.status, "blocked");
  assert.match(task.blockedReason ?? "", /no longer proven \(unverified\)/);
  assert.match(task.blockedReason ?? "", /Add DNS TXT/);
  assert.ok(store.activity.some((a) => /site\.reverified for herald\.example/.test(a.message)));
  // The same answer again moves nothing (there is no delivery id to dedupe on).
  const again = await post(body("site.reverified", { verification: { method: "unverified", note } }), deps);
  assert.equal(again.body.action, "none");
});

test("site.reverified restoring proof grants a blocked task", async () => {
  const { store, deps } = harness([site({ botcentral: { listed: true, verified: false, verificationMethod: "unverified" } })], [listingTask("blocked")]);
  const res = await post(body("site.reverified", { verification: { method: "well-known-file", note: "Token matched." } }), deps);
  assert.equal(res.body.action, "grant");
  assert.equal(store.tasks[0].status, "done");
  assert.equal(store.sites[0].botcentral?.verified, true);
  assert.equal(store.sites[0].botcentral?.href, "https://botcentral.org/site/herald.example");
});

test("site.lapsed records the term, marks the card unproven, and says what renews it", async () => {
  const { store, deps } = harness([site()]);
  const paidUntil = "2026-09-05T00:00:00.000Z";
  const raw = body("site.lapsed", {
    verification: { method: "unverified", note: "Listing term ended 2026-09-05. Proof is not re-checked until the listing is renewed." },
    term: { status: "lapsed", paid_until: paidUntil, usd: "10.00", term_days: 365 },
  });
  const res = await post(raw, deps, SECRET, "site.lapsed");
  assert.equal(res.status, 202);
  assert.equal(res.body.action, "revoke");
  const s = store.sites[0];
  assert.deepEqual(s.term, { status: "lapsed", paidUntil, usd: "10.00", termDays: 365, at: NOW.toISOString(), source: "webhook" });
  assert.equal(s.botcentral?.verified, false);
  assert.match(s.botcentral?.verificationNote ?? "", /Listing term ended 2026-09-05/);
  assert.match(s.botcentral?.verificationNote ?? "", /top up the key, then List on BotCentral/);
  assert.match(store.tasks[0].blockedReason ?? "", /top up the key/);
  assert.ok(store.activity.some((a) => /site\.lapsed for herald\.example: Listing year ended 2026-09-05/.test(a.message)));
});

test("site.listed grants and clears a pending 402; site.unpublished revokes as gone", async () => {
  const pending = site({
    botcentral: { listed: false },
    payment: { reason: "insufficient", usd: "10.00", termDays: 365, topup: "https://citefleet.app/topup?prefix=bc_live_1&product=botcentral", message: "needs $10", at: "2026-09-06T00:00:00.000Z" },
  });
  const { store, deps } = harness([pending], [listingTask("blocked")]);
  const listed = await post(body("site.listed", { verification: { method: "dns-txt" } }), deps);
  assert.equal(listed.body.action, "grant");
  assert.equal(store.sites[0].payment, undefined);
  assert.equal(store.tasks[0].status, "done");

  const gone = await post(body("site.unpublished"), deps);
  assert.equal(gone.body.action, "revoke");
  assert.equal(store.sites[0].botcentral?.listed, false);
  assert.match(store.tasks[0].blockedReason ?? "", /gone from the catalog/);
});
