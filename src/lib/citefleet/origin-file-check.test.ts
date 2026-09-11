import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkIndexNowKeyFile,
  checkLlms,
  checkRobots,
  checkSitemapDoc,
  checkWellKnownFile,
  isHtmlish,
  looksLikeHtml,
} from "./origin-file-check.ts";
import { buildOriginPack } from "./originPack.ts";
import type { Site } from "./types.ts";

// These predicates exist because a 200 is not a file. Every case below is a real
// platform behaviour named in docs/providers/README.md, not an invented input.

const file = (over: Partial<{ status: number; text: string; contentType: string }> = {}) => ({
  status: 200,
  text: "",
  contentType: "text/plain",
  ...over,
});

const TOKEN = "citefleet-app";

test("a 200 that is really an app shell is refused — Azure navigationFallback", () => {
  // Azure Static Web Apps serves /index.html with status 200 for a missing path.
  const shell = file({ text: "<!DOCTYPE html><html><head><title>Acme</title></head>…" });
  assert.equal(checkRobots(shell).ok, false);
  assert.match(checkRobots(shell).reason, /returned HTML/);
  assert.equal(checkLlms(shell).ok, false);
  assert.equal(checkWellKnownFile(shell, TOKEN).ok, false);
  assert.equal(checkSitemapDoc(shell).ok, false);
});

test("a 200 declaring text/html is refused even when the body looks clean", () => {
  // DigitalOcean's catchall_document can serve a body with no doctype at all.
  const sneaky = file({ text: "User-agent: *\nAllow: /\n", contentType: "text/html; charset=utf-8" });
  assert.equal(isHtmlish(sneaky), true);
  assert.equal(checkRobots(sneaky).ok, false, "content-type alone must disqualify it");
});

test("Google Cloud Storage's octet-stream default is NOT treated as HTML", () => {
  // It fails BotCentral's plain-text rule for a different reason (it downloads
  // rather than renders), but it is not an app shell — so these predicates, which
  // only judge "is this a page", must pass it. Flagging it here would be wrong.
  const gcs = file({
    text: `botcentral-verify=${TOKEN}\ndomain: acme.com\n`,
    contentType: "application/octet-stream",
  });
  assert.equal(isHtmlish(gcs), false);
  assert.equal(checkWellKnownFile(gcs, TOKEN).ok, true);
});

test("a non-200 is reported with the status the customer will see", () => {
  assert.match(checkRobots(file({ status: 404 })).reason, /returned 404/);
  assert.match(checkLlms(file({ status: 403 })).reason, /returned 403/);
});

test("an empty 200 is refused", () => {
  assert.match(checkRobots(file({ text: "   \n" })).reason, /is empty/);
});

test("robots.txt that actually serves passes", () => {
  assert.deepEqual(checkRobots(file({ text: "User-agent: *\nAllow: /\n" })), {
    ok: true,
    reason: "",
  });
});

test("the sitemap must be XML that lists something", () => {
  assert.match(checkSitemapDoc(file({ text: "not xml at all" })).reason, /not XML/);
  assert.match(
    checkSitemapDoc(file({ text: '<?xml version="1.0"?><urlset></urlset>' })).reason,
    /lists no URLs/,
  );
  assert.equal(
    checkSitemapDoc(file({ text: "<urlset><url><loc>https://a.com/</loc></url></urlset>" })).ok,
    true,
  );
  // A sitemap index is a valid sitemap document — WordPress core serves one.
  assert.equal(
    checkSitemapDoc(file({ text: "<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>" })).ok,
    true,
  );
});

test("CiteFleet's OWN generated llms.txt passes checkLlms", () => {
  // The regression this predicate exists for. `monitor.ts` asserted
  // `text.trim().startsWith("#")`, but buildOriginPack emits an HTML ownership
  // comment as line 1 — so CiteFleet's own file failed CiteFleet's own check.
  const site = {
    name: "Acme",
    domain: "acme.com",
    url: "https://acme.com",
    summary: "",
    routes: ["/"],
  } as unknown as Site;
  const llms = buildOriginPack(site).find((f) => f.path.endsWith("llms.txt"));
  assert.ok(llms, "positive control: the pack contains llms.txt");
  assert.ok(llms.content.startsWith("<!--"), "positive control: it really does open with a comment");
  assert.equal(checkLlms(file({ text: llms.content })).ok, true);
  // And the old rule really would have failed it — the bug was real.
  assert.equal(llms.content.trim().startsWith("#"), false);
});

test("llms.txt with no heading anywhere is refused", () => {
  assert.match(checkLlms(file({ text: "just some prose\n" })).reason, /no markdown heading/);
});

test("the well-known file must carry the TOKEN, not merely a domain line", () => {
  // The monitor's old predicate matched /domain:\s*\S+/i, so a file written by
  // somebody else entirely read as CiteFleet's proof.
  const strangers = file({ text: "domain: acme.com\npublisher: someone-else\n" });
  assert.equal(checkWellKnownFile(strangers, TOKEN).ok, false);
  assert.match(checkWellKnownFile(strangers, TOKEN).reason, /botcentral-verify=citefleet-app/);
  assert.equal(checkWellKnownFile(file({ text: `botcentral-verify=${TOKEN}\n` }), TOKEN).ok, true);
});

test("the IndexNow key file must be the key and nothing else", () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  assert.equal(checkIndexNowKeyFile(file({ text: `${key}\n` }), key).ok, true);
  // An HTML page that merely mentions the key used to pass, because the old
  // check was `text.includes(key)`.
  const page = file({ text: `<!doctype html><body>your key is ${key}</body>` });
  assert.equal(checkIndexNowKeyFile(page, key).ok, false);
  assert.match(checkIndexNowKeyFile(file({ text: `${key} extra` }), key).reason, /nothing else/);
});

test("looksLikeHtml reads only the head of the body", () => {
  assert.equal(looksLikeHtml("<!DOCTYPE html>"), true);
  assert.equal(looksLikeHtml("<html>"), true);
  assert.equal(looksLikeHtml("User-agent: *"), false);
  // Past 400 bytes it is not a page pretending to be a file.
  assert.equal(looksLikeHtml(`${"x".repeat(500)}<html>`), false);
});
