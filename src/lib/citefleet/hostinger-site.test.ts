import assert from "node:assert/strict";
import { test } from "node:test";
import { exactHostingerDomain } from "./hostinger-site.ts";

test("Hostinger job scope preserves www and the exact site host", () => {
  assert.equal(exactHostingerDomain("WWW.Example.com"), "www.example.com");
  assert.equal(exactHostingerDomain("example.com"), "example.com");
  assert.notEqual(exactHostingerDomain("www.example.com"), exactHostingerDomain("example.com"));
  for (const unsafe of ["https://example.com", " example.com", "example.com/other", "example..com"]) {
    assert.throws(() => exactHostingerDomain(unsafe));
  }
});
