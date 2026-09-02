import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// A React component that imports a module with a top-level `node:` import
// crashes the route in the browser (seen 2026-09-02: node:dns via hosting.ts).
// Walk the direct imports of every component/route file and refuse any that
// resolve to a module importing `node:` at top level.
// Known limits: direct imports only (not two hops deep), `node:`-prefixed
// specifiers only (a bare "dns/promises" is not flagged), static imports only.
const SRC = path.resolve(import.meta.dirname, "..", "..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}
function localImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/^import\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)) {
    const spec = m[1];
    let target: string | null = null;
    if (spec.startsWith("@/")) target = path.join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) target = path.resolve(path.dirname(file), spec);
    if (!target) continue;
    for (const cand of [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
      try { if (statSync(cand).isFile()) { out.push(cand); break; } } catch { /* try next */ }
    }
  }
  return out;
}
const importsNode = (file: string) => /^import\s[^;]*from\s+["']node:/m.test(readFileSync(file, "utf8"));

test("no component or route reaches a module with a top-level node: import", () => {
  const clientFiles = [...walk(path.join(SRC, "components")), ...walk(path.join(SRC, "routes"))].filter((f) => !/\.server\.ts$/.test(f) && !/routes\/(api|health|llms|sitemap)/.test(f));
  const offenders: string[] = [];
  for (const f of clientFiles) for (const dep of localImports(f)) if (importsNode(dep)) offenders.push(`${path.relative(SRC, f)} → ${path.relative(SRC, dep)}`);
  assert.deepEqual(offenders, []);
  // positive control: the guard can see node: imports where they belong
  assert.equal(importsNode(path.join(SRC, "lib/citefleet/hosting.ts")), true);
  assert.equal(importsNode(path.join(SRC, "lib/citefleet/hosting-hint.ts")), false);
});
