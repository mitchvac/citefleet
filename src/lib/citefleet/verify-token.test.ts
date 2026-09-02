import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOriginPack } from "./originPack.ts";
import type { Site } from "./types.ts";
import {
  VERIFY_LINE_PREFIX,
  normalizeDomain,
  siteVerifyToken,
  verifyLine,
  verifyTokenFor,
} from "./verify-token.ts";

// Mirrors BotCentral's verifier (mitchvac/botcentral src/lib/verify.ts) so the
// file CiteFleet writes is checked against the rules the registry applies.
function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase();
  return (
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("<head") ||
    head.includes("<body")
  );
}
function tokenPresent(haystack: string, token: string): boolean {
  if (!token) return false;
  return haystack.includes(`botcentral-verify=${token}`) || haystack.includes(token);
}

function site(over: Partial<Site> = {}): Site {
  return {
    id: "site-1a2b3c4d",
    workspaceId: "ws",
    name: "WflowProcess",
    domain: "wflowprocess.app",
    url: "https://wflowprocess.app",
    status: "auditing",
    sitemapUrl: "https://wflowprocess.app/sitemap.xml",
    routes: ["/", "/privacy"],
    createdAt: "2026-09-01T00:00:00.000Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
    ...over,
  };
}

test("token is 128-bit hex and deterministic per apex domain", () => {
  const a = verifyTokenFor("wflowprocess.app", "secret-1");
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.equal(verifyTokenFor("WWW.WflowProcess.app", "secret-1"), a);
  assert.equal(verifyTokenFor("https://wflowprocess.app/premium", "secret-1"), a);
  assert.notEqual(verifyTokenFor("example.org", "secret-1"), a);
  assert.notEqual(verifyTokenFor("wflowprocess.app", "secret-2"), a);
});

test("re-onboarding the same domain yields the same token (no site.id in the mix)", () => {
  const s1 = site({ id: "site-aaaaaaaa" });
  const s2 = site({ id: "site-bbbbbbbb" });
  assert.equal(verifyTokenFor(s1.domain, "k"), verifyTokenFor(s2.domain, "k"));
});

test("unkeyed fallback still deterministic and distinct from keyed", () => {
  const unkeyed = verifyTokenFor("wflowprocess.app", "");
  assert.match(unkeyed, /^[0-9a-f]{32}$/);
  assert.equal(verifyTokenFor("wflowprocess.app", ""), unkeyed);
  assert.notEqual(verifyTokenFor("wflowprocess.app", "k"), unkeyed);
});

test("normalizeDomain strips scheme, path, www, case", () => {
  assert.equal(normalizeDomain(" https://WWW.Example.COM/x/y "), "example.com");
  assert.equal(normalizeDomain("example.com"), "example.com");
});

test("mirrored verifier helpers detect the failure cases (positive controls)", () => {
  assert.equal(looksLikeHtml("<!DOCTYPE html><html><head></head><body>x</body></html>"), true);
  assert.equal(looksLikeHtml("# plain\nbotcentral-verify=abc\n"), false);
  assert.equal(tokenPresent("botcentral-verify=abc\n", "abc"), true);
  assert.equal(tokenPresent("botcentral-verify=abc\n", "zzz"), false);
  assert.equal(tokenPresent("verify: citefleet-app\n", "site-1a2b3c4d"), false, "legacy file vs old site.id");
});

test("card token and origin-pack line come from the same source (the fixed invariant)", () => {
  // botcentral.ts buildCard uses siteVerifyToken(site); originPack.ts writes verifyLine(siteVerifyToken(site)).
  for (const s of [site(), site({ verifyToken: "deadbeefdeadbeefdeadbeefdeadbeef" }), site({ id: "site-other" })]) {
    const token = siteVerifyToken(s);
    const wk = buildOriginPack(s).find((f) => f.path.endsWith(".well-known/botcentral.txt"))!;
    assert.ok(wk.content.split("\n").includes(verifyLine(token)));
    assert.equal(tokenPresent(wk.content, token), true);
    assert.equal(tokenPresent(wk.content, s.id), false, "site.id is no longer the token");
  }
  assert.equal(siteVerifyToken(site({ verifyToken: "persisted" })), "persisted", "persisted value wins");
});

test("origin pack well-known file passes BotCentral's well-known-file rules", () => {
  const token = verifyTokenFor("wflowprocess.app", "k");
  const files = buildOriginPack(site({ verifyToken: token }));
  const wk = files.find((f) => f.path === "public/.well-known/botcentral.txt");
  assert.ok(wk, "well-known file present");
  assert.ok(wk.content.split("\n").includes(verifyLine(token)), "has botcentral-verify line");
  assert.equal(looksLikeHtml(wk.content), false);
  assert.equal(tokenPresent(wk.content, token), true);
  assert.equal(wk.content.includes("verify: citefleet-app"), false, "legacy line removed");
});

test("origin pack falls back to the derived token when the site has none", () => {
  const files = buildOriginPack(site());
  const wk = files.find((f) => f.path === "public/.well-known/botcentral.txt")!;
  const derived = verifyTokenFor("wflowprocess.app");
  assert.ok(wk.content.includes(`${VERIFY_LINE_PREFIX}${derived}`));
});

test("origin pack honours the GitHub root folder", () => {
  const files = buildOriginPack(
    site({ github: { owner: "mitchvac", repo: "wflowprocess", branch: "main", root: "frontend/public" } }),
  );
  assert.ok(files.some((f) => f.path === "frontend/public/.well-known/botcentral.txt"));
});
