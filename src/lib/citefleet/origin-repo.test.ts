import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOriginPack } from "./originPack.ts";
import type { Site } from "./types.ts";
import {
  normalizeRoot,
  originRepoConflict,
  repoSlot,
} from "./origin-repo.ts";

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
  } as Site;
}

// The production state that made this rule necessary: three properties, all
// three attached to mitchvac/citefleet public/. Read off the campaign pages on
// citefleet.app, 2026-09-09.
const CITEFLEET = site({
  id: "site-cite",
  name: "Citefleet",
  domain: "citefleet.app",
  url: "https://citefleet.app",
  github: { owner: "mitchvac", repo: "Citefleet", branch: "main", root: "public" },
});
const WFLOW = site({
  id: "site-wflow",
  name: "wflowprocess",
  domain: "wflowprocess.app",
  url: "https://wflowprocess.app",
  github: { owner: "mitchvac", repo: "citefleet", branch: "main", root: "public" },
});
const RESO = site({
  id: "site-reso",
  name: "Resonance",
  domain: "resonanse.app",
  url: "https://resonanse.app",
  github: { owner: "mitchvac", repo: "citefleet", branch: "main", root: "public" },
});

test("the collision is real: two properties in one root write the same four paths", () => {
  const paths = (s: Site) =>
    buildOriginPack(s)
      .map((f) => f.path)
      .sort();
  // Not a theoretical clash — identical destinations, different content.
  assert.deepEqual(paths(CITEFLEET), paths(WFLOW));
  assert.deepEqual(paths(CITEFLEET), paths(RESO));
  const robots = (s: Site) =>
    buildOriginPack(s).find((f) => f.path.endsWith("robots.txt"))!.content;
  assert.notEqual(robots(CITEFLEET), robots(WFLOW));
});

test("reproduction: wflowprocess.app may not claim mitchvac/citefleet public/", () => {
  const conflict = originRepoConflict(WFLOW, WFLOW.github!, [CITEFLEET, WFLOW, RESO]);
  assert.ok(conflict, "expected the attach to be refused");
  assert.equal(conflict.reason, "citefleet-repo");
  assert.match(conflict.message, /not mitchvac\/citefleet/);
});

test("reproduction: resonanse.app may not claim mitchvac/citefleet public/", () => {
  const conflict = originRepoConflict(RESO, RESO.github!, [CITEFLEET, WFLOW, RESO]);
  assert.ok(conflict, "expected the attach to be refused");
  assert.equal(conflict.reason, "citefleet-repo");
});

test("citefleet.app keeps its own repo even while the other two are squatting it", () => {
  // A bad row must never deadlock the good one: if wflowprocess.app squatting
  // mitchvac/citefleet could block citefleet.app, there would be no order in
  // which the operator could repair the store.
  assert.equal(
    originRepoConflict(CITEFLEET, CITEFLEET.github!, [CITEFLEET, WFLOW, RESO]),
    null,
  );
});

test("the fix the operator applies is accepted", () => {
  // wflowprocess.app deploys from mitchvac/wflowprocess frontend/public.
  assert.equal(
    originRepoConflict(
      WFLOW,
      { owner: "mitchvac", repo: "wflowprocess", root: "frontend/public" },
      [CITEFLEET, WFLOW, RESO],
    ),
    null,
  );
  // resonanse.app deploys from mitchvac/resonanse public/.
  assert.equal(
    originRepoConflict(RESO, { owner: "mitchvac", repo: "resonanse", root: "public" }, [
      CITEFLEET,
      WFLOW,
      RESO,
    ]),
    null,
  );
});

test("a property re-saving its own repo is not a conflict with itself", () => {
  const a = site({ id: "a", domain: "a.com", url: "https://a.com",
    github: { owner: "mitchvac", repo: "a-site", branch: "main", root: "public" } });
  assert.equal(
    originRepoConflict(a, { owner: "mitchvac", repo: "a-site", root: "public" }, [a]),
    null,
  );
});

// The hardcoded name check could never have caught these.
test("any repo already held by another property is refused, not just citefleet", () => {
  const a = site({ id: "a", domain: "a.com", url: "https://a.com",
    github: { owner: "mitchvac", repo: "shared", branch: "main", root: "public" } });
  const b = site({ id: "b", domain: "b.com", url: "https://b.com" });
  const conflict = originRepoConflict(b, { owner: "mitchvac", repo: "shared", root: "public" }, [a, b]);
  assert.ok(conflict);
  assert.equal(conflict.reason, "claimed-by-other-site");
  assert.equal(conflict.otherDomain, "a.com");
  assert.match(conflict.message, /would overwrite them/);
});

test("owner and repo compare case-insensitively, the way GitHub resolves them", () => {
  const a = site({ id: "a", domain: "a.com", url: "https://a.com",
    github: { owner: "MitchVac", repo: "Shared", branch: "main", root: "public" } });
  const b = site({ id: "b", domain: "b.com", url: "https://b.com" });
  assert.ok(
    originRepoConflict(b, { owner: "mitchvac", repo: "shared", root: "public" }, [a, b]),
    "mitchvac/shared and MitchVac/Shared are one repository",
  );
});

test("a monorepo may serve two properties from two different roots", () => {
  const a = site({ id: "a", domain: "a.com", url: "https://a.com",
    github: { owner: "mitchvac", repo: "mono", branch: "main", root: "apps/a/public" } });
  const b = site({ id: "b", domain: "b.com", url: "https://b.com" });
  assert.equal(
    originRepoConflict(b, { owner: "mitchvac", repo: "mono", root: "apps/b/public" }, [a, b]),
    null,
  );
  // Roots are paths, and paths inside a repo are case-sensitive.
  assert.equal(repoSlot({ owner: "o", repo: "r", root: "Public" }) === repoSlot({ owner: "o", repo: "r", root: "public" }), false);
});

test("an unconfigured repo is not a conflict", () => {
  assert.equal(originRepoConflict(WFLOW, { owner: "", repo: "" }, [CITEFLEET]), null);
  assert.equal(originRepoConflict(WFLOW, { owner: "mitchvac", repo: "" }, [CITEFLEET]), null);
});

test("normalization matches what attachGithub persists", () => {
  assert.equal(normalizeRoot(undefined), "public");
  assert.equal(normalizeRoot("/frontend/public/"), "frontend/public");
  assert.equal(normalizeRoot(""), "");
  assert.equal(repoSlot({ owner: "@mitchvac", repo: "resonanse.git", root: "/public/" }), "mitchvac/resonanse:public");
});
