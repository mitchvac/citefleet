import assert from "node:assert/strict";
import { test } from "node:test";
import { DISCOVERY_VERSION, parseDiscoveryRecord } from "./discovery.ts";
import {
  buildDiscoveryRequest,
  discoveryDigest,
  forwardDiscovery,
  handleDiscoverySubmission,
  readDiscoveryReceipt,
  revokeDiscoveryKey,
  rotateDiscoveryKey,
  submitDiscovery,
  type DiscoveryRequest,
} from "./discovery.server.ts";
import { createWorkspaces, type SnapshotStore } from "./workspace-handle.ts";
import { asWorkspaceId } from "./workspace-id.ts";
import { workspaceForDiscoveryDigest } from "./workspace-registry.server.ts";
import { maskStoreSecrets } from "./secrets.ts";
import type { StoreShape } from "./types.ts";
import type { Sql } from "../db.ts";
const record = {
  name: "A website",
  url: "https://acme.com",
  summary: "Useful information.",
  pages: [{ url: "https://acme.com/about", title: "About" }],
  topics: ["tools"],
};
function memory() {
  const rows = new Map<string, { payload: StoreShape; version: number }>();
  const io: SnapshotStore = {
    load: async (id) => structuredClone(rows.get(id) ?? null),
    save: async (id, store, expected) => {
      const current = rows.get(id);
      if ((current?.version ?? null) !== expected) {
        const e = new Error("conflict");
        e.name = "SnapshotConflictError";
        throw e;
      }
      const version = (current?.version ?? 0) + 1;
      rows.set(id, { payload: structuredClone(store), version });
      return version;
    },
  };
  return {
    rows,
    io,
    a: createWorkspaces(io).handleFor(asWorkspaceId("ws-alpha")),
    b: createWorkspaces(io).handleFor(asWorkspaceId("ws-bravo")),
  };
}
function receipt(request: DiscoveryRequest) {
  return {
    version: DISCOVERY_VERSION,
    status: "accepted",
    publisherRecordId: request.publisherRecordId,
    revision: request.revision,
    digest: request.digest,
    idempotencyKey: request.idempotencyKey,
    url: "https://botcentral.org/discovery/acme",
    files: request.files.map((f) => ({
      path: f.path,
      sha256: f.sha256,
      url: `https://botcentral.org/discovery/acme/${f.path}`,
    })),
  };
}
const successful: typeof fetch = async (_url, options) =>
  Response.json(receipt(JSON.parse(String(options?.body))));
const remote = { fetch: successful, origin: "https://botcentral.org", token: "service-test-token" };
test("compact contract rejects blobs, unknown fields, hostile text and nonpublic URLs", () => {
  assert.equal(parseDiscoveryRecord(record).url, "https://acme.com");
  for (const bad of [
    { ...record, html: "blob" },
    { ...record, workspaceId: "ws-bravo" },
    { ...record, name: "x\nAllow: /" },
    { ...record, summary: "<html>" },
    { ...record, pages: Array(21).fill(record.pages[0]) },
    ...[
      "http://acme.com",
      "https://127.0.0.1",
      "https://localhost",
      "https://a.internal",
      "https://user:pass@acme.com",
      "https://acme.com/?secret=1",
      "https://acme.com/#x",
      "https://acme.com/a",
    ].map((url) => ({ ...record, url })),
  ])
    assert.throws(() => parseDiscoveryRecord(bad));
  assert.throws(() =>
    parseDiscoveryRecord({ ...record, pages: [{ url: "https://elsewhere.com/a", title: "no" }] }),
  );
});
test("submission builds five exact files, persists receipt separately and never marks indexing done", async () => {
  const { a, b } = memory();
  const result = await submitDiscovery(a, undefined, record, remote);
  assert.equal(result.submission.status, "accepted");
  const store = await a.get();
  const site = store.sites[0];
  const request = buildDiscoveryRequest(site, record, a.id);
  assert.equal(request.files.length, 5);
  assert.deepEqual(
    request.files.map((f) => f.path),
    [
      "robots.txt",
      "sitemap.xml",
      "llms.txt",
      ".well-known/botcentral.txt",
      `${site.indexNowKey}.txt`,
    ],
  );
  request.files.forEach((f) => assert.equal(discoveryDigest(f.content), f.sha256));
  assert.equal(site.botcentral, undefined);
  assert.equal(site.proof, undefined);
  assert.equal(site.indexNowSubmission, undefined);
  assert.equal(store.tasks.length, 0);
  assert.equal((await b.get()).sites.length, 0);
  const second = await submitDiscovery(a, undefined, record, remote);
  assert.equal(second.siteId, result.siteId);
  assert.equal(second.submission.idempotencyKey, result.submission.idempotencyKey);
  assert.equal((await a.get()).sites.length, 1);
  assert.throws(() =>
    readDiscoveryReceipt(
      { ...receipt(request), files: Array(5).fill(receipt(request).files[0]) },
      request,
      remote.origin,
    ),
  );
  assert.throws(() =>
    readDiscoveryReceipt({ ...receipt(request), url: "https://evil.com" }, request, remote.origin),
  );
  assert.throws(() =>
    readDiscoveryReceipt({ ...receipt(request), digest: "wrong" }, request, remote.origin),
  );
});
test("remote failures remain failed, transient retry limited to two with identical key", async () => {
  const { a } = memory();
  let calls = 0;
  const keys: string[] = [];
  const flaky: typeof fetch = async (_url, options) => {
    calls++;
    assert.equal(options?.redirect, "error");
    keys.push(new Headers(options?.headers).get("idempotency-key")!);
    return new Response("busy", { status: 503 });
  };
  const failure = await submitDiscovery(a, undefined, record, { ...remote, fetch: flaky });
  assert.equal(failure.submission.status, "failed");
  assert.equal(calls, 2);
  assert.equal(keys[0], keys[1]);
  const request = buildDiscoveryRequest((await a.get()).sites[0], record, a.id);
  for (const response of [
    new Response("404", { status: 404 }),
    new Response("queued", { status: 202 }),
    new Response("<html>", { headers: { "content-type": "text/html" } }),
    Response.json({}),
    new Response("x".repeat(65537), { headers: { "content-type": "application/json" } }),
  ]) {
    let count = 0;
    await assert.rejects(
      forwardDiscovery(request, {
        ...remote,
        fetch: async () => {
          count++;
          return response;
        },
      }),
    );
    assert.equal(count, 1);
  }
});
test("capabilities are isolated, masked and rotation/revocation resolved from durable rows", async () => {
  const { a, b, rows } = memory();
  const tokenA = (await rotateDiscoveryKey(a)).token;
  const tokenB = (await rotateDiscoveryKey(b)).token;
  assert.notEqual(tokenA, tokenB);
  assert.match(tokenA, /^cfd_[a-f0-9]{64}$/);
  assert.equal(maskStoreSecrets(await a.get()).workspace.discoveryKey?.digest, "");
  assert.equal(JSON.stringify(rows.get(a.id)).includes(tokenA), false);
  const sql = (async () => []) as unknown as Sql;
  sql.query = async <T>(query: string, args: unknown[] = []) => {
    assert.match(query, /JOIN citefleet_workspaces/);
    assert.match(query, /archived_at IS NULL/);
    assert.match(query, /LIMIT 2/);
    return [...rows]
      .filter(([, r]) => r.payload.workspace.discoveryKey?.digest === args[0])
      .map(([id]) => ({ id })) as T[];
  };
  assert.equal((await workspaceForDiscoveryDigest(discoveryDigest(tokenA), sql))?.id, a.id);
  await rotateDiscoveryKey(a);
  assert.equal(await workspaceForDiscoveryDigest(discoveryDigest(tokenA), sql), null);
  assert.equal((await workspaceForDiscoveryDigest(discoveryDigest(tokenB), sql))?.id, b.id);
  await revokeDiscoveryKey(b);
  assert.equal(await workspaceForDiscoveryDigest(discoveryDigest(tokenB), sql), null);
});
test("HTTP intake rejects missing capability, oversized body, and tenant selector", async () => {
  const { a } = memory();
  const token = (await rotateDiscoveryKey(a)).token;
  const deps = {
    resolve: async (digest: string) => (digest === discoveryDigest(token) ? a : null),
    submit: submitDiscovery,
  };
  const make = (body: unknown, auth = `Bearer ${token}`) =>
    new Request("https://citefleet.app/api/discovery/submissions", {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await handleDiscoverySubmission(make(record, ""), deps)).status, 401);
  assert.equal(
    (await handleDiscoverySubmission(make({ ...record, workspaceId: "ws-bravo" }), deps)).status,
    400,
  );
  assert.equal(
    (await handleDiscoverySubmission(make({ ...record, summary: "x".repeat(70000) }), deps)).status,
    413,
  );
});
test("catalog kill is persisted failure and refreshed through CAS before HTTP dispatch", async () => {
  const { a, io } = memory();
  await rotateDiscoveryKey(a);
  const otherProcess = createWorkspaces(io).handleFor(a.id);
  await otherProcess.mutate((s) => {
    s.control.kill.doors.catalog = true;
  });
  let calls = 0;
  const result = await submitDiscovery(a, undefined, record, {
    ...remote,
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  assert.equal(result.submission.status, "failed");
  assert.equal(calls, 0);
});
test("stale receipt cannot replace a newer submission", async () => {
  const { a } = memory();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const old = submitDiscovery(a, undefined, record, {
    ...remote,
    fetch: async (_url, options) => {
      started();
      await held;
      return Response.json(receipt(JSON.parse(String(options?.body))));
    },
  });
  await ready;
  const recent = await submitDiscovery(
    a,
    undefined,
    { ...record, summary: "Updated information" },
    remote,
  );
  release();
  await assert.rejects(old, /superseded/);
  assert.equal((await a.get()).sites[0].discovery?.latest.digest, recent.submission.digest);
});
test("billing switch applies spend gate only when a valid prefix is sent", async () => {
  const { a } = memory();
  const initial = await submitDiscovery(a, undefined, record, remote);
  await a.mutate((s) => {
    s.sites[0].billing = { keyPrefix: "bc_live_1234abcd", setAt: "2026-09-22" };
    s.control.kill.doors.spend = true;
  });
  const before = process.env.CITEFLEET_BOTCENTRAL_BILLING;
  try {
    process.env.CITEFLEET_BOTCENTRAL_BILLING = "off";
    assert.equal(
      (await submitDiscovery(a, initial.siteId, record, remote)).submission.status,
      "accepted",
    );
    process.env.CITEFLEET_BOTCENTRAL_BILLING = "on";
    let calls = 0;
    const result = await submitDiscovery(a, initial.siteId, record, {
      ...remote,
      fetch: async () => {
        calls++;
        return Response.json({});
      },
    });
    assert.equal(result.submission.status, "failed");
    assert.equal(calls, 0);
  } finally {
    if (before === undefined) delete process.env.CITEFLEET_BOTCENTRAL_BILLING;
    else process.env.CITEFLEET_BOTCENTRAL_BILLING = before;
  }
});
test("revision increases on changed content and tenant identity is bound in receipt", async () => {
  const { a, b } = memory();
  const first = await submitDiscovery(a, undefined, record, remote);
  const second = await submitDiscovery(a, undefined, { ...record, summary: "Changed" }, remote);
  const repeated = await submitDiscovery(a, undefined, { ...record, summary: "Changed" }, remote);
  assert.equal(second.submission.revision, first.submission.revision + 1);
  assert.equal(repeated.submission.revision, second.submission.revision);
  assert.equal(repeated.submission.idempotencyKey, second.submission.idempotencyKey);
  const another = await submitDiscovery(b, undefined, record, remote);
  assert.notEqual(
    another.submission.receipt?.publisherRecordId,
    first.submission.receipt?.publisherRecordId,
  );
  const request = buildDiscoveryRequest((await a.get()).sites[0], record, a.id);
  assert.throws(() =>
    readDiscoveryReceipt(
      { ...receipt(request), publisherRecordId: "other" },
      request,
      remote.origin,
    ),
  );
  assert.throws(() =>
    readDiscoveryReceipt({ ...receipt(request), revision: 999 }, request, remote.origin),
  );
});
test("private routes and XML-breaking paths are rejected", () => {
  for (const path of ["/api", "/api/users", "/%61dmin", "/settings", "/a&b", "/a%26b"])
    assert.throws(() =>
      parseDiscoveryRecord({
        ...record,
        pages: [{ url: `https://acme.com${path}`, title: "Private" }],
      }),
    );
});
test("revocation during a stale handle's CAS retry refuses dispatch", async () => {
  const { a, io } = memory();
  const token = (await rotateDiscoveryKey(a)).token;
  const anotherProcess = createWorkspaces(io).handleFor(a.id);
  await revokeDiscoveryKey(anotherProcess);
  let calls = 0;
  await assert.rejects(
    submitDiscovery(
      a,
      undefined,
      record,
      {
        ...remote,
        fetch: async () => {
          calls++;
          return Response.json({});
        },
      },
      discoveryDigest(token),
    ),
    /Unauthorized/,
  );
  assert.equal(calls, 0);
  assert.equal((await anotherProcess.get()).sites.length, 0);
});
test("intake drives submission only into the resolved tenant", async () => {
  const { a, b } = memory();
  const token = (await rotateDiscoveryKey(a)).token;
  const request = new Request("https://citefleet.app/api/discovery/submissions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(record),
  });
  const response = await handleDiscoverySubmission(request, {
    resolve: async () => a,
    submit: (ws, id, input, _io, digest) => submitDiscovery(ws, id, input, remote, digest),
  });
  assert.equal(response.status, 200);
  assert.equal((await a.get()).sites.length, 1);
  assert.equal((await b.get()).sites.length, 0);
});

test("outbound size overflow leaves no candidate in cache or persistence", async () => {
  const { a } = memory();
  const huge = {
    ...record,
    pages: Array.from({ length: 20 }, (_, index) => ({
      url: `https://acme.com/${index}${"a".repeat(1900)}`,
      title: "Long route",
    })),
  };
  await assert.rejects(submitDiscovery(a, undefined, huge, remote), /64 KiB/);
  assert.equal((await a.get()).sites.length, 0);
});

test("transient failure retries once and validates the second receipt", async () => {
  const { a } = memory();
  let count = 0;
  const result = await submitDiscovery(a, undefined, record, {
    ...remote,
    fetch: async (url, options) => {
      count++;
      if (count === 1) return new Response(null, { status: 503 });
      return successful(url, options);
    },
  });
  assert.equal(result.submission.status, "accepted");
  assert.equal(count, 2);
});

test("ambiguous website and capability matches fail closed", async () => {
  const { a } = memory();
  await submitDiscovery(a, undefined, record, remote);
  await a.mutate((s) => {
    s.sites.push({ ...s.sites[0], id: "duplicate" });
  });
  await assert.rejects(submitDiscovery(a, undefined, record, remote), /Ambiguous/);
  const sql = (async () => []) as unknown as Sql;
  sql.query = async <T>() => [{ id: "ws-alpha" }, { id: "ws-bravo" }] as T[];
  assert.equal(await workspaceForDiscoveryDigest("a".repeat(64), sql), null);
});

test("a newly rotated token refreshes stale cached credentials through CAS", async () => {
  const { a, io } = memory();
  await rotateDiscoveryKey(a);
  const anotherProcess = createWorkspaces(io).handleFor(a.id);
  const token = (await rotateDiscoveryKey(anotherProcess)).token;
  const result = await submitDiscovery(a, undefined, record, remote, discoveryDigest(token));
  assert.equal(result.submission.status, "accepted");
});
