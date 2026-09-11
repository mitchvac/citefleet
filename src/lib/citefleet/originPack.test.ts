import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOriginPack, originRoot, packFiles } from "./originPack.ts";
import type { Site } from "./types.ts";

// Two views of one pack: `packFiles` is what a customer types into a hosting
// panel (web-root-relative) and `buildOriginPack` is what the GitHub push writes
// (repo-relative). They MUST be the same bytes, or a proof that verifies one
// customer's origin would not verify another's.

function site(over: Partial<Site> = {}): Site {
  return {
    id: "s1",
    workspaceId: "w1",
    name: "Acme",
    domain: "acme.com",
    url: "https://acme.com",
    status: "campaign",
    sitemapUrl: "https://acme.com/sitemap.xml",
    routes: ["/", "/pricing"],
    createdAt: "2026-09-01T00:00:00Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
    ...over,
  } as Site;
}

test("the two views differ only by the repo folder", () => {
  const s = site({ indexNowKey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" });
  const web = packFiles(s);
  const repo = buildOriginPack(s);
  assert.equal(web.length, 5);
  assert.equal(repo.length, 5);
  for (let i = 0; i < web.length; i += 1) {
    assert.equal(repo[i].path, `public/${web[i].path}`);
    assert.equal(repo[i].content, web[i].content, `${web[i].path} bytes must match exactly`);
  }
});

test("the web view carries no repo folder — a File Manager user needs these paths", () => {
  const paths = packFiles(site()).map((f) => f.path);
  assert.deepEqual(paths, [
    "robots.txt",
    "sitemap.xml",
    "llms.txt",
    ".well-known/botcentral.txt",
  ]);
  for (const p of paths) assert.ok(!p.startsWith("public/"), p);
});

test("a custom repo root moves the repo view only", () => {
  const s = site({ github: { owner: "o", repo: "r", branch: "main", root: "www" } } as Partial<Site>);
  assert.equal(originRoot(s), "www");
  assert.equal(buildOriginPack(s)[0].path, "www/robots.txt");
  assert.equal(packFiles(s)[0].path, "robots.txt", "the web root is not the repo folder");
});

test("robots.txt points at the sitemap the site ACTUALLY serves", () => {
  // WordPress core serves /wp-sitemap.xml and Yoast /sitemap_index.xml —
  // roughly 40% of the web. The old hardcoded /sitemap.xml pointed crawlers at
  // a 404 for all of them.
  const wp = packFiles(site({ sitemapUrl: "https://acme.com/wp-sitemap.xml" }));
  const robots = wp.find((f) => f.path === "robots.txt")!;
  assert.match(robots.content, /^Sitemap: https:\/\/acme\.com\/wp-sitemap\.xml$/m);
  assert.doesNotMatch(robots.content, /Sitemap: https:\/\/acme\.com\/sitemap\.xml/);
});

test("a site with the default sitemap emits exactly what it always did", () => {
  // The regression pin. `dispatcher.ts` sets sitemapUrl to `${url}/sitemap.xml`
  // at onboard, so for every property that has not been audited the bytes must
  // be unchanged — four of these are already deployed and would otherwise
  // classify as `update` on the next push for no reason.
  const robots = packFiles(site()).find((f) => f.path === "robots.txt")!;
  assert.match(robots.content, /^Sitemap: https:\/\/acme\.com\/sitemap\.xml$/m);
});

test("a missing sitemapUrl falls back rather than emitting an empty directive", () => {
  const robots = packFiles(site({ sitemapUrl: "" })).find((f) => f.path === "robots.txt")!;
  assert.match(robots.content, /^Sitemap: https:\/\/acme\.com\/sitemap\.xml$/m);
  assert.doesNotMatch(robots.content, /^Sitemap: *$/m);
});

test("the proof file carries the line the verifier looks for", () => {
  const wk = packFiles(site()).find((f) => f.path === ".well-known/botcentral.txt")!;
  assert.match(wk.content, /botcentral-verify=citefleet-app/);
});

test("every generated file is non-empty and ends with a newline", () => {
  for (const f of packFiles(site({ indexNowKey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }))) {
    assert.ok(f.content.length > 0, f.path);
    assert.ok(f.content.endsWith("\n"), `${f.path} must end with a newline`);
  }
});

// --- All FIVE files -----------------------------------------------------------
// The pack is five. It silently shipped four for any property with no IndexNow
// key, which was every property onboarded before keys were generated.

const PACK_PATHS = [
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  ".well-known/botcentral.txt",
];

test("a site with a key ships all five files, web view and repo view alike", () => {
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  const s = site({ indexNowKey: key });
  assert.deepEqual(
    packFiles(s).map((f) => f.path),
    [...PACK_PATHS, `${key}.txt`],
  );
  assert.deepEqual(
    buildOriginPack(s).map((f) => f.path),
    [...PACK_PATHS, `${key}.txt`].map((p) => `public/${p}`),
  );
});

test("the fifth file is exactly the key and nothing else", () => {
  // IndexNow rejects a key file with anything extra in it.
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  const f = packFiles(site({ indexNowKey: key })).find((x) => x.path === `${key}.txt`)!;
  assert.equal(f.content, `${key}\n`);
  assert.equal(f.content.trim(), key);
});

test("a site with NO key ships four — which is why ensureIndexNowKey exists", () => {
  // The regression this documents: nothing generated a key, so this was the
  // normal case rather than the exception. `ensureIndexNowKey` is now called
  // before every push and inspect, and the panel offers it explicitly.
  const four = packFiles(site());
  assert.equal(four.length, 4);
  assert.deepEqual(four.map((f) => f.path), PACK_PATHS);
});

test("every one of the five is reachable from the web root by the path given", () => {
  // A path a customer types into a file manager must not carry the repo folder
  // and must not be absolute — both would put the file somewhere it is not served.
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  for (const f of packFiles(site({ indexNowKey: key }))) {
    assert.ok(!f.path.startsWith("/"), `${f.path} must be relative to the web root`);
    assert.ok(!f.path.startsWith("public/"), `${f.path} must not carry the repo folder`);
    assert.ok(!f.path.includes(".."), f.path);
  }
});
