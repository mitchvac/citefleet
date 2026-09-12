import assert from "node:assert/strict";
import { test } from "node:test";
import { authClientKey } from "./client-key.server.ts";

test("nginx X-Real-IP wins over a caller-supplied forwarding chain", () => {
  const request = new Request("https://citefleet.app/api/forgot", {
    headers: {
      "x-real-ip": "203.0.113.12",
      "x-forwarded-for": "forged-client, 203.0.113.12",
    },
  });
  assert.equal(authClientKey(request), "203.0.113.12");
});

test("the last forwarding hop is the fallback when nginx is absent", () => {
  const request = new Request("http://localhost/api/login", {
    headers: { "x-forwarded-for": "forged-client, 198.51.100.8" },
  });
  assert.equal(authClientKey(request), "198.51.100.8");
});

test("missing or blank forwarding headers share the unknown bucket", () => {
  assert.equal(authClientKey(new Request("http://localhost/api/login")), "unknown");
  assert.equal(
    authClientKey(
      new Request("http://localhost/api/login", {
        headers: { "x-real-ip": " ", "x-forwarded-for": " , " },
      }),
    ),
    "unknown",
  );
});
