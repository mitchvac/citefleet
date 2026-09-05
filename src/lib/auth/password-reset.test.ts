import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  MIN_PASSWORD_LENGTH,
  RESET_SUBJECT,
  RESET_TTL_MS,
  passwordAcceptable,
  resetEmailBody,
  resetLink,
  resetRejection,
} from "./password-reset.ts";
import { assertHeaderSafe } from "../mail/smtp.ts";

const here = import.meta.dirname;
const read = (f: string) => readFileSync(path.join(here, f), "utf8");
const NOW = Date.parse("2026-09-05T12:00:00Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

test("a spent link reads as spent even after it has also expired", () => {
  // Order matters: reporting "expired" for a link the user already used sends
  // them hunting for a clock problem instead of telling them what happened.
  assert.equal(
    resetRejection({ expiresAt: iso(-60_000), usedAt: iso(-120_000) }, NOW),
    "used",
  );
  assert.equal(resetRejection({ expiresAt: iso(-1), usedAt: null }, NOW), "expired");
  assert.equal(resetRejection(null, NOW), "not-found");
  assert.equal(resetRejection({ expiresAt: iso(60_000), usedAt: null }, NOW), null);
});

test("expiry is exclusive at the boundary", () => {
  // Exactly at expiry the link is dead, not alive for one more millisecond.
  assert.equal(resetRejection({ expiresAt: iso(0), usedAt: null }, NOW), "expired");
  assert.equal(resetRejection({ expiresAt: iso(1), usedAt: null }, NOW), null);
});

test("password length is enforced at the same bar as sign-up", () => {
  assert.equal(passwordAcceptable("a".repeat(MIN_PASSWORD_LENGTH - 1)), false);
  assert.equal(passwordAcceptable("a".repeat(MIN_PASSWORD_LENGTH)), true);
  assert.equal(passwordAcceptable(""), false);
  // createUser refuses under 8; the two must not disagree or a reset could set
  // a password that sign-up would have rejected.
  assert.match(read("users.server.ts"), /password\.length < 8/);
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});

test("the link is built from the configured origin, never a request header", () => {
  assert.equal(
    resetLink("https://citefleet.app", "abc"),
    "https://citefleet.app/reset?token=abc",
  );
  assert.equal(resetLink("https://citefleet.app///", "abc"), "https://citefleet.app/reset?token=abc");
  // base64url tokens contain - and _, and a token must survive the round trip.
  assert.equal(
    resetLink("https://citefleet.app", "a-b_c=="),
    "https://citefleet.app/reset?token=a-b_c%3D%3D",
  );
  const url = new URL(resetLink("https://citefleet.app", "a-b_c=="));
  assert.equal(url.searchParams.get("token"), "a-b_c==");
  // Trusting the Host header here would let anyone who can reach the server
  // mint a reset link pointing at a domain they control.
  assert.ok(
    !/req|request|headers|host/i.test(read("password-reset.ts").split("resetLink")[1] ?? ""),
    "resetLink must not read anything request-shaped",
  );
});

test("the email says what it does, and what it does not", () => {
  const body = resetEmailBody("https://citefleet.app/reset?token=t", RESET_TTL_MS);
  assert.match(body, /https:\/\/citefleet\.app\/reset\?token=t/);
  assert.match(body, /30 minutes/);
  assert.match(body, /works once/);
  // Someone who did not request this must be told nothing has changed yet —
  // otherwise the mail itself reads as a breach notification.
  assert.match(body, /nothing has changed/i);
  assert.match(body, /existing password still works/i);
});

test("the subject survives the SMTP header rules", () => {
  // A subject that throws at send time would fail every reset, silently.
  assert.doesNotThrow(() => assertHeaderSafe("subject", RESET_SUBJECT));
});

/**
 * The no-oracle property. `handleForgot` must answer identically for an unknown
 * address, a non-invited address, and a real account — this console is
 * invite-only, so membership is the fact worth hiding, and `handleLogin`
 * already refuses to leak it.
 *
 * Not unit-testable without a database, so this asserts it against the source
 * the way login-messages.test.ts and client-bundle-guard.test.ts do.
 */
test("the forgot endpoint never varies its answer on whether an account exists", () => {
  const src = read("reset.server.ts");
  const start = src.indexOf("export async function handleForgot");
  assert.ok(start > 0, "positive control: handleForgot found in reset.server.ts");
  const body = src.slice(start, src.indexOf("\n}", start));

  const targets = [...body.matchAll(/redirect\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 3, `positive control: found redirects ${targets.join(", ")}`);

  // Only three destinations are permissible, and none of them describes the
  // address: the shared rate limit, our own mail failure, and "sent".
  const allowed = new Set(["/login?error=locked", "/login?error=mail-unavailable", "/login?sent=1"]);
  for (const t of targets) {
    assert.ok(allowed.has(t), `handleForgot may not redirect to ${t}`);
  }

  // The account-shaped outcomes must not reach a distinct redirect.
  for (const reason of ["no-account", "not-allowed"]) {
    assert.ok(
      !new RegExp(`"${reason}"[^\\n]*redirect`).test(body),
      `${reason} must not select its own response`,
    );
  }
  // And the generic answer must be the function's last word.
  assert.match(body.trimEnd(), /return redirect\("\/login\?sent=1"\);$/);
});

test("a failed send burns the token instead of leaving a live link", () => {
  // A link we could not deliver is a live credential nobody received.
  const src = read("password-reset.server.ts");
  const start = src.indexOf("} catch (err) {");
  assert.ok(start > 0, "positive control: send failure handler found");
  const handler = src.slice(start, start + 500);
  assert.match(handler, /UPDATE citefleet_password_resets SET used_at = now\(\)/);
  assert.match(handler, /send-failed/);
});

test("issuing a new link retires any earlier unspent one", () => {
  const src = read("password-reset.server.ts");
  assert.match(
    src,
    /UPDATE citefleet_password_resets SET used_at = now\(\) WHERE user_id = \$1 AND used_at IS NULL/,
  );
});

test("the token is spent by a guarded UPDATE, not a read-then-write", () => {
  // Check-then-act would let two requests racing the same link both succeed.
  const src = read("password-reset.server.ts");
  assert.match(src, /SET used_at = now\(\)\s*\n\s*WHERE id = \$1 AND used_at IS NULL/);
  assert.match(src, /RETURNING id/);
  // The row stores the HASH and has no column for the plaintext at all.
  const insert = src.match(/INSERT INTO citefleet_password_resets \(([^)]*)\)/);
  assert.ok(insert, "positive control: the INSERT was found");
  assert.match(insert![1], /token_hash/, "the hash column must be written");
  assert.ok(
    !/\btoken\b/.test(insert![1]),
    `a plaintext token column would be a stored credential: ${insert![1]}`,
  );
});
