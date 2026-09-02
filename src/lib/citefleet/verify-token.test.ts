import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOriginPack } from "./originPack.ts";
import type { Site } from "./types.ts";
import {
  BOTCENTRAL_VERIFY_TOKEN,
  normalizeDomain,
  siteVerifyToken,
  verifyLine,
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
    name: "Acme Dating",
    domain: "acme-dating.com",
    url: "https://acme-dating.com",
    status: "auditing",
    sitemapUrl: "https://acme-dating.com/sitemap.xml",
    routes: ["/", "/privacy"],
    createdAt: "2026-09-01T00:00:00.000Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
    ...over,
  };
}

test("mirrored verifier helpers detect the failure cases (positive controls)", () => {
  assert.equal(looksLikeHtml("<!DOCTYPE html><html><head></head><body>x</body></html>"), true);
  assert.equal(looksLikeHtml("# plain\nbotcentral-verify=abc\n"), false);
  assert.equal(tokenPresent("botcentral-verify=abc\n", "abc"), true);
  assert.equal(tokenPresent("botcentral-verify=abc\n", "zzz"), false);
  assert.equal(tokenPresent("verify: something-else\n", BOTCENTRAL_VERIFY_TOKEN), false);
});

test("the card token is the shared publisher token for every site", () => {
  for (const s of [site(), site({ id: "site-other", domain: "example.org" }), site({ verifyToken: "stale-hmac" })]) {
    assert.equal(siteVerifyToken(s), BOTCENTRAL_VERIFY_TOKEN);
  }
  assert.equal(verifyLine(), "botcentral-verify=citefleet-app");
});

test("the origin pack file carries the token and passes BotCentral's rules", () => {
  const wk = buildOriginPack(site()).find((f) => f.path === "public/.well-known/botcentral.txt")!;
  assert.ok(wk, "well-known file present");
  assert.ok(wk.content.split("\n").includes(verifyLine()), "has botcentral-verify line");
  assert.equal(looksLikeHtml(wk.content), false);
  assert.equal(tokenPresent(wk.content, siteVerifyToken(site())), true);
});

test("files already deployed with only the legacy line still pass (no customer redeploy)", () => {
  const legacy = [
    "# BotCentral origin proof — acme-dating.com",
    "domain: acme-dating.com",
    "publisher: citefleet",
    "verify: citefleet-app",
    "",
  ].join("\n");
  assert.equal(tokenPresent(legacy, siteVerifyToken(site())), true);
  assert.equal(tokenPresent(legacy, "site-1a2b3c4d"), false, "the old per-site id never matched");
});

test("normalizeDomain strips scheme, path, www, case", () => {
  assert.equal(normalizeDomain(" https://WWW.Example.COM/x/y "), "example.com");
  assert.equal(normalizeDomain("example.com"), "example.com");
});

test("origin pack honours the GitHub root folder", () => {
  const files = buildOriginPack(
    site({ github: { owner: "acme", repo: "site", branch: "main", root: "frontend/public" } }),
  );
  assert.ok(files.some((f) => f.path === "frontend/public/.well-known/botcentral.txt"));
});
