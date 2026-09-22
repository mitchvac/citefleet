import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveVercelProject,
  installVercelRepoFiles,
  createVercelDeployment,
  readVercelDeployment,
  verifyVercelOriginFiles,
  isPublicVercelAddress,
  type VercelProjectTarget,
} from "./vercel-project.server.ts";
import { packFiles } from "./originPack.ts";
import type { Site } from "./types.ts";
import { asWorkspaceId } from "./workspace-id.ts";
const A = "a".repeat(40),
  B = "b".repeat(40),
  C = "c".repeat(40);
const site: Site = {
  id: "site-vercel-test",
  workspaceId: asWorkspaceId("ws-vercel-test"),
  name: "Example",
  domain: "www.example.com",
  url: "https://www.example.com",
  status: "campaign",
  sitemapUrl: "https://www.example.com/sitemap.xml",
  routes: ["/"],
  createdAt: "2026-09-22T00:00:00Z",
  scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
  summary: "Example",
  indexNowKey: "cfidx-1234567890abcdef1234567890abcdef",
  verifyToken: "cfv1_1234567890abcdef1234567890abcdef",
  github: { owner: "owner", repo: "website", branch: "main", root: "public" },
};
const target: VercelProjectTarget = {
  projectId: "prj_test",
  projectName: "website",
  teamId: "team_test",
  productionDeploymentId: "dpl_old",
  repo: { owner: "owner", repo: "website", repoId: 123, branch: "main", root: "public" },
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function stub(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return async (input, init = {}) => handler(new URL(String(input)), init);
}
function projectFetch(change: Record<string, unknown> = {}) {
  return stub((url) => {
    assert.equal(url.searchParams.get("teamId"), "team_test");
    if (url.pathname.includes("/deployments/"))
      return json({
        id: "dpl_old",
        projectId: "prj_test",
        target: "production",
        readyState: "READY",
      });
    if (url.pathname.includes("/domains/"))
      return json({ name: "www.example.com", verified: true });
    return json({
      id: "prj_test",
      name: "website",
      accountId: "team_test",
      framework: "nextjs",
      rootDirectory: null,
      link: {
        type: "github",
        org: "owner",
        repo: "website",
        repoId: 123,
        productionBranch: "main",
      },
      ...change,
    });
  });
}
test("resolves the exact www production project and GitHub target", async () => {
  assert.deepEqual(
    await resolveVercelProject("customer", "team_test", site, { fetch: projectFetch() }),
    target,
  );
});
for (const [name, change] of Object.entries({
  account: { accountId: "team_other" },
  framework: { framework: "unknown" },
  repo: { link: { type: "gitlab" } },
})) {
  test(`refuses mismatched ${name}`, async () => {
    await assert.rejects(
      resolveVercelProject("customer", "team_test", site, { fetch: projectFetch(change) }),
    );
  });
}
test("saved repo folder mismatch refuses before writes", async () => {
  await assert.rejects(
    resolveVercelProject(
      "customer",
      "team_test",
      { ...site, github: { ...target.repo, root: "other/public" } },
      { fetch: projectFetch() },
    ),
    /does not match/,
  );
});
test("apex cannot silently replace the exact www hostname", async () => {
  const fetch = stub((url, init) =>
    url.pathname.includes("/domains/")
      ? json({ name: "example.com", verified: true })
      : projectFetch()(url, init),
  );
  await assert.rejects(
    resolveVercelProject("customer", "team_test", site, { fetch }),
    /exact production/,
  );
});
function repoFetch(
  mode: "create" | "same" | "owned" | "shadowed" | "unreadable" | "race",
  writes: Array<{ path: string; body: Record<string, unknown> }>,
) {
  return stub((url, init) => {
    const path = url.pathname.replace("/repos/owner/website", "");
    if (init.method === "POST" || init.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      writes.push({ path, body });
      if (path === "/git/trees") return json({ sha: B });
      if (path === "/git/commits") return json({ sha: C });
      if (mode === "race") return json({ message: "Not fast forward" }, 422);
      return json({ object: { sha: C } });
    }
    if (!path) return json({ id: 123, permissions: { push: true } });
    if (path.startsWith("/git/ref/")) return json({ object: { sha: A } });
    if (path === `/git/commits/${A}`) return json({ tree: { sha: B } });
    if (path.startsWith("/git/trees/")) return json({ truncated: false, tree: [] });
    assert.equal(url.searchParams.get("ref"), A);
    if (path === "/contents/app" && mode === "shadowed")
      return json([{ type: "file", name: "robots.ts" }]);
    const filename = path.replace("/contents/public/", "");
    const file = packFiles(site).find((f) => f.path === filename);
    if (!file) return json({}, 404);
    if (mode === "unreadable") return json({}, 403);
    if (mode === "same")
      return json({
        type: "file",
        encoding: "base64",
        content: Buffer.from(file.content).toString("base64"),
      });
    if (mode === "owned")
      return json({
        type: "file",
        encoding: "base64",
        content: Buffer.from("Customer-owned policy").toString("base64"),
      });
    return json({}, 404);
  });
}
test("five files are written as one non-force commit rooted at pinned parent", async () => {
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const result = await installVercelRepoFiles("customer", site, target, {
    fetch: repoFetch("create", writes),
  });
  assert.equal(result.commitSha, C);
  assert.equal(result.files.length, 5);
  assert.deepEqual(
    writes.map((w) => w.path),
    ["/git/trees", "/git/commits", "/git/refs/heads/main"],
  );
  assert.equal((writes[0].body.tree as unknown[]).length, 5);
  assert.deepEqual(writes[1].body.parents, [A]);
  assert.equal(writes[2].body.force, false);
});
for (const mode of ["owned", "shadowed", "unreadable"] as const) {
  test(`${mode} repository refuses all writes`, async () => {
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    await assert.rejects(
      installVercelRepoFiles("customer", site, target, { fetch: repoFetch(mode, writes) }),
    );
    assert.equal(writes.length, 0);
  });
}
test("identical repo makes no commits and returns inspected head", async () => {
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const result = await installVercelRepoFiles("customer", site, target, {
    fetch: repoFetch("same", writes),
  });
  assert.equal(result.alreadyCurrent, true);
  assert.equal(result.commitSha, A);
  assert.equal(writes.length, 0);
});
test("branch race fails rather than force updating customer changes", async () => {
  await assert.rejects(
    installVercelRepoFiles("customer", site, target, { fetch: repoFetch("race", []) }),
    /422/,
  );
});
test("changed pinned pack refuses before API access", async () => {
  const files = packFiles(site);
  files[0].content += "changed";
  await assert.rejects(
    installVercelRepoFiles(
      "customer",
      site,
      target,
      {
        fetch: stub(() => {
          throw new Error("unexpected API");
        }),
      },
      files,
    ),
    /changed since/,
  );
});
test("deployment creation pins exact SHA and recovers existing operation without resubmission", async () => {
  let posts = 0;
  const fetch = stub((url, init) => {
    if (url.pathname === "/v6/deployments")
      return json({
        deployments: [
          {
            uid: "dpl_new",
            url: "website.vercel.app",
            meta: { citefleetOperationId: "install_123" },
          },
        ],
      });
    if (init.method === "POST") posts++;
    return json({
      id: "dpl_new",
      projectId: target.projectId,
      target: "production",
      gitSource: { sha: C },
      readyState: "BUILDING",
    });
  });
  assert.equal(
    (await createVercelDeployment("customer", target, C, "install_123", { fetch })).id,
    "dpl_new",
  );
  assert.equal(posts, 0);
});
test("new deployment request inherits prior deployment and pins source", async () => {
  const fetch = stub((url, init) => {
    if (url.pathname === "/v6/deployments") return json({ deployments: [] });
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      assert.equal(body.deploymentId, "dpl_old");
      assert.deepEqual(body.gitSource, { type: "github", repoId: 123, ref: C });
      return json({ id: "dpl_new", url: "website.vercel.app" });
    }
    return json({
      id: "dpl_new",
      projectId: target.projectId,
      target: "production",
      gitSource: { sha: C },
      readyState: "QUEUED",
    });
  });
  assert.equal(
    (await createVercelDeployment("customer", target, C, "install_123", { fetch })).id,
    "dpl_new",
  );
});
for (const [state, expected] of [
  ["READY", "ready"],
  ["ERROR", "failed"],
  ["BUILDING", "building"],
]) {
  test(`deployment ${state} is reported separately from live files`, async () => {
    const fetch = stub(() =>
      json({
        id: "dpl_new",
        projectId: target.projectId,
        target: "production",
        meta: { githubCommitSha: C },
        readyState: state,
      }),
    );
    assert.equal(
      (await readVercelDeployment("customer", target, "dpl_new", C, { fetch })).state,
      expected,
    );
  });
}
test("wrong deployment SHA fails closed", async () => {
  await assert.rejects(
    readVercelDeployment("customer", target, "dpl_new", C, {
      fetch: stub(() =>
        json({
          id: "dpl_new",
          projectId: target.projectId,
          target: "production",
          gitSource: { sha: A },
          readyState: "READY",
        }),
      ),
    }),
    /exact project/,
  );
});
for (const mode of ["correct", "html", "stale", "missing"] as const) {
  test(`public verification distinguishes ${mode} files`, async () => {
    const files = packFiles(site);
    const fetch = stub((url, init) => {
      assert.equal(init.redirect, "error");
      assert.equal(url.hostname, "www.example.com");
      const file = files.find((candidate) => `/${candidate.path}` === url.pathname)!;
      const type =
        mode === "html"
          ? "text/html"
          : file.path === "sitemap.xml"
            ? "application/xml"
            : "text/plain";
      return new Response(mode === "stale" ? "stale" : file.content, {
        status: mode === "missing" ? 404 : 200,
        headers: { "content-type": type },
      });
    });
    const result = await verifyVercelOriginFiles(site, files, { fetch });
    assert.equal(result.verified.length, mode === "correct" ? 5 : 0);
    assert.equal(result.problems.length, mode === "correct" ? 0 : 5);
  });
}

test("public socket addresses reject private, reserved and IPv6 ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "198.18.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPublicVercelAddress(address), false, address);
  for (const address of ["76.76.21.21", "1.1.1.1", "8.8.8.8"])
    assert.equal(isPublicVercelAddress(address), true, address);
});
test("symlinked public directory refuses before any write", async () => {
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const base = repoFetch("create", writes);
  const fetch = stub((url, init) =>
    url.pathname.includes("/git/trees/")
      ? json({ truncated: false, tree: [{ path: "public", mode: "120000" }] })
      : base(url, init),
  );
  await assert.rejects(installVercelRepoFiles("customer", site, target, { fetch }), /symlinks/);
  assert.equal(writes.length, 0);
});
test("oversized API response fails bounded", async () => {
  const fetch = stub(
    () =>
      new Response("{}", {
        headers: { "content-type": "application/json", "content-length": "2000001" },
      }),
  );
  await assert.rejects(resolveVercelProject("customer", "team_test", site, { fetch }), /too large/);
});

for (const ownedPath of [
  "app/robots.txt",
  "app/sitemap.xml",
  "app/robots.txt/route.ts",
  "src/app/sitemap.xml/route.js",
  "app/(marketing)/robots.txt/route.ts",
  "app/llms.txt/route.ts",
  "app/.well-known/botcentral.txt/route.js",
]) {
  test(`refuses framework-owned ${ownedPath} before writes`, async () => {
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    const base = repoFetch("create", writes);
    const fetch = stub((url, init) => {
      if (url.pathname.includes("/git/trees/"))
        return json({
          truncated: false,
          tree: [{ path: ownedPath, type: "blob", mode: "100644" }],
        });
      if (url.pathname === "/repos/owner/website/contents/app" && ownedPath === "app/robots.txt")
        return json([{ type: "file", name: "robots.txt" }]);
      return base(url, init);
    });
    await assert.rejects(
      installVercelRepoFiles("customer", site, target, { fetch }),
      /Installation refused/,
    );
    assert.equal(writes.length, 0);
  });
}
