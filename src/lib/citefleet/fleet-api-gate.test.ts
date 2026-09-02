import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Source-pinning test: every server fn CiteFleet exposes carries the operator
// gate. A new createServerFn without .middleware([operatorMiddleware]) fails here.
test("every createServerFn in fleet-api.ts is behind operatorMiddleware", () => {
  const src = readFileSync(path.resolve(import.meta.dirname, "fleet-api.ts"), "utf8");
  const fns = src.match(/createServerFn\(\{ method: "(GET|POST)" \}\)/g) ?? [];
  const gated = src.match(/\.middleware\(\[operatorMiddleware\]\)/g) ?? [];
  assert.ok(fns.length >= 18, `positive control: expected at least 18 server fns, found ${fns.length}`);
  assert.equal(gated.length, fns.length, "a server fn is missing .middleware([operatorMiddleware])");
  // each createServerFn is immediately followed by the middleware call
  const orphan = /createServerFn\(\{ method: "(GET|POST)" \}\)(?!\s*\.middleware\(\[operatorMiddleware\]\))/;
  assert.equal(orphan.test(src), false, "createServerFn not immediately followed by the gate");
});

test("no other module in src defines a server fn", () => {
  // Only fleet-api.ts may create server fns; anything else would bypass the gate audit.
  const root = path.resolve(import.meta.dirname, "..", "..");
  const out = execSync("grep -rl 'createServerFn(' --include='*.ts' --include='*.tsx' " + JSON.stringify(root), { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map((f) => path.relative(root, f))
    .filter((f) => !/\.test\.tsx?$/.test(f)) // this file mentions the string
    .filter((f) => !/^lib\/auth\/middleware\.ts$/.test(f) && !/^lib\/db\.ts$/.test(f) && !/^lib\/app-data\//.test(f)); // comments/docs only
  assert.deepEqual(out, ["lib/citefleet/fleet-api.ts"]);
});
