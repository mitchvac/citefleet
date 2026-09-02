import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOCKOUT_MS,
  MAX_FAILURES,
  OPERATOR_COOKIE,
  attemptLogin,
  clearFailures,
  clearedCookie,
  isLocked,
  noteFailure,
  hasSession,
  operatorTokenConfigured,
  pruneFailures,
  trackedClients,
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

test("failure records are pruned after an hour and capped, so anonymous traffic cannot grow the map", () => {
  resetOperatorState();
  const t0 = 5_000_000;
  for (let i = 0; i < 20; i++) attemptLogin("nope", `client-${i}`, { token: TOKEN, now: t0 });
  assert.equal(trackedClients(), 20, "positive control: records exist");
  pruneFailures(t0 + 60 * 60 * 1000 - 1);
  assert.equal(trackedClients(), 20, "not yet stale");
  pruneFailures(t0 + 60 * 60 * 1000 + 1);
  assert.equal(trackedClients(), 0, "stale records dropped");
  // a fresh record survives pruning; once stale AND its lockout has ended it goes
  for (let i = 0; i < MAX_FAILURES; i++) attemptLogin("nope", "locked-one", { token: TOKEN, now: t0 });
  pruneFailures(t0 + 30_000);
  assert.equal(trackedClients(), 1, "recent locked record kept");
  pruneFailures(t0 + 60 * 60 * 1000 + 1);
  assert.equal(trackedClients(), 0, "stale record with expired lockout dropped");
});

test("shared lockout helpers: five failures lock, success clears, other clients unaffected", () => {
  resetOperatorState();
  const t0 = 9_000_000;
  assert.equal(isLocked("pw-client", t0), 0);
  for (let i = 0; i < MAX_FAILURES; i++) noteFailure("pw-client", t0);
  const wait = isLocked("pw-client", t0 + 1);
  assert.ok(wait > 0 && wait <= LOCKOUT_MS, "locked after MAX_FAILURES");
  assert.equal(isLocked("other-client", t0 + 1), 0, "positive control: other client free");
  assert.equal(isLocked("pw-client", t0 + LOCKOUT_MS + 1), 0, "released after the window");
  noteFailure("pw-client", t0 + LOCKOUT_MS + 2);
  clearFailures("pw-client");
  assert.equal(isLocked("pw-client", t0 + LOCKOUT_MS + 3), 0);
});

test("lockout: a failure after the window expires restarts the count instead of re-locking", () => {
  resetOperatorState();
  const t0 = 12_000_000;
  for (let i = 0; i < MAX_FAILURES; i++) noteFailure("c", t0);
  assert.ok(isLocked("c", t0 + 1) > 0, "positive control: locked");
  noteFailure("c", t0 + LOCKOUT_MS + 1);
  assert.equal(isLocked("c", t0 + LOCKOUT_MS + 2), 0, "one stale failure does not re-lock");
  for (let i = 0; i < MAX_FAILURES - 1; i++) noteFailure("c", t0 + LOCKOUT_MS + 3);
  assert.ok(isLocked("c", t0 + LOCKOUT_MS + 4) > 0, "locks again once the fresh count reaches the limit");
});
