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

// --- the screen and the checker must name the SAME token --------------------
//
// `siteVerifyToken` ignores a site's stored `verifyToken` and returns the one
// shared publisher token, and every server path — the card (botcentral.ts), the
// origin pack (originPack.ts), the pre-flight proof (proof.ts), onboarding and
// push (dispatcher.ts, github.ts) — goes through it. The UI printed the STORED
// value instead, so a property carrying a per-site token from before the
// shared-token decision (f842b9d) was told on screen to serve a line nothing
// checks. Measured in production 2026-09-09: wflowprocess.app stored
// `6ffa50ab224c2a593f43b89e7cf2d506`, and a proof file built from its campaign
// page would never have verified.

test("a stored per-site token never changes the token the checker wants", () => {
  const legacy = site({
    domain: "wflowprocess.app",
    verifyToken: "6ffa50ab224c2a593f43b89e7cf2d506",
  });
  assert.equal(siteVerifyToken(legacy), BOTCENTRAL_VERIFY_TOKEN);
  // The line an operator is shown must satisfy the check that will be run.
  assert.equal(
    tokenPresent(`${verifyLine(siteVerifyToken(legacy))}\n`, siteVerifyToken(legacy)),
    true,
  );
  // The line the OLD screen showed would not have.
  assert.equal(
    tokenPresent(`botcentral-verify=${legacy.verifyToken}\n`, siteVerifyToken(legacy)),
    false,
  );
});

test("no component prints a site's stored verifyToken to the operator", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../../components/citefleet/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".tsx"));

  // Positive control (Rule 20): the scan must be able to find something that IS
  // there, or "no matches" proves nothing about the thing being absent.
  let sawVerifyLineCall = false;
  const offenders: string[] = [];
  for (const f of files) {
    const raw = await readFile(new URL(f, dir), "utf8");
    // Strip comments first: this file's own explanation of the defect names
    // `site.verifyToken`, and a scan that reads prose as code reports it.
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    if (src.includes("verifyLine(siteVerifyToken(")) sawVerifyLineCall = true;
    if (/\bsite\.verifyToken\b/.test(src)) offenders.push(f);
  }
  assert.ok(files.length > 5, `expected to scan several components, saw ${files.length}`);
  assert.equal(
    sawVerifyLineCall,
    true,
    "positive control failed: no component calls verifyLine(siteVerifyToken(…)), so this scan cannot be trusted",
  );
  assert.deepEqual(
    offenders,
    [],
    `these components print the stored token instead of siteVerifyToken(site): ${offenders.join(", ")}`,
  );
});
