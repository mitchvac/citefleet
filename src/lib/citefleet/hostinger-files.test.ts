import assert from "node:assert/strict";
import { test } from "node:test";
import type { Site } from "./types.ts";
import { installHostingerPack, inspectHostingerInstall } from "./hostinger-files.server.ts";

function site(): Site {
  return {
    id: "hostinger-test",
    workspaceId: "ws",
    name: "Example",
    domain: "example.invalid",
    url: "https://example.invalid",
    status: "onboarding",
    sitemapUrl: "https://example.invalid/sitemap.xml",
    indexNowKey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    routes: ["/"],
    createdAt: "",
    summary: "Example site",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
  };
}

function harness(
  options: {
    accountDomain?: string;
    websiteType?: string;
    existing?: Record<string, string>;
    virtualRobots?: string;
    staleLive?: Record<string, string>;
    directory?: boolean;
  } = {},
) {
  const files = new Map(Object.entries(options.existing ?? {}));
  const events: string[] = [];
  const apiBase = "https://developers.hostinger.test";
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    events.push(`${method} ${url.origin}${url.pathname}`);
    if (url.pathname === "/api/hosting/v1/websites") {
      return Response.json({
        data: [
          {
            domain: options.accountDomain ?? "example.invalid",
            username: "u123",
            root_directory: "/home/u123/public_html",
            website_type: options.websiteType ?? "wordpress",
            is_enabled: true,
          },
        ],
      });
    }
    if (url.pathname.endsWith("/files") && method === "GET") {
      const directory = url.searchParams.get("directory") || "";
      const entries =
        directory === ".well-known"
          ? [...files]
              .filter(([path]) => path.startsWith(".well-known/"))
              .map(([path, content]) => ({
                name: path.split("/").at(-1),
                path,
                type: "file",
                size_bytes: Buffer.byteLength(content),
              }))
          : [
              ...(options.directory === false
                ? []
                : [
                    {
                      name: ".well-known",
                      path: ".well-known",
                      type: "directory",
                      size_bytes: null,
                    },
                  ]),
              ...[...files]
                .filter(([path]) => !path.includes("/"))
                .map(([path, content]) => ({
                  name: path,
                  path,
                  type: "file",
                  size_bytes: Buffer.byteLength(content),
                })),
            ];
      return Response.json({
        path: directory,
        items: entries,
        total_items: entries.length,
        total_items_current_page: entries.length,
        offset: 0,
      });
    }
    if (url.pathname.endsWith("/files/content") && method === "GET") {
      const path = url.searchParams.get("path")!;
      const content = files.get(path)!;
      return Response.json({
        path,
        content,
        from_line: 0,
        total_lines: content.split("\n").length,
        size_bytes: Buffer.byteLength(content),
      });
    }
    if (url.pathname === "/api/hosting/v1/files/upload-urls" && method === "POST") {
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-token");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        username: "u123",
        domain: "example.invalid",
      });
      return Response.json({
        url: "https://upload.hostinger.test/base",
        auth_key: "auth",
        rest_auth_key: "rest",
      });
    }
    if (url.origin === "https://upload.hostinger.test") {
      assert.equal((init?.headers as Record<string, string>)["X-Auth"], "auth");
      assert.equal(url.searchParams.get("override"), "true");
      const path = decodeURIComponent(url.pathname.replace(/^\/base\//, ""));
      if (method === "POST") return new Response(null, { status: 201 });
      if (method === "PATCH") {
        const bytes = init?.body as Uint8Array;
        files.set(path, new TextDecoder().decode(bytes));
        return new Response(null, {
          status: 204,
          headers: { "upload-offset": String(bytes.byteLength) },
        });
      }
    }
    if (url.origin === "https://example.invalid") {
      const path = decodeURIComponent(url.pathname.slice(1));
      const content =
        files.has(path) && options.staleLive?.[path]
          ? options.staleLive[path]
          : path === "robots.txt" && options.virtualRobots
            ? options.virtualRobots
            : files.get(path);
      return content === undefined
        ? new Response("missing", { status: 404 })
        : new Response(content, { status: 200, headers: { "content-type": "text/plain" } });
    }
    throw new Error(`Unexpected request ${method} ${url.origin}${url.pathname}`);
  }) as typeof fetch;
  return { deps: { apiBase, fetchImpl, sleep: async () => {} }, events, files };
}

test("exact Hostinger Web/Cloud site installs five files and verifies their live bytes", async () => {
  const h = harness();
  const result = await installHostingerPack(site(), "test-token", h.deps);
  assert.equal(result.plan.rootDirectory, "/home/u123/public_html");
  assert.equal(result.uploaded.length, 5);
  assert.deepEqual(result.verified.sort(), result.uploaded.sort());
  assert.ok(h.files.has(".well-known/botcentral.txt"));
  assert.equal(
    h.events.filter((event) => event.startsWith("PATCH https://upload.hostinger.test/")).length,
    5,
  );
  const second = await installHostingerPack(site(), "test-token", h.deps);
  assert.equal(second.uploaded.length, 0, "idempotent re-run should not upload identical files");
});

test("an existing site-owned robots policy blocks all writes", async () => {
  const h = harness({ existing: { "robots.txt": "User-agent: *\nDisallow: /private\n" } });
  const plan = await inspectHostingerInstall(site(), "test-token", h.deps);
  assert.equal(plan.writable, false);
  assert.equal(plan.files.find((file) => file.path === "robots.txt")?.state, "refused");
  await assert.rejects(installHostingerPack(site(), "test-token", h.deps), /not safe to replace/);
  assert.equal(h.events.filter((event) => event.includes("upload-urls")).length, 0);
});

test("exact-domain mismatch, Builder sites, missing directory, and virtual routes fail closed", async () => {
  const mismatch = harness({ accountDomain: "other.invalid" });
  await assert.rejects(
    inspectHostingerInstall(site(), "test-token", mismatch.deps),
    /no exact website/,
  );
  const builder = harness({ websiteType: "builder" });
  await assert.rejects(
    inspectHostingerInstall(site(), "test-token", builder.deps),
    /writable Web\/Cloud/,
  );
  const missingDirectory = harness({ directory: false });
  assert.equal(
    (await inspectHostingerInstall(site(), "test-token", missingDirectory.deps)).writable,
    false,
  );
  const virtual = harness({ virtualRobots: "User-agent: *\nDisallow: /private" });
  const plan = await inspectHostingerInstall(site(), "test-token", virtual.deps);
  assert.equal(plan.files.find((file) => file.path === "robots.txt")?.state, "refused");
});

test("an uploaded file that is not served live is not reported as installed", async () => {
  const h = harness({ staleLive: { "robots.txt": "old cache" } });
  await assert.rejects(
    installHostingerPack(site(), "test-token", h.deps),
    /only 4 of 5 live paths matched/,
  );
  assert.equal(
    h.files.size,
    5,
    "the API upload happened; the live verification still gates success",
  );
});
