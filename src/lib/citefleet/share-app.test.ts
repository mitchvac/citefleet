import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FALLBACK_ORIGIN,
  SHARE_PATH,
  SHARE_TEXT,
  SHARE_TITLE,
  shareApp,
  shareTarget,
} from "./share-app.ts";

test("shareTarget: the public /start page on the live origin, trailing slash or not", () => {
  assert.deepEqual(shareTarget("https://citefleet.app"), {
    title: SHARE_TITLE,
    text: SHARE_TEXT,
    url: "https://citefleet.app/start",
  });
  assert.equal(shareTarget("https://citefleet.app/").url, "https://citefleet.app/start");
  assert.equal(shareTarget("http://127.0.0.1:8080").url, "http://127.0.0.1:8080/start");
  assert.equal(SHARE_PATH, "/start");
});

test("shareTarget: no origin (SSR, file://) falls back to production rather than a relative link", () => {
  assert.equal(shareTarget("").url, `${FALLBACK_ORIGIN}/start`);
  assert.equal(shareTarget("   ").url, `${FALLBACK_ORIGIN}/start`);
});

test("the share text makes no claim the product does not keep", () => {
  // The three steps named are the three the /start page walks (start.tsx STEPS).
  for (const claim of ["prove the origin", "publish the files bots read", "list it on BotCentral"]) {
    assert.ok(SHARE_TEXT.includes(claim), claim);
  }
  assert.ok(!/free|guarantee|instant|#1/i.test(SHARE_TEXT), "no marketing claim the product cannot back");
});

const target = shareTarget("https://citefleet.app");

test("native sheet present and accepted → shared, and the clipboard is never touched", async () => {
  const got: unknown[] = [];
  const copied: string[] = [];
  const out = await shareApp(target, {
    share: async (d) => { got.push(d); },
    copy: async (t) => { copied.push(t); },
  });
  assert.equal(out, "shared");
  assert.deepEqual(got, [target]);
  assert.deepEqual(copied, []);
});

test("sheet dismissed (AbortError) → dismissed; the link is NOT copied behind the person's back", async () => {
  const copied: string[] = [];
  const abort = Object.assign(new Error("Share canceled"), { name: "AbortError" });
  const out = await shareApp(target, {
    share: async () => { throw abort; },
    copy: async (t) => { copied.push(t); },
  });
  assert.equal(out, "dismissed");
  assert.deepEqual(copied, []);
});

test("sheet present but refuses (any other error) → the link is copied instead", async () => {
  const copied: string[] = [];
  const out = await shareApp(target, {
    share: async () => { throw Object.assign(new Error("no targets"), { name: "NotAllowedError" }); },
    copy: async (t) => { copied.push(t); },
  });
  assert.equal(out, "copied");
  assert.deepEqual(copied, [target.url]);
});

test("no sheet (desktop) → the link is copied", async () => {
  const copied: string[] = [];
  const out = await shareApp(target, { share: null, copy: async (t) => { copied.push(t); } });
  assert.equal(out, "copied");
  assert.deepEqual(copied, ["https://citefleet.app/start"]);
});

test("no sheet and the clipboard is blocked → unavailable, never a false 'copied'", async () => {
  const out = await shareApp(target, {
    share: null,
    copy: async () => { throw new DOMException("denied", "NotAllowedError"); },
  });
  assert.equal(out, "unavailable");
});

test("no sheet and no clipboard at all → unavailable", async () => {
  assert.equal(await shareApp(target, { share: null, copy: null }), "unavailable");
});
