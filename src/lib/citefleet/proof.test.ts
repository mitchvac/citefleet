import assert from "node:assert/strict";
import { test } from "node:test";
import { checkOriginProof, looksLikeHtml, proofHint, tokenPresent, waitForProof } from "./proof.ts";
import { BOTCENTRAL_VERIFY_TOKEN } from "./verify-token.ts";

const site = { domain: "acme-dating.com" };
const now = () => new Date("2026-09-02T12:00:00Z");
const plain = (text: string) => async () => ({ status: 200, text, contentType: "text/plain; charset=utf-8" });
const noTxt = async () => [] as string[][];

test("mirrored rules detect the failure cases (positive controls)", () => {
  assert.equal(looksLikeHtml("<!DOCTYPE html><html><body>x</body></html>"), true);
  assert.equal(looksLikeHtml("# proof\nbotcentral-verify=citefleet-app\n"), false);
  assert.equal(tokenPresent("verify: citefleet-app\n", BOTCENTRAL_VERIFY_TOKEN), true);
  assert.equal(tokenPresent("verify: other\n", BOTCENTRAL_VERIFY_TOKEN), false);
});

test("plain-text file with the token proves by well-known-file", async () => {
  const r = await checkOriginProof(site, { fetchText: plain("domain: acme-dating.com\nbotcentral-verify=citefleet-app\n"), resolveTxt: noTxt, now });
  assert.equal(r.proven, true);
  assert.equal(r.method, "well-known-file");
  assert.equal(r.checkedAt, "2026-09-02T12:00:00.000Z");
});

test("a legacy file with only verify: citefleet-app still proves", async () => {
  const r = await checkOriginProof(site, { fetchText: plain("publisher: citefleet\nverify: citefleet-app\n"), resolveTxt: noTxt, now });
  assert.equal(r.proven, true);
});

test("an HTML shell with 200 is not proof; DNS TXT is checked next", async () => {
  const shell = async () => ({ status: 200, text: "<!doctype html><html><head><title>app</title></head><body>botcentral-verify=citefleet-app</body></html>", contentType: "text/html" });
  const dns = async () => [["v=spf1 -all"], ["botcentral-verify=citefleet-app"]];
  const r = await checkOriginProof(site, { fetchText: shell, resolveTxt: dns, now });
  assert.equal(r.proven, true);
  assert.equal(r.method, "dns-txt");
});

test("no file and no record: not proven, note names both and carries the hint", async () => {
  const missing = async () => ({ status: 404, text: "Not Found", contentType: "text/plain" });
  const r = await checkOriginProof(site, { fetchText: missing, resolveTxt: noTxt, now });
  assert.equal(r.proven, false);
  assert.equal(r.method, "none");
  assert.match(r.note, /returned 404/);
  assert.match(r.note, /no TXT records/);
  assert.ok(r.note.includes(proofHint(site)));
  assert.match(proofHint(site), /botcentral-verify=citefleet-app/);
  assert.match(proofHint(site), /https:\/\/acme-dating\.com\/\.well-known\/botcentral\.txt/);
});

test("fetch and DNS errors are reported, not thrown", async () => {
  const boom = async () => { throw new Error("ECONNREFUSED"); };
  const r = await checkOriginProof(site, { fetchText: boom, resolveTxt: async () => { throw new Error("ENOTFOUND"); }, now });
  assert.equal(r.proven, false);
  assert.match(r.note, /unreachable \(ECONNREFUSED\)/);
  assert.match(r.note, /DNS TXT lookup failed/);
});

test("waitForProof retries until the file appears and reports the attempt count", async () => {
  let calls = 0;
  const fetchText = async () => {
    calls++;
    return calls < 3
      ? { status: 404, text: "", contentType: "text/plain" }
      : { status: 200, text: "botcentral-verify=citefleet-app\n", contentType: "text/plain" };
  };
  const slept: number[] = [];
  const r = await waitForProof(site, { attempts: 5, delayMs: 7, deps: { fetchText, resolveTxt: noTxt, now }, sleep: async (ms) => { slept.push(ms); } });
  assert.equal(r.proven, true);
  assert.equal(r.attempts, 3);
  assert.deepEqual(slept, [7, 7]);
});

test("waitForProof gives up after the attempt budget", async () => {
  const r = await waitForProof(site, { attempts: 2, delayMs: 1, deps: { fetchText: async () => ({ status: 404, text: "", contentType: "" }), resolveTxt: noTxt, now }, sleep: async () => {} });
  assert.equal(r.proven, false);
  assert.equal(r.attempts, 2);
});
