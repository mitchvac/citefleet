import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { GENERIC_LOGIN_MESSAGE, LOGIN_MESSAGES, loginMessage } from "./login-messages.ts";

const here = import.meta.dirname;
const read = (f: string) => readFileSync(path.join(here, f), "utf8");

/** Every `?error=` code the server can redirect /login with. */
function serverErrorCodes(): string[] {
  const codes = new Set<string>();
  // Literal loginError("code") calls in the two redirecting modules.
  for (const file of ["operator.server.ts", "oauth.server.ts"]) {
    for (const m of read(file).matchAll(/loginError\("([a-z-]+)"/g)) codes.add(m[1]);
  }
  // loginError(created.reason === "exists" ? "exists" : "invalid") — createUser reasons.
  for (const m of read("users.server.ts").matchAll(/reason: "([a-z-]+)"/g)) codes.add(m[1]);
  // loginError(result.reason, …) — attemptLogin reasons in the LoginResult type.
  const reasons = read("operator-core.ts").match(/reason: ((?:"[a-z-]+"(?: \| )?)+)/);
  assert.ok(reasons, "positive control: LoginResult reasons found in operator-core.ts");
  for (const m of reasons![1].matchAll(/"([a-z-]+)"/g)) codes.add(m[1]);
  // reset.server.ts redirects with literal `?error=` strings rather than
  // loginError(), plus `reset-${result.reason}` built from ConsumeResult.
  const reset = read("reset.server.ts");
  // Only LITERAL codes: the lookahead requires the string to end right after
  // the code, so `?error=reset-${result.reason}` is not scraped as "reset-".
  for (const m of reset.matchAll(/[?&]error=([a-z-]+)(?=["'`])/g)) codes.add(m[1]);
  if (/error=reset-\$\{result\.reason\}/.test(reset)) {
    const rejections = read("password-reset.ts").match(
      /export type ResetRejection =\s*((?:"[a-z-]+"(?:\s*\|\s*)?)+)/,
    );
    assert.ok(rejections, "positive control: ResetRejection union found in password-reset.ts");
    for (const m of rejections![1].matchAll(/"([a-z-]+)"/g)) codes.add(`reset-${m[1]}`);
  }
  return [...codes].sort();
}

test("every login error code the server emits has a specific message on /login", () => {
  const codes = serverErrorCodes();
  // Positive control: the scan sees the codes that were missing on 2026-09-03.
  assert.ok(codes.includes("not-allowed"), `scan found: ${codes.join(", ")}`);
  assert.ok(codes.includes("email-unverified"), `scan found: ${codes.join(", ")}`);
  // Positive control for the reset half: the scan must reach reset.server.ts and
  // expand the ResetRejection union, or it silently covers nothing there.
  assert.ok(codes.includes("mail-unavailable"), `scan found: ${codes.join(", ")}`);
  assert.ok(codes.includes("reset-expired"), `scan found: ${codes.join(", ")}`);
  assert.ok(codes.includes("reset-weak-password"), `scan found: ${codes.join(", ")}`);
  // Negative control: the template literal must not leak a truncated code.
  assert.ok(!codes.includes("reset-"), `scan scraped a partial code: ${codes.join(", ")}`);
  assert.ok(
    codes.length >= 10,
    `positive control: expected at least 10 codes, found ${codes.length}`,
  );
  const missing = codes.filter((c) => !LOGIN_MESSAGES[c]);
  assert.deepEqual(missing, [], "codes without a message");
  for (const c of codes)
    assert.notEqual(loginMessage(c), GENERIC_LOGIN_MESSAGE, `${c} falls back to the generic line`);
});

test("unknown or absent codes: generic line / nothing", () => {
  assert.equal(loginMessage("no-such-code"), GENERIC_LOGIN_MESSAGE);
  assert.equal(loginMessage(null), null);
  assert.equal(loginMessage(""), null);
});
