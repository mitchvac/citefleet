import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPERATOR_COOKIE,
  clearedCookie,
  hashClientKey,
  hashOperatorToken,
  hashSessionToken,
  operatorTokenConfigured,
  readCookie,
  safeEqual,
  sessionCookie,
} from "./operator-core.ts";

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";

test("operator token must be configured and at least 32 chars", () => {
  assert.equal(operatorTokenConfigured(undefined), false);
  assert.equal(operatorTokenConfigured("short"), false);
  assert.equal(operatorTokenConfigured(TOKEN), true);
});

test("safeEqual handles equal, different-length, and empty values", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
  assert.equal(safeEqual("", "x"), false);
});

test("session, operator, and client digests are stable and domain-separated", () => {
  assert.match(hashSessionToken("session"), /^[0-9a-f]{64}$/);
  assert.equal(hashSessionToken("session"), hashSessionToken("session"));
  assert.notEqual(hashSessionToken("session"), hashOperatorToken("session"));
  assert.notEqual(hashClientKey("203.0.113.7", "a".repeat(32)), "203.0.113.7");
  assert.notEqual(
    hashClientKey("203.0.113.7", "a".repeat(32)),
    hashClientKey("203.0.113.7", "b".repeat(32)),
  );
  assert.throws(() => hashClientKey("203.0.113.7", "short"), /at least 32/);
});

test("session cookie never contains the operator credential", () => {
  const sessionId = "f".repeat(64);
  const cookie = sessionCookie(sessionId, { secure: true });
  assert.ok(cookie.startsWith(`${OPERATOR_COOKIE}=${sessionId}; `));
  assert.equal(cookie.includes(TOKEN), false);
  for (const attr of ["HttpOnly", "SameSite=Lax", "Secure", "Path=/"]) {
    assert.ok(cookie.includes(attr), attr);
  }
  assert.equal(sessionCookie("x", { secure: false }).includes("Secure"), false);
  assert.match(clearedCookie({ secure: true }), /Max-Age=0/);
});

test("readCookie parses the named cookie only", () => {
  assert.equal(readCookie("a=1; citefleet_op=abc=def; b=2", OPERATOR_COOKIE), "abc=def");
  assert.equal(readCookie("a=1", OPERATOR_COOKIE), undefined);
  assert.equal(readCookie(null, OPERATOR_COOKIE), undefined);
});
