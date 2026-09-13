import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sql } from "../db.ts";
import { workspaceForDnsSetup } from "./workspace-registry.server.ts";

const JOB_ID = "9C128FE4-63CD-4EC4-9AE8-8A9D06C0E6DE";

function fakeSql(rows: Array<{ id: string }>, calls: Array<{ text: string; params: unknown[] }>) {
  const sql = (async <T = Record<string, unknown>>(
    _strings: TemplateStringsArray,
    ..._values: unknown[]
  ) => rows as T[]) as unknown as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return rows as T[];
  };
  return sql;
}

test("Entri tenant resolution binds normalized domain and canonical job UUID", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const ws = await workspaceForDnsSetup(
    "https://WWW.Acme.Example/path",
    JOB_ID,
    fakeSql([{ id: "ws-alpha" }], calls),
  );

  assert.equal(ws?.id, "ws-alpha");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ["acme.example", JOB_ID.toLowerCase()]);
  assert.match(calls[0].text, /site->'dnsSetup'->>'jobId'/);
  assert.match(calls[0].text, /LIMIT 2/);
});

test("Entri tenant resolution refuses ambiguous or malformed correlation", async () => {
  const ambiguousCalls: Array<{ text: string; params: unknown[] }> = [];
  const ambiguous = await workspaceForDnsSetup(
    "acme.example",
    JOB_ID,
    fakeSql([{ id: "ws-alpha" }, { id: "ws-bravo" }], ambiguousCalls),
  );
  assert.equal(ambiguous, null);
  assert.equal(ambiguousCalls.length, 1);

  const invalidCalls: Array<{ text: string; params: unknown[] }> = [];
  const invalid = await workspaceForDnsSetup(
    "acme.example",
    "not-an-entri-job",
    fakeSql([{ id: "ws-alpha" }], invalidCalls),
  );
  assert.equal(invalid, null);
  assert.equal(invalidCalls.length, 0);
});
