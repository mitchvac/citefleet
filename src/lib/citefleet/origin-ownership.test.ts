import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOriginPack } from "./originPack.ts";
import type { Site } from "./types.ts";
import {
  OWNER_MARKER,
  classifyOriginFile,
  isCiteFleetOwned,
  isWritable,
  planOriginPack,
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

  assert.equal(plan.refused.length, 3);
  assert.deepEqual(
    plan.refused.map((v) => v.path).sort(),
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
  assert.equal(plan.refused.length, 0);
  assert.equal(plan.writable.length, files.length);
});
