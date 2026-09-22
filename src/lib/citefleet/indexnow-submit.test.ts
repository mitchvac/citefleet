import assert from "node:assert/strict";
import { test } from "node:test";
import { submitIndexNow } from "./indexnow-submit.ts";

const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const site = {
  url: "https://example.com",
  domain: "example.com",
  sitemapUrl: "https://example.com/sitemap.xml",
  indexNowKey: key,
};
const sitemap = '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/about?a=1&amp;b=2</loc></url></urlset>';

function replies(status: number, posted: Array<Record<string, unknown>>, keyBody = key, sitemapBody = sitemap): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith(`/${key}.txt`)) return new Response(keyBody, { status: 200, headers: { "content-type": "text/plain" } });
    if (url.endsWith("/sitemap.xml")) return new Response(sitemapBody, { status: 200, headers: { "content-type": "application/xml" } });
    if (url === "https://api.indexnow.org/indexnow") {
      posted.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response("", { status });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
}

test("submits only live same-host sitemap URLs with a verified key", async () => {
  const posted: Array<Record<string, unknown>> = [];
  const result = await submitIndexNow(site, { fetchImpl: replies(200, posted), sleep: async () => {} });
  assert.equal(result.accepted, true);
  assert.equal(result.keyVerified, true);
  assert.equal(result.urlCount, 2);
  assert.deepEqual(posted, [{
    host: "example.com", key, keyLocation: `https://example.com/${key}.txt`,
    urlList: ["https://example.com/", "https://example.com/about?a=1&b=2"],
  }]);
  assert.match(result.note, /does not confirm indexing/);
});

test("HTTP 202 is received with key validation pending, not indexed", async () => {
  const result = await submitIndexNow(site, { fetchImpl: replies(202, []), sleep: async () => {} });
  assert.equal(result.accepted, true);
  assert.equal(result.pending, true);
  assert.equal(result.status, 202);
});

test("an HTML key-file response blocks submission", async () => {
  const posted: Array<Record<string, unknown>> = [];
  const result = await submitIndexNow(site, {
    fetchImpl: replies(200, posted, `<!doctype html><body>${key}</body>`), sleep: async () => {},
  });
  assert.equal(result.accepted, false);
  assert.equal(result.keyVerified, false);
  assert.deepEqual(posted, []);
  assert.match(result.note, /HTML/);
});

test("off-host sitemap URLs are rejected rather than submitted", async () => {
  const posted: Array<Record<string, unknown>> = [];
  const result = await submitIndexNow(site, {
    fetchImpl: replies(200, posted, key, '<urlset><url><loc>https://someone-else.example/</loc></url></urlset>'),
    sleep: async () => {},
  });
  assert.equal(result.accepted, false);
  assert.equal(result.keyVerified, true);
  assert.deepEqual(posted, []);
  assert.match(result.note, /outside the HTTPS origin/);
});

test("IndexNow HTTP 403 records refusal and URL count", async () => {
  const result = await submitIndexNow(site, { fetchImpl: replies(403, []), sleep: async () => {} });
  assert.equal(result.accepted, false);
  assert.equal(result.keyVerified, true);
  assert.equal(result.status, 403);
  assert.equal(result.urlCount, 2);
});


test("a redirected key response cannot satisfy same-origin proof", async () => {
  let posts = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.redirect, "error");
    const url = String(input);
    if (url.endsWith(`/${key}.txt`)) {
      const response = new Response(key, { status: 200 });
      Object.defineProperty(response, "url", { value: "https://other.example/key.txt" });
      return response;
    }
    if (url === "https://api.indexnow.org/indexnow") posts += 1;
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  const result = await submitIndexNow(site, { fetchImpl, sleep: async () => {} });
  assert.equal(result.accepted, false);
  assert.equal(posts, 0);
  assert.match(result.note, /different URL/);
});
