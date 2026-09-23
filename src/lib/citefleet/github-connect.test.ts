import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { connectGithubAndInstall, originDeploymentStatus } from "./github.ts";
import { seedStore } from "./seed.ts";
import type { Site, StoreShape } from "./types.ts";
import type { WorkspaceHandle } from "./workspace-handle.ts";
import { asWorkspaceId } from "./workspace-id.ts";

const realFetch = globalThis.fetch;
const originalToken = process.env.GITHUB_TOKEN;
afterEach(() => {
  globalThis.fetch = realFetch;
  if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalToken;
});

function workspace(): { ws: WorkspaceHandle; read: () => StoreShape } {
  const id = asWorkspaceId("ws-github-test");
  let store = seedStore(id, "GitHub test");
  const site: Site = {
    id: "site-ac359f9c",
    workspaceId: id,
    name: "MarketSwarm",
    domain: "marketswarm.app",
    url: "https://marketswarm.app",
    status: "campaign",
    sitemapUrl: "https://marketswarm.app/sitemap.xml",
    indexNowKey: "cfidx-1234567890abcdef1234567890abcdef",
    verifyToken: "cfv1_1234567890abcdef1234567890abcdef",
    routes: ["/"],
    createdAt: "2026-09-15T00:00:00.000Z",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
    github: {
      owner: "mitchvac",
      repo: "https://github.com/mitchvac/marketswarm",
      branch: "main",
      root: "public",
    },
  };
  store.sites.push(site);
  const ws: WorkspaceHandle = {
    id,
    async get() {
      return structuredClone(store);
    },
    async mutate(fn) {
      const draft = structuredClone(store);
      const result = fn(draft);
      store = draft;
      return result;
    },
  };
  return { ws, read: () => structuredClone(store) };
}

test("GitHub approval repairs a pasted URL and installs all five files without a PAT paste", async () => {
  const { ws, read } = workspace();
  process.env.GITHUB_TOKEN = "server-global-token-must-not-be-used";
  const remote = new Map<string, string>();
  const requests: Array<{ method: string; pathname: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer gho_test-token");
    const url = new URL(String(input));
    const method = init.method || "GET";
    requests.push({ method, pathname: url.pathname });
    const marker = "/contents/";
    const offset = url.pathname.indexOf(marker);
    const path = offset >= 0 ? decodeURI(url.pathname.slice(offset + marker.length)) : "";

    if (method === "PUT") {
      const body = JSON.parse(String(init.body)) as { content: string };
      remote.set(path, Buffer.from(body.content, "base64").toString("utf8"));
      return Response.json(
        { commit: { sha: `sha-${remote.size}`, html_url: "https://github.com/commit/test" } },
        { status: 201 },
      );
    }
    if (remote.has(path)) {
      return Response.json({
        encoding: "base64",
        content: Buffer.from(remote.get(path)!, "utf8").toString("base64"),
      });
    }
    return Response.json({ message: "Not Found" }, { status: 404 });
  }) as typeof fetch;

  const installed = await connectGithubAndInstall(ws, "site-ac359f9c", "gho_test-token");
  assert.equal(installed.alreadyCurrent, false);
  assert.equal(installed.files.length, 5);
  assert.equal(remote.size, 5);
  assert.ok(
    requests.every((request) => !request.pathname.includes("https:")),
    "the pasted URL must never survive into a GitHub API path",
  );

  const saved = read();
  assert.equal(saved.sites[0].github?.owner, "mitchvac");
  assert.equal(saved.sites[0].github?.repo, "marketswarm");
  assert.equal(saved.workspace.githubToken, "gho_test-token");
  assert.equal(saved.sites[0].github?.lastInstallError, undefined);
  assert.equal(saved.sites[0].github?.lastPushSha, "sha-5", "deployment tracks final file commit");

  const writesBeforeRetry = requests.filter((request) => request.method === "PUT").length;
  const current = await connectGithubAndInstall(ws, "site-ac359f9c", "gho_test-token");
  assert.equal(current.alreadyCurrent, true);
  assert.equal(current.files.length, 0);
  assert.equal(
    requests.filter((request) => request.method === "PUT").length,
    writesBeforeRetry,
    "an already-current retry must not create another commit",
  );
});

test("GitHub approval records the exact refusal when every target belongs to the customer", async () => {
  const { ws, read } = workspace();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input)).pathname;
    if (/\/(?:src\/)?(?:app|pages|routes)$/.test(pathname)) {
      return Response.json({ message: "Not Found" }, { status: 404 });
    }
    return Response.json({
      encoding: "base64",
      content: Buffer.from("customer-owned file\n", "utf8").toString("base64"),
    });
  }) as typeof fetch;

  await assert.rejects(
    () => connectGithubAndInstall(ws, "site-ac359f9c", "gho_test-token"),
    /Nothing to push.*every file is spoken for/,
  );
  const saved = read();
  assert.match(saved.sites[0].github?.lastInstallError || "", /every file is spoken for/);
  assert.equal(saved.workspace.githubToken, "gho_test-token");
});

test("deployment status reports provider failure and rejects untrusted detail links", async () => {
  const { ws } = workspace();
  await ws.mutate((s) => {
    s.sites[0].github!.repo = "marketswarm";
    s.sites[0].github!.lastPushSha = "final-sha";
    s.workspace.githubToken = "workspace-only";
  });
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /commits\/final-sha\/status/);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer workspace-only");
    return Response.json({
      statuses: [
        {
          context: "Vercel",
          state: "failure",
          description: "Build failed",
          target_url: "javascript:alert(1)",
        },
      ],
    });
  };
  assert.deepEqual(await originDeploymentStatus(ws, "site-ac359f9c"), {
    state: "failure",
    description: "Build failed",
    url: undefined,
  });
  globalThis.fetch = async () => new Response("<html>fallback</html>");
  assert.equal((await originDeploymentStatus(ws, "site-ac359f9c")).state, "unknown");
});

test("multiple Vercel project statuses cannot imply the selected project deployed", async () => {
  const { ws } = workspace();
  await ws.mutate((s) => {
    s.sites[0].github!.repo = "marketswarm";
  });
  globalThis.fetch = async () =>
    Response.json({
      statuses: [
        { context: "Vercel – first", state: "success" },
        { context: "Vercel – second", state: "failure" },
      ],
    });
  const status = await originDeploymentStatus(ws, "site-ac359f9c");
  assert.equal(status.state, "unknown");
  assert.match(status.description, /Multiple Vercel projects/);
});
