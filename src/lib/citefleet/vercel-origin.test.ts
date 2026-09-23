import assert from "node:assert/strict";
import { test } from "node:test";
import {
  githubOriginReturn,
  originCallback,
  originSetup,
  originSubmission,
  startOriginInstall,
} from "./vercel-origin-flow.server.ts";
import {
  loadOriginMetadata,
  originConfig,
  originCookie,
  originLoginContinuation,
  parseOriginProject,
  parseOriginDomain,
  ORIGIN_COOKIE,
  ORIGIN_STATE_COOKIE,
} from "./vercel-origin.server.ts";

const env = {
  CITEFLEET_PUBLIC_URL: "https://citefleet.app",
  CITEFLEET_VERCEL_ORIGIN_INTEGRATION_SLUG: "citefleet-origin",
  CITEFLEET_VERCEL_ORIGIN_CLIENT_ID: "oac_origin",
  CITEFLEET_VERCEL_ORIGIN_CLIENT_SECRET: "secret",
};
const config = originConfig(env)!;
const token = "a".repeat(64);
const project = {
  id: "prj_one",
  name: "One",
  rootDirectory: "",
  link: { type: "github", org: "owner", repo: "repo", productionBranch: "release" },
  env: [{ value: "must-not-persist" }],
};
const domain = {
  projectId: "prj_one",
  name: "example.com",
  verified: true,
  gitBranch: null,
  redirect: null,
};
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function provider(
  options: {
    team?: string | null;
    install?: Record<string, unknown>;
    projects?: unknown[];
    domains?: unknown[];
    paginate?: boolean;
  } = {},
): { fetch: typeof fetch; urls: URL[] } {
  const urls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    urls.push(url);
    assert.equal(init?.redirect, "error");
    if (url.pathname === "/v2/oauth/access_token") {
      assert.equal(init?.method, "POST");
      const form = new URLSearchParams(String(init?.body));
      assert.equal(
        form.get("redirect_uri"),
        "https://citefleet.app/api/integrations/vercel/callback",
      );
      return json({
        access_token: "never-persist",
        team_id: options.team === undefined ? "team_one" : options.team,
      });
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer never-persist");
    assert.equal(url.searchParams.get("teamId"), options.team === null ? null : "team_one");
    if (url.pathname.includes("/configuration/"))
      return json({
        id: "icfg_one",
        integrationId: "oac_origin",
        teamId: options.team === undefined ? "team_one" : options.team,
        projectSelection: "selected",
        projects: ["prj_one"],
        ...options.install,
      });
    if (url.pathname === "/v10/projects")
      return json({
        projects: options.projects ?? [project],
        pagination: { next: options.paginate ? 12 : null },
      });
    if (url.pathname === "/v9/projects/prj_one/domains")
      return json({ domains: options.domains ?? [domain], pagination: { next: null } });
    throw new Error(`unexpected URL ${url}`);
  };
  return { fetch: fetcher, urls };
}
test("Origin uses its own credentials and exact callback; absent/incomplete configuration fails closed", () => {
  assert.equal(
    originConfig({ CITEFLEET_VERCEL_CLIENT_ID: "dns", CITEFLEET_VERCEL_CLIENT_SECRET: "dns" }),
    null,
  );
  assert.throws(() => originConfig({ ...env, CITEFLEET_VERCEL_ORIGIN_CLIENT_SECRET: "" }));
  assert.throws(() => originConfig({ ...env, CITEFLEET_PUBLIC_URL: "http://citefleet.app" }));
  assert.equal(config.redirectUri, "https://citefleet.app/api/integrations/vercel/callback");
});
test("provider metadata is bounded and strips secrets, arbitrary domains, and unselected projects", async () => {
  const io = provider({
    projects: [project, { ...project, id: "prj_other" }],
    domains: [
      domain,
      { ...domain, projectId: "prj_other", name: "other.com" },
      { ...domain, verified: false },
      { ...domain, redirect: "elsewhere.com" },
      { ...domain, gitBranch: "preview" },
    ],
  });
  const result = await loadOriginMetadata(
    "code",
    "icfg_one",
    "team_one",
    "https://vercel.com/finish",
    config,
    io.fetch,
  );
  assert.equal(result.projects.length, 1);
  assert.deepEqual(result.projects[0].domains, ["example.com"]);
  assert.equal(result.projects[0].rootDirectory, "");
  assert.equal(result.projects[0].branch, "release");
  assert.doesNotMatch(JSON.stringify(result), /never-persist|must-not-persist/);
});
test("project optional branch and root are explicit, unsupported source is omitted", () => {
  assert.equal(
    parseOriginProject({ ...project, link: { ...project.link, productionBranch: null } })?.branch,
    null,
  );
  assert.equal(parseOriginProject({ ...project, rootDirectory: null })?.rootDirectory, "");
  assert.equal(parseOriginProject({ ...project, link: { type: "gitlab" } }), null);
  assert.throws(() => parseOriginProject({ ...project, rootDirectory: "../private" }));
  assert.equal(parseOriginDomain({ ...domain, name: "<script>" }, "prj_one"), null);
});
test("wrong team, wrong configuration, wrong integration, disabled install and unbounded lists are rejected", async () => {
  await assert.rejects(
    loadOriginMetadata("code", "icfg_one", "team_other", null, config, provider().fetch),
    /team/,
  );
  for (const install of [
    { id: "icfg_other" },
    { integrationId: "oac_other" },
    { teamId: "team_other" },
    { disabledAt: 1 },
    { projectSelection: "unexpected" },
    { projectSelection: "selected", projects: null },
  ]) {
    await assert.rejects(
      loadOriginMetadata("code", "icfg_one", "team_one", null, config, provider({ install }).fetch),
    );
  }
  await assert.rejects(
    loadOriginMetadata("code", "icfg_one", null, null, config, provider({ paginate: true }).fetch),
    /20/,
  );
  await assert.rejects(
    loadOriginMetadata(
      "code",
      "icfg_one",
      null,
      null,
      config,
      provider({ projects: Array.from({ length: 21 }, () => project) }).fetch,
    ),
    /20/,
  );
});
test("personal installation keeps team scope absent and unsafe completion URLs are discarded", async () => {
  const io = provider({ team: null });
  const result = await loadOriginMetadata(
    "code",
    "icfg_one",
    null,
    "https://vercel.com.attacker.test",
    config,
    io.fetch,
  );
  assert.equal(result.teamId, null);
  assert.equal(result.next, null);
});
test("HTML fallback, redirects and oversized project JSON fail closed", async () => {
  const base = provider();
  for (const response of [
    () => new Response("<html>fallback</html>"),
    () => json({ projects: [], waste: "x".repeat(1024 * 1024) }),
  ]) {
    const transport: typeof fetch = async (input, init) =>
      String(input).includes("/v10/projects") ? response() : base.fetch(input, init);
    await assert.rejects(loadOriginMetadata("code", "icfg_one", null, null, config, transport));
  }
});
test("callback validates state and cannot overwrite an existing browser installation", async () => {
  let calls = 0;
  const noFetch: typeof fetch = async () => {
    calls++;
    throw new Error("not expected");
  };
  const url =
    "https://citefleet.app/api/integrations/vercel/callback?code=one&configurationId=icfg_one";
  assert.equal((await originCallback(new Request(url), { env: {} })).status, 503);
  assert.equal(
    (await originCallback(new Request(url + "&state=wrong"), { env, fetch: noFetch })).status,
    403,
  );
  assert.equal(
    (
      await originCallback(
        new Request(url, { headers: { cookie: `${ORIGIN_STATE_COOKIE}=${token}` } }),
        { env, fetch: noFetch },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await originCallback(new Request(url, { headers: { cookie: `${ORIGIN_COOKIE}=${token}` } }), {
        env,
        fetch: noFetch,
      })
    ).status,
    409,
  );
  assert.equal(calls, 0);
});
test("start creates secure state; callback inspection never implies install success", async () => {
  const res = await startOriginInstall(
    new Request("https://citefleet.app/api/integrations/vercel/start"),
    { env },
  );
  assert.equal(res.status, 303);
  assert.match(res.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax.*Secure/);
  assert.match(
    res.headers.get("location")!,
    /https:\/\/vercel.com\/integrations\/citefleet-origin\/new\?state=[a-f0-9]{64}/,
  );
  const callback = await originCallback(
    new Request("https://citefleet.app/api/integrations/vercel/callback"),
    { env },
  );
  assert.equal(callback.status, 400);
  assert.match(await callback.text(), /Start with Vercel/);
});
test("confirmation requires exact same origin, matching CSRF and non-sibling request", () => {
  const form = new URLSearchParams({ csrf: token });
  const req = (origin: string, site = "same-origin") =>
    new Request("https://citefleet.app/integrations/vercel", {
      method: "POST",
      headers: { origin, "sec-fetch-site": site },
    });
  assert.equal(originSubmission(req("https://citefleet.app"), form, token), true);
  for (const origin of ["https://attacker.test", "http://citefleet.app", "null", ""])
    assert.equal(originSubmission(req(origin), form, token), false);
  assert.equal(originSubmission(req("https://citefleet.app", "same-site"), form, token), false);
  assert.equal(
    originSubmission(req("https://citefleet.app"), new URLSearchParams({ csrf: "wrong" }), token),
    false,
  );
});
test("expired or other-account cookie can be canceled without reading tenant data", async () => {
  const url = "https://citefleet.app/integrations/vercel";
  const headers = {
    cookie: `${ORIGIN_COOKIE}=${token}`,
    origin: "https://citefleet.app",
    "content-type": "application/x-www-form-urlencoded",
  };
  const deps = {
    user: async () => {
      throw new Error("must not need an account to clear this browser cookie");
    },
  };
  const confirm = await originSetup(new Request(url + "?cancel=1", { headers }), deps);
  assert.equal(confirm.status, 200);
  assert.match(await confirm.text(), /Cancel installation/);
  const cancel = await originSetup(
    new Request(url, {
      method: "POST",
      headers,
      body: new URLSearchParams({ csrf: token, action: "cancel" }),
    }),
    deps,
  );
  assert.equal(cancel.status, 303);
  assert.match(cancel.headers.get("set-cookie")!, /Max-Age=0/);
});
test("login continuation is fixed path only, cookie is HttpOnly and navigation has no raw token", () => {
  assert.equal(originLoginContinuation(new Request("https://citefleet.app")), "/");
  assert.equal(
    originLoginContinuation(
      new Request("https://citefleet.app", { headers: { cookie: `${ORIGIN_COOKIE}=${token}` } }),
    ),
    "/integrations/vercel",
  );
  assert.equal(
    originLoginContinuation(
      new Request("https://citefleet.app", {
        headers: { cookie: `${ORIGIN_COOKIE}=https://attacker.test` },
      }),
    ),
    "/",
  );
  assert.match(
    originCookie(new Request("https://citefleet.app"), ORIGIN_COOKIE, token),
    /HttpOnly; SameSite=Lax; Max-Age=1800; Secure/,
  );
});

test("setup bounds form bytes before account or database access", async () => {
  const request = new Request("https://citefleet.app/integrations/vercel", {
    method: "POST",
    headers: {
      cookie: `${ORIGIN_COOKIE}=${token}`,
      origin: "https://citefleet.app",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "x=" + "a".repeat(5000),
  });
  const response = await originSetup(request, {
    user: async () => {
      throw new Error("must not read account");
    },
  });
  assert.equal(response.status, 413);
});

test("setup forms retain browser Origin while authorization redirects suppress referrer", async () => {
  const setup = await originSetup(
    new Request("https://citefleet.app/integrations/vercel?cancel=1", {
      headers: { cookie: `${ORIGIN_COOKIE}=${token}` },
    }),
  );
  assert.equal(setup.headers.get("referrer-policy"), "strict-origin");
  assert.match(
    setup.headers.get("content-security-policy")!,
    /form-action 'self' https:\/\/github.com https:\/\/vercel.com;/,
  );
  assert.match(await setup.text(), /method="post"/);
  const redirect = await startOriginInstall(
    new Request("https://citefleet.app/api/integrations/vercel/start"),
    { env },
  );
  assert.equal(redirect.headers.get("referrer-policy"), "no-referrer");
});

// These route tests exercise POST authorization and the former false-finish path.
import type { Sql } from "../db.ts";
import type { OriginPending } from "./vercel-origin-state.server.ts";
import { seedStore } from "./seed.ts";
import { asWorkspaceId } from "./workspace-id.ts";
import type { Site } from "./types.ts";

function progressFixture(saved = true, credential = true) {
  const id = asWorkspaceId("ws-origin-progress");
  const store = seedStore(id, "Origin progress");
  store.workspace.githubToken = credential ? "gho_existing-authorization" : undefined;
  const site: Site = {
    id: "site-origin-progress",
    workspaceId: id,
    name: "Origin",
    domain: "example.com",
    url: "https://example.com",
    sitemapUrl: "https://example.com/sitemap.xml",
    status: "campaign",
    routes: ["/"],
    createdAt: new Date().toISOString(),
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "",
    github: { owner: "owner", repo: "repo", branch: "main", root: "public" },
  };
  store.sites.push(site);
  const pending: OriginPending = {
    user_id: "user-origin",
    workspace_id: id,
    consumed_at: saved ? new Date() : null,
    site_id: saved ? site.id : null,
    metadata: {
      configurationId: "icfg_one",
      teamId: null,
      next: "https://vercel.com/finish",
      projects: [
        {
          id: "prj_one",
          name: "Origin",
          owner: "owner",
          repo: "repo",
          branch: "main",
          rootDirectory: "",
          domains: ["example.com"],
        },
      ],
    },
  };
  const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> => {
    if (sql.includes("SET site_id=$4")) pending.site_id = String(params![3]);
    if (sql.includes("SET consumed_at")) pending.consumed_at = new Date();
    return [pending] as unknown as T[];
  };
  const sql = Object.assign(async <T>() => [] as T[], { query }) as Sql;
  const ws = {
    id,
    get: async () => store,
    mutate: async <T>(fn: (s: typeof store) => T) => fn(store),
  };
  let writes = 0;
  const deps = {
    sql,
    user: async () => ({
      id: "user-origin",
      email: "owner@example.com",
      name: "Owner",
      imageUrl: null,
    }),
    workspace: async () => ws,
    attach: async () => {},
    install: async () => {
      writes++;
    },
    audit: async () => [{ path: "/robots.txt", ok: false, reason: "HTTP 404" }],
    deployment: async () => ({
      state: "failure" as const,
      description: "Build failed",
      url: "https://vercel.com/project/deployment",
    }),
  };
  const request = (action?: string, origin = "https://citefleet.app") =>
    new Request("https://citefleet.app/integrations/vercel", {
      method: action ? "POST" : "GET",
      headers: {
        cookie: `${ORIGIN_COOKIE}=${token}`,
        origin,
        "content-type": "application/x-www-form-urlencoded",
      },
      ...(action
        ? {
            body: new URLSearchParams({
              csrf: token,
              action,
              project: "prj_one",
              domain: "example.com",
              root: "public",
              confirm: "yes",
            }),
          }
        : {}),
    });
  return { deps, request, writes: () => writes, pending };
}
test("confirm starts existing authorized installation once; GET/replayed confirmation never writes", async () => {
  const f = progressFixture(false);
  const saved = await originSetup(f.request("confirm"), f.deps);
  assert.equal(saved.status, 303);
  assert.equal(saved.headers.get("location"), "/integrations/vercel");
  assert.equal(f.writes(), 1);
  await originSetup(f.request(), f.deps);
  await originSetup(f.request("confirm"), f.deps);
  assert.equal(f.writes(), 1);
});
test("missing workspace GitHub authorization proceeds directly to consent without writing", async () => {
  const f = progressFixture(false, false);
  const res = await originSetup(f.request("confirm"), f.deps);
  assert.equal(res.headers.get("location"), "/api/oauth/github?connect=site-origin-progress");
  assert.equal(f.writes(), 0);
});
test("live failure prevents Finish and exposes deployment failure instead of pretending success", async () => {
  const f = progressFixture();
  const res = await originSetup(f.request("complete"), f.deps);
  assert.equal(res.status, 409);
  assert.equal(res.headers.get("set-cookie"), null);
  const html = await res.text();
  assert.match(html, /Build failed/);
  assert.match(html, /https:\/\/vercel.com\/project\/deployment/);
  assert.match(html, /not verified live/);
  assert.doesNotMatch(html, /name="action" value="complete"/);
  assert.equal(f.writes(), 0);
});
test("only all five verified live files permit Finish; cross-origin retry cannot write", async () => {
  const f = progressFixture();
  const denied = await originSetup(f.request("install", "https://evil.example"), f.deps);
  assert.equal(denied.status, 403);
  assert.equal(f.writes(), 0);
  f.deps.audit = async () =>
    ["/robots.txt", "/sitemap.xml", "/llms.txt", "/key.txt", "/.well-known/botcentral.txt"].map(
      (path) => ({ path, ok: true, reason: "" }),
    );
  const res = await originSetup(f.request("complete"), f.deps);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "https://vercel.com/finish");
  assert.match(res.headers.get("set-cookie")!, /Max-Age=0/);
});

test("GitHub continuation resumes only the matching saved site and authenticated installation", async () => {
  const f = progressFixture();
  assert.equal(
    await githubOriginReturn(f.request(), "site-origin-progress", f.deps),
    "/integrations/vercel",
  );
  assert.equal(await githubOriginReturn(f.request(), "site-unrelated", f.deps), null);
  assert.equal(
    await githubOriginReturn(f.request(), "site-origin-progress", {
      ...f.deps,
      user: async () => null,
    }),
    null,
  );
  assert.equal(
    await githubOriginReturn(new Request("https://citefleet.app"), "site-origin-progress", f.deps),
    null,
  );
});
