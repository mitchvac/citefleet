import assert from "node:assert/strict";
import { test } from "node:test";
import { trustedAuthPost, rejectedAuthPost } from "./auth-form.server.ts";
const publicUrl = "https://citefleet.app";
function request(headers: Record<string, string> = {}) {
  return new Request("http://internal:3000/api/login", { method: "POST", headers });
}
test("auth forms accept exact public origin behind proxy and reject attacker/opaque origins", () => {
  assert.equal(
    trustedAuthPost(request({ origin: publicUrl, "sec-fetch-site": "same-origin" }), publicUrl),
    true,
  );
  for (const origin of [
    "https://attacker.example",
    "https://citefleet.app.attacker.example",
    "http://citefleet.app",
    "null",
    "invalid",
  ]) {
    assert.equal(trustedAuthPost(request({ origin }), publicUrl), false, origin);
  }
  for (const site of ["cross-site", "same-site", "unexpected"]) {
    assert.equal(
      trustedAuthPost(request({ origin: publicUrl, "sec-fetch-site": site }), publicUrl),
      false,
      site,
    );
  }
  assert.equal(trustedAuthPost(request({ "sec-fetch-site": "same-origin" }), publicUrl), false);
  assert.equal(trustedAuthPost(request(), publicUrl), true);
  assert.equal(trustedAuthPost(new Request(publicUrl), publicUrl), false);
  assert.equal(rejectedAuthPost().status, 403);
  assert.equal(rejectedAuthPost().headers.get("set-cookie"), null);
});
