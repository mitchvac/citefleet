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
  return [...codes].sort();
}

test("every login error code the server emits has a specific message on /login", () => {
  const codes = serverErrorCodes();
  // Positive control: the scan sees the codes that were missing on 2026-09-03.
  assert.ok(codes.includes("not-allowed"), `scan found: ${codes.join(", ")}`);
  assert.ok(codes.includes("email-unverified"), `scan found: ${codes.join(", ")}`);
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
