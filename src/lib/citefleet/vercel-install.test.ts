import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  assertVercelProperty,
  claimVercelInstall,
  consumeVercelInstallState,
  decryptVercelToken,
  encryptVercelToken,
  vercelInstallConfig,
} from "./vercel-install.server.ts";
import type { Sql } from "../db.ts";
import type { Site } from "./types.ts";

const key = randomBytes(32);
const env = {
  CITEFLEET_VERCEL_INSTALL_INTEGRATION_SLUG: "citefleet-files",
  CITEFLEET_VERCEL_INSTALL_CLIENT_ID: "oac_files",
  CITEFLEET_VERCEL_INSTALL_CLIENT_SECRET: "secret",
  CITEFLEET_VERCEL_INSTALL_TOKEN_KEY: key.toString("base64"),
};
test("file installation needs its separate complete configuration and 256-bit key", () => {
  assert.equal(vercelInstallConfig({}), null);
  assert.equal(
    vercelInstallConfig({
      CITEFLEET_VERCEL_CLIENT_ID: "dns",
      CITEFLEET_VERCEL_CLIENT_SECRET: "dns",
    }),
    null,
  );
  assert.equal(vercelInstallConfig({ ...env, CITEFLEET_VERCEL_INSTALL_TOKEN_KEY: "bad" }), null);
  assert.equal(vercelInstallConfig({ ...env, CITEFLEET_VERCEL_INSTALL_CLIENT_SECRET: "" }), null);
  assert.equal(
    vercelInstallConfig(env)?.redirectUri,
    "https://citefleet.app/api/hosting/vercel/callback",
  );
  assert.equal(vercelInstallConfig({ ...env, CITEFLEET_PUBLIC_URL: "http://evil.example" }), null);
});
test("temporary token ciphertext is random and bound to the operation and key", () => {
  const encrypted = encryptVercelToken("customer-token", "operation-a", key);
  assert.equal(decryptVercelToken(encrypted, "operation-a", key), "customer-token");
  assert.notEqual(encrypted, encryptVercelToken("customer-token", "operation-a", key));
  assert.ok(!encrypted.includes("customer-token"));
  assert.throws(() => decryptVercelToken(encrypted, "operation-b", key));
  assert.throws(() => decryptVercelToken(encrypted, "operation-a", randomBytes(32)));
  const parts = encrypted.split(".");
  parts[2] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptVercelToken(parts.join("."), "operation-a", key));
});
test("property authorization pins exact origin including www and refuses paths/http", () => {
  const site = { url: "https://www.example.com", domain: "www.example.com" } as Site;
  assert.doesNotThrow(() =>
    assertVercelProperty(site, { site_url: site.url, domain: site.domain }),
  );
  for (const url of [
    "http://www.example.com",
    "https://www.example.com/path",
    "https://name:password@www.example.com",
    "https://www.example.com?x=1",
    "https://www.example.com:444",
  ])
    assert.throws(() => assertVercelProperty({ ...site, url }));
  assert.throws(() =>
    assertVercelProperty(site, { site_url: "https://example.com", domain: "example.com" }),
  );
  assert.throws(() => assertVercelProperty(undefined));
});
function recorder() {
  const calls: Array<{ query: string; params: unknown[] }> = [];
  const sql = Object.assign(async () => [], {
    query: async (query: string, params: unknown[] = []) => {
      calls.push({ query, params });
      return [];
    },
  }) as Sql;
  return { calls, sql };
}
test("OAuth consumption requires workspace+user membership, expiry and unused state in one mutation", async () => {
  const { calls, sql } = recorder();
  assert.equal(await consumeVercelInstallState(sql, "bad", "user-b", "ws-b"), null);
  assert.equal(calls.length, 0);
  const state = randomBytes(32).toString("base64url");
  assert.equal(await consumeVercelInstallState(sql, state, "user-b", "ws-b"), null);
  assert.deepEqual(calls[0].params.slice(1), ["user-b", "ws-b"]);
  assert.match(String(calls[0].params[0]), /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0].params[0], state);
  for (const check of [
    "user_id=$2",
    "workspace_id=$3",
    "consumed_at IS NULL",
    "expires_at>now()",
    "m.user_id=j.user_id",
    "w.archived_at IS NULL",
    "state_hash=NULL",
  ])
    assert.ok(calls[0].query.includes(check), check);
});
test("claim excludes foreign user/workspace, unexpired leases and terminal operations", async () => {
  const { calls, sql } = recorder();
  assert.equal(await claimVercelInstall(sql, "job", "ws-other", "user-other"), null);
  assert.deepEqual(calls[0].params.slice(0, 3), ["job", "ws-other", "user-other"]);
  for (const check of [
    "workspace_id=$2",
    "user_id=$3",
    "lease_until<now()",
    "expires_at>now()",
    "status IN ('authorized','installing','building','verifying')",
    "m.user_id=j.user_id",
    "w.archived_at IS NULL",
  ])
    assert.ok(calls[0].query.includes(check), check);
});
test("migration closes API grants and enforces a single active operation", () => {
  const sql = readFileSync(
    new URL(
      "../../../supabase/migrations/20260922190000_citefleet_vercel_installs.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const check of [
    "ENABLE ROW LEVEL SECURITY",
    "FROM PUBLIC",
    "FROM anon",
    "FROM authenticated",
    "FROM service_role",
    "REFERENCES citefleet_workspaces(id)",
    "REFERENCES citefleet_users(id)",
    "CREATE UNIQUE INDEX citefleet_vercel_active_site",
    "OR encrypted_token IS NULL",
  ])
    assert.ok(sql.includes(check), check);
});

test(
  "Postgres enforces OAuth replay, tenant isolation, lease exclusion and active-job uniqueness",
  {
    skip: process.env.TEST_VERCEL_DATABASE_URL
      ? false
      : "Test not run — TEST_VERCEL_DATABASE_URL is not configured with the migrated test database",
  },
  async () => {
    const { Client } = await import("pg");
    const { createHash, randomUUID } = await import("node:crypto");
    const client = new Client({ connectionString: process.env.TEST_VERCEL_DATABASE_URL });
    await client.connect();
    try {
      await client.query("BEGIN");
      const marker = `vercel-test-${randomUUID()}`;
      const user = `${marker}-user`,
        other = `${marker}-other`,
        workspace = `${marker}-workspace`,
        otherWorkspace = `${marker}-other-workspace`;
      await client.query(
        "INSERT INTO citefleet_users(id,email,password_hash) VALUES ($1,$2,'test-only'),($3,$4,'test-only')",
        [user, `${user}@example.invalid`, other, `${other}@example.invalid`],
      );
      await client.query(
        "INSERT INTO citefleet_workspaces(id,slug,name) VALUES ($1,$1,'Vercel transaction test'),($2,$2,'Vercel transaction test')",
        [workspace, otherWorkspace],
      );
      await client.query(
        "INSERT INTO citefleet_workspace_members(workspace_id,user_id) VALUES ($1,$2),($3,$4)",
        [workspace, user, otherWorkspace, other],
      );
      const state = randomBytes(32).toString("base64url"),
        id = randomUUID();
      await client.query(
        `INSERT INTO citefleet_vercel_installs(id,workspace_id,user_id,site_id,domain,site_url,client_id,state_hash,status,message,expected_files,expires_at)
      VALUES ($1,$2,$3,'test-site','example.invalid','https://example.invalid','test-client',$4,'authorization-pending','test','[{},{},{},{},{}]',now()+interval '10 minutes')`,
        [id, workspace, user, createHash("sha256").update(state).digest("hex")],
      );
      const sql = Object.assign(async () => [], {
        query: async (query: string, params: unknown[] = []) =>
          (await client.query(query, params)).rows,
      }) as Sql;
      assert.equal(await consumeVercelInstallState(sql, state, other, otherWorkspace), null);
      assert.equal(await consumeVercelInstallState(sql, state, user, otherWorkspace), null);
      assert.equal((await consumeVercelInstallState(sql, state, user, workspace))?.id, id);
      assert.equal(await consumeVercelInstallState(sql, state, user, workspace), null);
      await client.query("UPDATE citefleet_vercel_installs SET status='authorized' WHERE id=$1", [
        id,
      ]);
      assert.equal(await claimVercelInstall(sql, id, workspace, other), null);
      assert.equal((await claimVercelInstall(sql, id, workspace, user))?.id, id);
      assert.equal(await claimVercelInstall(sql, id, workspace, user), null);
      await client.query("SAVEPOINT duplicate_job");
      await assert.rejects(
        client.query(
          `INSERT INTO citefleet_vercel_installs(id,workspace_id,user_id,site_id,domain,site_url,client_id,status,message,expected_files,expires_at)
      VALUES ($1,$2,$3,'test-site','example.invalid','https://example.invalid','test-client','authorization-pending','test','[{},{},{},{},{}]',now()+interval '10 minutes')`,
          [randomUUID(), workspace, user],
        ),
        /duplicate key/,
      );
      await client.query("ROLLBACK TO SAVEPOINT duplicate_job");
      const posture = await client.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid='citefleet_vercel_installs'::regclass",
      );
      assert.equal(posture.rows[0].relrowsecurity, true);
      const grants = await client.query(
        "SELECT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='citefleet_vercel_installs' AND grantee IN ('PUBLIC','anon','authenticated','service_role')",
      );
      assert.equal(grants.rows.length, 0);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
