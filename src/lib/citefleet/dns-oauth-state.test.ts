import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Sql } from "../db.ts";
import {
  createPorkbunAuthorizationState,
  createDnsOAuthState,
  consumePorkbunAuthorizationState,
  consumeDnsOAuthState,
  DNS_OAUTH_TTL_MS,
  PORKBUN_AUTH_TTL_MS,
} from "./dns-oauth-state.server.ts";
import { asWorkspaceId } from "./workspace-id.ts";

function fakeSql(run: (text: string, params: unknown[]) => unknown[]): Sql {
  const sql = (() => Promise.resolve([])) as unknown as Sql;
  sql.query = async <T>(text: string, params: unknown[] = []) => run(text, params) as T[];
  return sql;
}

test("OAuth state stores only a digest and a ten-minute expiry", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const now = new Date("2026-09-13T18:30:00.000Z");
  const state = "a".repeat(43);
  const created = await createDnsOAuthState(
    {
      workspaceId: asWorkspaceId("ws-acme"),
      userId: "user-1",
      siteId: "site-1",
      provider: "cloudflare",
      domain: "example.com",
    },
    {
      sql: fakeSql((text, params) => {
        calls.push({ text, params });
        return [];
      }),
      now: () => now,
      randomState: () => state,
      randomId: () => "operation-1",
    },
  );
  assert.deepEqual(created, { state, operationId: "dns-operation-1" });
  const insert = calls.find((call) => call.text.includes("INSERT INTO"))!;
  assert.ok(insert, "positive control: insertion occurred");
  assert.doesNotMatch(JSON.stringify(insert.params), new RegExp(state));
  assert.match(String(insert.params[0]), /^[0-9a-f]{64}$/);
  assert.equal((insert.params[7] as Date).getTime(), now.getTime() + DNS_OAUTH_TTL_MS);
});

test("OAuth state consumption is atomic, user-bound, unexpired, and membership-bound", async () => {
  let query = "";
  const result = await consumeDnsOAuthState("b".repeat(43), "user-1", {
    sql: fakeSql((text) => {
      query = text;
      return [
        {
          operation_id: "dns-operation-1",
          workspace_id: "ws-acme",
          user_id: "user-1",
          site_id: "site-1",
          provider: "cloudflare",
          domain: "example.com",
        },
      ];
    }),
  });
  assert.equal(result?.workspaceId, "ws-acme");
  assert.match(query, /consumed_at IS NULL/);
  assert.match(query, /expires_at > \$3/);
  assert.match(query, /citefleet_workspace_members/);
  assert.match(query, /oauth\.user_id = \$2/);
});

test("malformed or replayed OAuth state resolves to nothing", async () => {
  let called = false;
  const sql = fakeSql(() => {
    called = true;
    return [];
  });
  assert.equal(await consumeDnsOAuthState("too-short", "user-1", { sql }), null);
  assert.equal(called, false);
  assert.equal(await consumeDnsOAuthState("c".repeat(43), "user-1", { sql }), null);
  assert.equal(called, true);
});

test("Porkbun PKCE state stores a request-token digest and bounded verifier", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const now = new Date("2026-09-15T14:00:00.000Z");
  const requestToken = "d".repeat(64);
  const codeVerifier = "v".repeat(43);
  const created = await createPorkbunAuthorizationState(
    {
      workspaceId: asWorkspaceId("ws-acme"),
      userId: "user-1",
      siteId: "site-1",
      domain: "example.com",
      requestToken,
      codeVerifier,
    },
    {
      sql: fakeSql((text, params) => {
        calls.push({ text, params });
        return [];
      }),
      now: () => now,
      randomId: () => "porkbun-1",
    },
  );
  assert.deepEqual(created, { operationId: "dns-porkbun-1" });
  const insert = calls.find((call) => call.text.includes("INSERT INTO"))!;
  assert.doesNotMatch(JSON.stringify(insert.params), new RegExp(requestToken));
  assert.match(String(insert.params[0]), /^[0-9a-f]{64}$/);
  assert.equal(insert.params[6], codeVerifier);
  assert.equal((insert.params[7] as Date).getTime(), now.getTime() + PORKBUN_AUTH_TTL_MS);
});

test("Porkbun PKCE state is deleted atomically and remains user and membership bound", async () => {
  let query = "";
  const result = await consumePorkbunAuthorizationState("e".repeat(64), "user-1", {
    sql: fakeSql((text) => {
      query = text;
      return [
        {
          operation_id: "dns-porkbun-1",
          workspace_id: "ws-acme",
          user_id: "user-1",
          site_id: "site-1",
          provider: "porkbun",
          domain: "example.com",
          pkce_verifier: "v".repeat(43),
        },
      ];
    }),
  });
  assert.equal(result?.codeVerifier, "v".repeat(43));
  assert.match(query, /DELETE FROM citefleet_dns_oauth_states/);
  assert.match(query, /oauth\.provider = 'porkbun'/);
  assert.match(query, /oauth\.user_id = \$2/);
  assert.match(query, /citefleet_workspace_members/);
  assert.match(query, /RETURNING[\s\S]*oauth\.pkce_verifier/);
});

test("the migration owns, constrains, indexes, and enables RLS on OAuth state", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/20260913183000_citefleet_dns_oauth_states.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS citefleet_dns_oauth_states/);
  assert.match(migration, /state_hash\s+TEXT PRIMARY KEY/);
  assert.match(migration, /workspace_id TEXT NOT NULL REFERENCES citefleet_workspaces/);
  assert.match(migration, /user_id\s+TEXT NOT NULL REFERENCES citefleet_users/);
  assert.match(migration, /operation_id TEXT NOT NULL UNIQUE/);
  assert.match(migration, /CREATE INDEX[\s\S]*expires_at/);
  assert.match(migration, /ALTER TABLE citefleet_dns_oauth_states OWNER TO citefleet/);
  assert.match(migration, /ALTER TABLE citefleet_dns_oauth_states ENABLE ROW LEVEL SECURITY/);

  const porkbun = readFileSync(
    new URL(
      "../../../supabase/migrations/20260915140000_citefleet_porkbun_dns_authorizations.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(porkbun, /ADD COLUMN IF NOT EXISTS pkce_verifier TEXT/);
  assert.match(porkbun, /provider IN \('cloudflare', 'porkbun'\)/);
  assert.match(porkbun, /provider = 'porkbun'[\s\S]*pkce_verifier ~ /);
});
