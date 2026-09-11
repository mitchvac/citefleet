import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanIndexNowKey,
  isIndexNowKey,
  newIndexNowKey,
  resolveIndexNowKey,
} from "./indexnow.ts";
import { buildOriginPack } from "./originPack.ts";
import { classifyOriginFile } from "./origin-ownership.ts";
import type { Site } from "./types.ts";

test("a valid key is accepted and returned unchanged", () => {
  assert.equal(cleanIndexNowKey("a1b2c3d4"), "a1b2c3d4");
  assert.equal(cleanIndexNowKey("  With-Hyphens-And-Caps-123  "), "With-Hyphens-And-Caps-123");
});

test("a key that would escape the origin root is REFUSED, not repaired", () => {
  // This is the defect that mattered: the key becomes `${prefix}${key}.txt`, a
  // path written through the GitHub Contents API. Sanitizing `../../x` down to
  // `x` would leave a silently different key that still writes somewhere the
  // customer did not choose — so it is refused whole.
  for (const bad of [
    "../../.github/workflows/deploy",
    "../secrets",
    "a/b",
    "key.txt",
    "key with spaces",
    "key?query=1",
    "short",          // under 8
    "x".repeat(129),  // over 128
    "",
    "   ",
  ]) {
    assert.equal(cleanIndexNowKey(bad), "", `accepted ${JSON.stringify(bad)}`);
    assert.equal(isIndexNowKey(bad), false);
  }
  assert.equal(cleanIndexNowKey(42), "");
  assert.equal(cleanIndexNowKey(undefined), "");
});

test("a generated key is valid, URL-safe and not the same twice", () => {
  const a = newIndexNowKey();
  const b = newIndexNowKey();
  assert.equal(cleanIndexNowKey(a), a);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test("resolveIndexNowKey NEVER replaces a key a site already has", () => {
  // The invariant. The `<key>.txt` file carries no ownership marker, so
  // CiteFleet can create it but can never recognise and replace it — a rotated
  // key leaves the old file stranded on the customer's origin forever.
  const existing = "existing-key-1234";
  assert.equal(resolveIndexNowKey(existing), existing);
  assert.equal(resolveIndexNowKey(existing, "some-other-key"), existing);
  // Even an invalid stored value is not silently replaced by a paste; it is
  // treated as absent and the paste is used, which is the only safe reading.
  assert.equal(resolveIndexNowKey("bad key", "good-key-5678"), "good-key-5678");
});

test("a site with no key gets one generated rather than shipping four files", () => {
  const key = resolveIndexNowKey(undefined);
  assert.equal(cleanIndexNowKey(key), key);
  assert.notEqual(key, "");
});

test("the pack ships five files once a key exists, four without", () => {
  const base = {
    name: "Acme",
    domain: "acme.com",
    url: "https://acme.com",
    summary: "",
    routes: ["/"],
    sitemapUrl: "https://acme.com/sitemap.xml",
  } as unknown as Site;
  assert.equal(buildOriginPack(base).length, 4, "positive control: no key, four files");
  const key = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
  const withKey = buildOriginPack({ ...base, indexNowKey: key } as Site);
  assert.equal(withKey.length, 5);
  assert.ok(withKey.some((f) => f.path === `public/${key}.txt`));
});

test("an invalid key stored on a site never becomes a path", () => {
  // Defence in depth: even if a bad value reached the store some other way,
  // buildOriginPack refuses to turn it into a file.
  const site = {
    name: "Acme",
    domain: "acme.com",
    url: "https://acme.com",
    summary: "",
    routes: ["/"],
    sitemapUrl: "https://acme.com/sitemap.xml",
    indexNowKey: "../../.github/workflows/x",
  } as unknown as Site;
  const paths = buildOriginPack(site).map((f) => f.path);
  assert.equal(paths.length, 4);
  for (const p of paths) assert.ok(!p.includes(".."), p);
});

test("a generated key file classifies create then identical, never refused", () => {
  // The `<key>.txt` file has no owner marker, so `refused` is unrecoverable
  // without the customer deleting the file by hand. It must never be reachable
  // for a key CiteFleet generated itself.
  const key = newIndexNowKey();
  const content = `${key}\n`;
  assert.equal(classifyOriginFile({ path: `${key}.txt`, generated: content, remote: null }).state, "create");
  assert.equal(
    classifyOriginFile({ path: `${key}.txt`, generated: content, remote: content }).state,
    "identical",
  );
  // Positive control: a DIFFERENT body really is refused, so the two passes above
  // are evidence about the content and not about the path.
  assert.equal(
    classifyOriginFile({ path: `${key}.txt`, generated: content, remote: "someone else's key\n" }).state,
    "refused",
  );
});
