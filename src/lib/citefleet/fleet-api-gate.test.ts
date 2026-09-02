import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("every createServerFn in fleet-api.ts is behind authMiddleware", () => {
  const src = readFileSync(path.resolve(import.meta.dirname, "fleet-api.ts"), "utf8");
  const fns = src.match(/createServerFn\(\{ method: "(GET|POST)" \}\)/g) ?? [];
  const gated = src.match(/\.middleware\(\[authMiddleware\]\)/g) ?? [];
  assert.ok(fns.length >= 18, `positive control: expected at least 18 server fns, found ${fns.length}`);
  assert.equal(gated.length, fns.length, "a server fn is missing .middleware([authMiddleware])");
  const orphan = /createServerFn\(\{ method: "(GET|POST)" \}\)(?!\s*\.middleware\(\[authMiddleware\]\))/;
  assert.equal(orphan.test(src), false, "createServerFn not immediately followed by the gate");
});

test("no other module in src defines a server fn", () => {
  const root = path.resolve(import.meta.dirname, "..", "..");
  const out = execSync("grep -rl 'createServerFn(' --include='*.ts' --include='*.tsx' " + JSON.stringify(root), { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((f) => path.relative(root, f))
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => !/^lib\/auth\/middleware\.ts$/.test(f) && !/^lib\/db\.ts$/.test(f) && !/^lib\/app-data\//.test(f));
  assert.deepEqual(out, ["lib/citefleet/fleet-api.ts"]);
});
