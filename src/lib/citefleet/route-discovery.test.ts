import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ROUTES,
  discoverRoutes,
  isSitemapIndex,
  locsFromSitemap,
  routesFromLocs,
  sitemapUrlFromRobots,
} from "./route-discovery.ts";

// The robots.txt bodies these four properties actually served on 2026-09-09.
// botcentral.org is the one that broke the old absolute-URL-only check.
const ROBOTS_RELATIVE = `User-agent: *\nAllow: /\nAllow: /sitemaps/\nSitemap: /sitemaps/sitemap.xml\n`;
const ROBOTS_ABSOLUTE = `User-agent: *\nAllow: /\nSitemap: https://citefleet.app/sitemap.xml\n`;
const ROBOTS_NONE = `User-agent: *\nDisallow:\n`;

function sitemapOf(...urls: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n${urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
}

// --- robots.txt: where the sitemap is declared -----------------------------

test("a RELATIVE Sitemap: directive resolves against the origin", () => {
  // The exact case the old /sitemap:\s*https?:\/\//i check missed, which made
  // the auditor report "no Sitemap: directive found" for botcentral.org and
  // then fetch /sitemap.xml, which 404s.
  assert.equal(
    sitemapUrlFromRobots(ROBOTS_RELATIVE, "https://botcentral.org"),
    "https://botcentral.org/sitemaps/sitemap.xml",
  );
});

test("an ABSOLUTE Sitemap: directive is kept as-is", () => {
  assert.equal(
    sitemapUrlFromRobots(ROBOTS_ABSOLUTE, "https://citefleet.app"),
    "https://citefleet.app/sitemap.xml",
  );
});

test("no Sitemap: line yields null, and a junk scheme is refused", () => {
  assert.equal(sitemapUrlFromRobots(ROBOTS_NONE, "https://x.test"), null);
  assert.equal(sitemapUrlFromRobots("Sitemap: javascript:alert(1)\n", "https://x.test"), null);
  assert.equal(sitemapUrlFromRobots("", "https://x.test"), null);
});

test("the directive is matched case-insensitively and past leading space", () => {
  assert.equal(
    sitemapUrlFromRobots("  sitemap:   /m.xml  \n", "https://x.test"),
    "https://x.test/m.xml",
  );
});

// --- sitemap parsing -------------------------------------------------------

test("locsFromSitemap reads every <loc>, and isSitemapIndex tells the two apart", () => {
  const xml = sitemapOf("https://x.test/", "https://x.test/a");
  assert.deepEqual(locsFromSitemap(xml), ["https://x.test/", "https://x.test/a"]);
  assert.equal(isSitemapIndex(xml), false);
  assert.equal(isSitemapIndex('<sitemapindex xmlns="x"><sitemap><loc>u</loc></sitemap></sitemapindex>'), true);
});

// --- reducing URLs to routes ----------------------------------------------

test("off-origin URLs are dropped, not rewritten", () => {
  // A sitemap may legally point at a CDN. Those are not this property's routes.
  const routes = routesFromLocs(
    ["https://x.test/a", "https://cdn.other/b", "https://x.test/c"],
    "https://x.test",
  );
  assert.deepEqual(routes, ["/", "/a", "/c"]);
});

test("www is folded, trailing slashes normalised, duplicates collapsed", () => {
  const routes = routesFromLocs(
    ["https://www.x.test/a/", "https://x.test/a", "https://x.test/", "https://x.test"],
    "https://x.test",
  );
  assert.deepEqual(routes, ["/", "/a"]);
});

test("home is always present and always first, even if the sitemap omits it", () => {
  assert.deepEqual(routesFromLocs(["https://x.test/z"], "https://x.test"), ["/", "/z"]);
});

test("the route list is capped", () => {
  const many = Array.from({ length: MAX_ROUTES + 25 }, (_, i) => `https://x.test/p${i}`);
  assert.equal(routesFromLocs(many, "https://x.test").length, MAX_ROUTES);
});

test("garbage in never throws", () => {
  assert.deepEqual(routesFromLocs(["not-a-url", ""], "https://x.test"), ["/"]);
  assert.deepEqual(routesFromLocs(["https://x.test/a"], "not-an-origin"), ["/"]);
});

// --- end to end ------------------------------------------------------------

function deps(map: Record<string, { status: number | null; text: string }>) {
  return {
    fetchText: async (url: string) => map[url] ?? { status: 404, text: "" },
  };
}

test("botcentral.org's real shape: a relative declaration is followed", async () => {
  const got = await discoverRoutes(
    "https://botcentral.org",
    deps({
      "https://botcentral.org/robots.txt": { status: 200, text: ROBOTS_RELATIVE },
      // The path the OLD code assumed. It 404s, and must not be what is used.
      "https://botcentral.org/sitemap.xml": { status: 404, text: "" },
      "https://botcentral.org/sitemaps/sitemap.xml": {
        status: 200,
        text: sitemapOf("https://botcentral.org/", "https://botcentral.org/docs", "https://botcentral.org/agents"),
      },
    }),
  );
  assert.equal(got.sitemapUrl, "https://botcentral.org/sitemaps/sitemap.xml");
  assert.equal(got.source, "robots-declared");
  assert.deepEqual(got.routes, ["/", "/agents", "/docs"]);
  // And never the invented placeholder.
  assert.equal(got.routes.includes("/privacy"), false);
  assert.equal(got.routes.includes("/about"), false);
});

test("a sitemap index is followed one level", async () => {
  const got = await discoverRoutes(
    "https://x.test",
    deps({
      "https://x.test/robots.txt": { status: 200, text: ROBOTS_NONE },
      "https://x.test/sitemap.xml": {
        status: 200,
        text: `<sitemapindex><sitemap><loc>https://x.test/s1.xml</loc></sitemap></sitemapindex>`,
      },
      "https://x.test/s1.xml": { status: 200, text: sitemapOf("https://x.test/one", "https://x.test/two") },
    }),
  );
  assert.deepEqual(got.routes, ["/", "/one", "/two"]);
  assert.equal(got.source, "conventional-path");
});

test("an unreachable sitemap yields home only — never the placeholder, never a throw", async () => {
  const got = await discoverRoutes(
    "https://dead.test",
    deps({ "https://dead.test/robots.txt": { status: 200, text: ROBOTS_NONE } }),
  );
  assert.deepEqual(got.routes, ["/"]);
  assert.equal(got.sitemapUrl, null);
  assert.match(got.note, /404/);
});

test("a fetch that throws is survived, not propagated", async () => {
  const got = await discoverRoutes("https://boom.test", {
    fetchText: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.deepEqual(got.routes, ["/"]);
  assert.equal(got.sitemapUrl, null);
});

test("positive control: a healthy origin yields more than home", async () => {
  // The negative results above mean nothing unless this instrument can produce
  // a positive from the same code path.
  const got = await discoverRoutes(
    "https://good.test",
    deps({
      "https://good.test/robots.txt": { status: 200, text: "Sitemap: https://good.test/sitemap.xml\n" },
      "https://good.test/sitemap.xml": { status: 200, text: sitemapOf("https://good.test/", "https://good.test/pricing") },
    }),
  );
  assert.deepEqual(got.routes, ["/", "/pricing"]);
  assert.equal(got.source, "robots-declared");
});
