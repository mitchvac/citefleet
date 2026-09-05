import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createSession,
  hasSession,
  resetOperatorState,
  sessionUser,
  SESSION_TTL_MS,
} from "./operator-core.ts";

// Sessions carried no identity at all before 2026-09-05 — the map held only
// timestamps — so the console could not name or picture whoever was signed in.

test("a session created without an account is anonymous, not empty-stringed", () => {
  resetOperatorState();
  const id = createSession();
  assert.equal(hasSession(id), true);
  // The operator TOKEN path has no account behind it. That must read as null
  // rather than being attributed to somebody.
  assert.equal(sessionUser(id), null);
});

test("a session created with an account carries it back", () => {
  resetOperatorState();
  const id = createSession(Date.now(), {
    email: "ops@citefleet.app",
    name: "Ops",
    imageUrl: "https://lh3.googleusercontent.com/a/abc",
  });
  assert.deepEqual(sessionUser(id), {
    email: "ops@citefleet.app",
    name: "Ops",
    imageUrl: "https://lh3.googleusercontent.com/a/abc",
  });
});

test("an expired session surfaces no identity", () => {
  resetOperatorState();
  const t0 = Date.now();
  const id = createSession(t0, { email: "ops@citefleet.app", name: "Ops" });
  // Positive control FIRST: hasSession deletes an expired entry, so reading
  // after the expiry check would pass for the wrong reason.
  assert.equal(sessionUser(id, t0 + 1000)?.email, "ops@citefleet.app");
  const after = t0 + SESSION_TTL_MS + 1;
  // The identity read must honour the same expiry as hasSession, or a stale
  // cookie could still print a name in the header.
  assert.equal(sessionUser(id, after), null);
  assert.equal(hasSession(id, after), false);
});

test("an unknown or absent session id yields null", () => {
  resetOperatorState();
  assert.equal(sessionUser(undefined), null);
  assert.equal(sessionUser(""), null);
  assert.equal(sessionUser("not-a-real-session"), null);
});

test("only https provider images are ever stored", () => {
  // httpsImage is not exported (it guards oauth.server.ts internals), so this
  // pins the rule against the source the way the other auth tests do.
  const text = readFileSync(new URL("./oauth.server.ts", import.meta.url), "utf8");
  assert.match(text, /function httpsImage/, "positive control: the guard exists");
  assert.match(text, /protocol === "https:"/);
  // Both providers must pass their image through it, never raw.
  assert.match(text, /image: httpsImage\(profile\.picture\)/);
  assert.match(text, /image: httpsImage\(user\.avatar_url\)/);
});
