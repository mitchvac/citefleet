import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOriginPack } from "./originPack.ts";
import type { Site } from "./types.ts";
import {
  OWNER_MARKER,
  classifyOriginFile,
  frameworkSourceDirs,
  isCiteFleetOwned,
  isWritable,
  planOriginPack,
  shadowedOriginFile,
} from "./origin-ownership.ts";

// The files that were actually live in mitchvac/Resonanse public/ on
// 2026-09-09, copied verbatim. These are the fixtures that matter: a synthetic
// "someone else's robots.txt" proves nothing, because the bug was never that
// CiteFleet mishandled a made-up file — it was that it overwrote THESE.
const LIVE_ROBOTS = `User-agent: *
Allow: /
Allow: /llms.txt
Disallow: /discover
Disallow: /matches
Disallow: /likes
Disallow: /chat
Disallow: /wallet
Disallow: /settings
Disallow: /profile
Disallow: /onboarding
Disallow: /profile-setup
Disallow: /api/

User-agent: GPTBot
Allow: /
Allow: /llms.txt

Sitemap: https://resonanse.app/sitemap.xml
`;

const LIVE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://resonanse.app/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://resonanse.app/premium</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
`;

const LIVE_LLMS = `# Resonance (resonanse.app)

> Resonance is a premium dating app: a small daily queue of people matched on intent.

Preferred citation name: Resonance.
`;

// Already deployed on both live properties. Predates OWNER_MARKER and is
// CiteFleet's own format — the legacy signature has to recognise it or every
// push would be refused forever on the one file CiteFleet genuinely owns.
const LIVE_BOTCENTRAL = `# BotCentral origin proof — resonanse.app
domain: resonanse.app
canonical: https://resonanse.app
publisher: citefleet
catalog: https://botcentral.org/site/resonanse.app
verify: citefleet-app
botcentral-verify=53d4d21e031928c30e8e5cc009371852
`;

function site(over: Partial<Site> = {}): Site {
  return {
    id: "site-reso",
    workspaceId: "ws",
    name: "Resonance",
    domain: "resonanse.app",
    url: "https://resonanse.app",
    status: "waiting",
    sitemapUrl: "https://resonanse.app/sitemap.xml",
    routes: ["/", "/privacy", "/terms", "/about"],
    createdAt: "2026-09-01T00:00:00.000Z",
    scores: { technical: 100, submissions: 100, mentions: 33, overall: 80 },
    summary: "Technical foundation complete. Campaign is in crawl → index → cite.",
    github: { owner: "mitchvac", repo: "Resonanse", branch: "main", root: "public" },
    ...over,
  } as Site;
}

test("a hand-written robots.txt is refused, not overwritten", () => {
  const v = classifyOriginFile({
    path: "public/robots.txt",
    generated: "# Written by CiteFleet.\nUser-agent: *\nAllow: /\n",
    remote: LIVE_ROBOTS,
  });
  assert.equal(v.state, "refused");
  assert.equal(isWritable(v.state), false);
  assert.match(v.reason, /not written by CiteFleet/);
});

test("a hand-written sitemap.xml and llms.txt are refused", () => {
  for (const [path, remote] of [
    ["public/sitemap.xml", LIVE_SITEMAP],
    ["public/llms.txt", LIVE_LLMS],
  ] as const) {
    const v = classifyOriginFile({ path, generated: "generated\n", remote });
    assert.equal(v.state, "refused", path);
  }
});

test("the legacy botcentral.txt is recognised as CiteFleet's own", () => {
  assert.equal(
    isCiteFleetOwned("public/.well-known/botcentral.txt", LIVE_BOTCENTRAL),
    true,
  );
  const v = classifyOriginFile({
    path: "public/.well-known/botcentral.txt",
    generated: LIVE_BOTCENTRAL.replace("citefleet-app", "citefleet-app-2"),
    remote: LIVE_BOTCENTRAL,
  });
  assert.equal(v.state, "update");
  assert.equal(isWritable(v.state), true);
});

test("the legacy signature is scoped to its path — it cannot vouch for another file", () => {
  // A robots.txt that merely mentions the string must not inherit
  // botcentral.txt's legacy exemption.
  assert.equal(
    isCiteFleetOwned("public/robots.txt", "# publisher: citefleet\nUser-agent: *\n"),
    false,
  );
});

test("a file carrying the marker is CiteFleet's, in any comment syntax", () => {
  assert.equal(isCiteFleetOwned("public/robots.txt", `# ${OWNER_MARKER}.\n`), true);
  assert.equal(
    isCiteFleetOwned("public/sitemap.xml", `<!-- ${OWNER_MARKER} -->\n`),
    true,
  );
  assert.equal(isCiteFleetOwned("public/llms.txt", `<!-- ${OWNER_MARKER} -->\n`), true);
});

test("an absent file is created; an identical file is a no-op", () => {
  assert.equal(
    classifyOriginFile({ path: "public/robots.txt", generated: "x\n", remote: null })
      .state,
    "create",
  );
  assert.equal(
    classifyOriginFile({ path: "public/robots.txt", generated: "x\n", remote: "x\n" })
      .state,
    "identical",
  );
});

test("identical wins over refused — a byte-equal foreign file is not a conflict", () => {
  // Ordering matters: if `refused` were tested first, a repo already holding
  // exactly the right content would report a false conflict forever.
  const v = classifyOriginFile({
    path: "public/robots.txt",
    generated: LIVE_ROBOTS,
    remote: LIVE_ROBOTS,
  });
  assert.equal(v.state, "identical");
  assert.equal(isWritable(v.state), false);
});

test("a path the caller never read is refused, never written blind", () => {
  const plan = planOriginPack(
    [{ path: "public/robots.txt", content: "x\n" }],
    new Map(),
  );
  assert.equal(plan.verdicts[0].state, "refused");
  assert.match(plan.verdicts[0].reason, /not read/);
  assert.equal(plan.writable.length, 0);
});

test("the real Resonanse pack: only botcentral.txt is writable", () => {
  // The end-to-end shape of the incident. Three refusals, one write.
  const files = buildOriginPack(site());
  const remotes = new Map<string, string | null>([
    ["public/robots.txt", LIVE_ROBOTS],
    ["public/sitemap.xml", LIVE_SITEMAP],
    ["public/llms.txt", LIVE_LLMS],
    ["public/.well-known/botcentral.txt", LIVE_BOTCENTRAL],
  ]);
  const plan = planOriginPack(files, remotes);

  assert.equal(plan.blocked.length, 3);
  assert.deepEqual(
    plan.blocked.map((v) => v.path).sort(),
    ["public/llms.txt", "public/robots.txt", "public/sitemap.xml"],
  );
  assert.deepEqual(
    plan.writable.map((v) => v.path),
    ["public/.well-known/botcentral.txt"],
  );
  assert.equal(plan.noop, false);
});

test("a repo CiteFleet already owns end to end stays fully writable", () => {
  // Positive control (Rule 20): the same instrument that produced three
  // refusals above must produce zero here, or the refusals prove nothing.
  const files = buildOriginPack(site());
  const remotes = new Map<string, string | null>(
    files.map((f) => [f.path, `${f.content}\n<!-- edited -->`]),
  );
  const plan = planOriginPack(files, remotes);
  assert.equal(plan.blocked.length, 0);
  assert.equal(plan.writable.length, files.length);
});

// --- framework-generated routes -------------------------------------------
// mitchvac/wflowprocess: Next.js 14.2.35, frontend/app/robots.ts and
// frontend/app/sitemap.ts, and NOTHING at frontend/public/robots.txt or
// frontend/public/sitemap.xml. Ownership alone calls both `create`, which is
// how the dangerous push looks safe.

test("shadowedOriginFile maps a route source to the file it takes over", () => {
  assert.equal(shadowedOriginFile("robots.ts"), "robots.txt");
  assert.equal(shadowedOriginFile("sitemap.tsx"), "sitemap.xml");
  assert.equal(shadowedOriginFile("sitemap.mjs"), "sitemap.xml");
  // Not a metadata route, and must never be mistaken for one.
  assert.equal(shadowedOriginFile("robots.txt"), null);
  assert.equal(shadowedOriginFile("sitemap.xml"), null);
  assert.equal(shadowedOriginFile("layout.tsx"), null);
});

test("TanStack Start's escaped file routes shadow the same two paths", () => {
  // The case this guard shipped without covering, in the repo it shipped from:
  // CiteFleet's src/routes/sitemap[.]xml.ts lists nine real paths and is
  // shadowed by its own pushed public/sitemap.xml, so citefleet.app serves five
  // generated URLs — three of them 404 — and never its own nine.
  assert.equal(shadowedOriginFile("sitemap[.]xml.ts"), "sitemap.xml");
  assert.equal(shadowedOriginFile("robots[.]txt.ts"), "robots.txt");
  assert.equal(shadowedOriginFile("llms[.]txt.ts"), null);
});

test("frameworkSourceDirs covers TanStack's routes directory", () => {
  const dirs = frameworkSourceDirs("public");
  assert.ok(dirs.includes("src/routes"), `src/routes missing from ${dirs.join(", ")}`);
  assert.ok(dirs.includes("routes"), `routes missing from ${dirs.join(", ")}`);
});

test("CiteFleet's own repo shape: the pushed sitemap is refused as shadowed", () => {
  // public/sitemap.xml exists AND is CiteFleet-owned, so ownership alone would
  // say `update`. The framework check must override, because updating it keeps
  // the app's nine-path sitemap suppressed.
  const files = [{ path: "public/sitemap.xml", content: "<urlset/>" }];
  const remotes = new Map<string, string | null>([["public/sitemap.xml", "<urlset/>old"]]);
  const plan = planOriginPack(
    files,
    remotes,
    new Map([["sitemap.xml", "src/routes/sitemap[.]xml.ts"]]),
  );
  assert.equal(plan.verdicts[0].state, "shadowed");
  assert.equal(plan.verdicts[0].shadowedBy, "src/routes/sitemap[.]xml.ts");
  assert.equal(plan.writable.length, 0);
});

test("frameworkSourceDirs looks beside the origin folder, not inside it", () => {
  assert.deepEqual(frameworkSourceDirs("frontend/public"), [
    "frontend/app",
    "frontend/src/app",
    "frontend/pages",
    "frontend/src/pages",
    "frontend/routes",
    "frontend/src/routes",
  ]);
  assert.deepEqual(frameworkSourceDirs("public"), [
    "app",
    "src/app",
    "pages",
    "src/pages",
    "routes",
    "src/routes",
  ]);
  assert.deepEqual(frameworkSourceDirs("apps/web/public"), [
    "apps/web/app",
    "apps/web/src/app",
    "apps/web/pages",
    "apps/web/src/pages",
    "apps/web/routes",
    "apps/web/src/routes",
  ]);
});

test("an empty path is still refused when the app owns the route", () => {
  // The wflowprocess case exactly: nothing at the static path, so ownership
  // says create. The framework check has to override that.
  const files = buildOriginPack(
    site({
      id: "site-wflow",
      name: "wflowprocess",
      domain: "wflowprocess.app",
      url: "https://wflowprocess.app",
      github: {
        owner: "mitchvac",
        repo: "wflowprocess",
        branch: "main",
        root: "frontend/public",
      },
    }),
  );
  const remotes = new Map<string, string | null>(files.map((f) => [f.path, null]));
  const frameworkRoutes = new Map([
    ["robots.txt", "frontend/app/robots.ts"],
    ["sitemap.xml", "frontend/app/sitemap.ts"],
  ]);
  const plan = planOriginPack(files, remotes, frameworkRoutes);

  const byPath = new Map(plan.verdicts.map((v) => [v.path, v]));
  assert.equal(byPath.get("frontend/public/robots.txt")!.state, "shadowed");
  assert.equal(
    byPath.get("frontend/public/robots.txt")!.shadowedBy,
    "frontend/app/robots.ts",
  );
  assert.equal(byPath.get("frontend/public/sitemap.xml")!.state, "shadowed");
  // The other two are untouched by the framework check and still create.
  assert.equal(byPath.get("frontend/public/llms.txt")!.state, "create");
  assert.equal(
    byPath.get("frontend/public/.well-known/botcentral.txt")!.state,
    "create",
  );
  assert.equal(plan.blocked.length, 2);
  assert.equal(plan.writable.length, 2);
  assert.equal(isWritable("shadowed"), false);
});

test("shadowing outranks ownership — it refuses even a CiteFleet-owned file", () => {
  // If CiteFleet pushed the static twin BEFORE the app grew a robots.ts, the
  // file is CiteFleet's and would classify as `update`. It must still be
  // refused: updating it keeps the app's route suppressed.
  const files = [{ path: "frontend/public/robots.txt", content: `# ${OWNER_MARKER}\nnew\n` }];
  const remotes = new Map<string, string | null>([
    ["frontend/public/robots.txt", `# ${OWNER_MARKER}\nold\n`],
  ]);
  assert.equal(planOriginPack(files, remotes).verdicts[0].state, "update");
  const plan = planOriginPack(
    files,
    remotes,
    new Map([["robots.txt", "frontend/app/robots.ts"]]),
  );
  assert.equal(plan.verdicts[0].state, "shadowed");
  assert.equal(plan.writable.length, 0);
});

test("no framework sources means no shadowing — the control for the two above", () => {
  const files = buildOriginPack(site());
  const remotes = new Map<string, string | null>(files.map((f) => [f.path, null]));
  const plan = planOriginPack(files, remotes, new Map());
  assert.equal(plan.blocked.length, 0);
  assert.equal(plan.writable.length, files.length);
});
