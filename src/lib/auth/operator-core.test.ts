import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOCKOUT_MS,
  MAX_FAILURES,
  OPERATOR_COOKIE,
  attemptLogin,
  clearedCookie,
  hasSession,
  operatorTokenConfigured,
  readCookie,
  resetOperatorState,
  revokeSession,
  safeEqual,
  sessionCookie,
  sessionCount,
} from "./operator-core.ts";

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";

test("token must be configured and at least 32 chars", () => {
  assert.equal(operatorTokenConfigured(undefined), false);
  assert.equal(operatorTokenConfigured("short"), false);
  assert.equal(operatorTokenConfigured(TOKEN), true);
});

test("safeEqual: equal, different, different length, empty", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
  assert.equal(safeEqual("", "x"), false);
});

test("login: not configured, bad token, good token → session; cookie never contains the token", () => {
  resetOperatorState();
  assert.deepEqual(attemptLogin(TOKEN, "ip1", { token: "" }), { ok: false, reason: "not-configured" });
  assert.deepEqual(attemptLogin("wrong", "ip1", { token: TOKEN }), { ok: false, reason: "bad-token" });
  const ok = attemptLogin(`  ${TOKEN} `, "ip1", { token: TOKEN });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.match(ok.sessionId, /^[0-9a-f]{64}$/);
  assert.equal(hasSession(ok.sessionId), true);
  const cookie = sessionCookie(ok.sessionId, { secure: true });
  assert.ok(cookie.startsWith(`${OPERATOR_COOKIE}=${ok.sessionId}; `));
  assert.equal(cookie.includes(TOKEN), false);
  for (const attr of ["HttpOnly", "SameSite=Lax", "Secure", "Path=/"]) assert.ok(cookie.includes(attr), attr);
  assert.equal(sessionCookie("x", { secure: false }).includes("Secure"), false);
  assert.match(clearedCookie({ secure: true }), /Max-Age=0/);
});

test("lockout after repeated failures, released after the window, reset by success", () => {
  resetOperatorState();
  const t0 = 1_000_000;
  const reasonOf = (r: ReturnType<typeof attemptLogin>) => (r.ok ? "ok" : r.reason);
  for (let i = 0; i < MAX_FAILURES; i++) assert.equal(reasonOf(attemptLogin("nope", "ip2", { token: TOKEN, now: t0 })), "bad-token");
  const locked = attemptLogin(TOKEN, "ip2", { token: TOKEN, now: t0 + 1 });
  assert.equal(locked.ok, false);
  if (locked.ok) return;
  assert.equal(locked.reason, "locked");
  assert.ok((locked.retryAfterMs ?? 0) > 0 && (locked.retryAfterMs ?? 0) <= LOCKOUT_MS);
  // another client is unaffected
  assert.equal(attemptLogin(TOKEN, "ip3", { token: TOKEN, now: t0 + 1 }).ok, true);
  // after the window the right token works and clears the record
  assert.equal(attemptLogin(TOKEN, "ip2", { token: TOKEN, now: t0 + LOCKOUT_MS + 1 }).ok, true);
  assert.equal(reasonOf(attemptLogin("nope", "ip2", { token: TOKEN, now: t0 + LOCKOUT_MS + 2 })), "bad-token");
});

test("sessions expire and can be revoked; unknown/forged ids are rejected", () => {
  resetOperatorState();
  const r = attemptLogin(TOKEN, "ip4", { token: TOKEN, now: 0 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(hasSession(r.sessionId, 1), true);
  assert.equal(hasSession("f".repeat(64), 1), false, "forged id");
  assert.equal(hasSession(undefined, 1), false);
  assert.equal(hasSession(r.sessionId, 31 * 24 * 3600 * 1000), false, "expired");
  const r2 = attemptLogin(TOKEN, "ip4", { token: TOKEN, now: 0 });
  if (!r2.ok) return;
  revokeSession(r2.sessionId);
  assert.equal(hasSession(r2.sessionId, 1), false);
  assert.equal(sessionCount(), 0);
});

test("readCookie parses the named cookie only", () => {
  assert.equal(readCookie("a=1; citefleet_op=abc=def; b=2", OPERATOR_COOKIE), "abc=def");
  assert.equal(readCookie("a=1", OPERATOR_COOKIE), undefined);
  assert.equal(readCookie(null, OPERATOR_COOKIE), undefined);
});
