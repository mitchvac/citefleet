import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createAuthRuntime,
  type AuthStateStore,
  type SessionWrite,
  type StoredSession,
} from "./auth-state.server.ts";
import { FAILURE_TTL_MS, LOCKOUT_MS, MAX_FAILURES, SESSION_TTL_MS } from "./operator-core.ts";

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";
const OTHER_TOKEN = "abcdef0123456789abcdef0123456789abcdef0123456789";
const SECRET = "auth-state-test-secret-0123456789";
const RAW_SESSION = "a".repeat(64);

class MemoryAuthState implements AuthStateStore {
  sessions = new Map<string, SessionWrite>();
  failures = new Map<string, { count: number; lockedUntil: number; lastAt: number }>();
  findCalls = 0;

  async insertSession(row: SessionWrite) {
    this.sessions.set(row.tokenHash, structuredClone(row));
  }

  async findSession(tokenHash: string, now: number): Promise<StoredSession | null> {
    this.findCalls += 1;
    const row = this.sessions.get(tokenHash);
    if (!row || row.expiresAt <= now) return null;
    return { user: structuredClone(row.user), operatorTokenHash: row.operatorTokenHash };
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async deleteUserSessions(userId: string) {
    for (const [key, row] of this.sessions) {
      if (row.user?.id === userId) this.sessions.delete(key);
    }
  }

  async pruneSessions(now: number) {
    for (const [key, row] of this.sessions) {
      if (row.expiresAt <= now) this.sessions.delete(key);
    }
  }

  async lockedUntil(clientHash: string, now: number) {
    const until = this.failures.get(clientHash)?.lockedUntil ?? 0;
    return until > now ? until : 0;
  }

  async recordFailure(clientHash: string, now: number) {
    const previous = this.failures.get(clientHash);
    const reset = Boolean(
      previous &&
        (previous.lastAt <= now - FAILURE_TTL_MS ||
          (previous.lockedUntil <= now && previous.count >= MAX_FAILURES)),
    );
    const count = reset ? 1 : (previous?.count ?? 0) + 1;
    this.failures.set(clientHash, {
      count,
      lockedUntil: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0,
      lastAt: now,
    });
  }

  async clearFailures(clientHash: string) {
    this.failures.delete(clientHash);
  }

  async pruneFailures(now: number) {
    for (const [key, row] of this.failures) {
      if (row.lastAt <= now - FAILURE_TTL_MS && row.lockedUntil <= now) {
        this.failures.delete(key);
      }
    }
  }
}

function runtime(store: MemoryAuthState, operatorToken = TOKEN, rawSession = RAW_SESSION) {
  return createAuthRuntime(store, {
    authSecret: () => SECRET,
    operatorToken: () => operatorToken,
    randomToken: () => rawSession,
  });
}

test("an account session survives a runtime restart and the store never sees its raw token", async () => {
  const store = new MemoryAuthState();
  const user = {
    id: "u_9f2c1a",
    email: "ops@citefleet.app",
    name: "Ops",
    imageUrl: "https://lh3.googleusercontent.com/a/abc",
  };
  const id = await runtime(store).createAccountSession(user, 1_000);
  assert.equal(id, RAW_SESSION);
  assert.equal(store.sessions.has(RAW_SESSION), false, "raw bearer token must not be stored");
  assert.equal(store.sessions.size, 1, "positive control: one hashed session was stored");

  const afterRestart = runtime(store);
  assert.deepEqual(await afterRestart.lookupSession(id, 1_001), {
    authenticated: true,
    user,
  });
  assert.deepEqual(await afterRestart.lookupSession(id, 1_000 + SESSION_TTL_MS), {
    authenticated: false,
    user: null,
  });
});

test("break-glass sessions are anonymous and operator-token rotation revokes them", async () => {
  const store = new MemoryAuthState();
  const id = await runtime(store).createSession(2_000);
  assert.deepEqual(await runtime(store).lookupSession(id, 2_001), {
    authenticated: true,
    user: null,
  });
  assert.deepEqual(await runtime(store, OTHER_TOKEN).lookupSession(id, 2_002), {
    authenticated: false,
    user: null,
  });
  assert.equal(store.sessions.size, 0, "stale break-glass row is removed");
});

test("revocation removes one session or every session for an account", async () => {
  const store = new MemoryAuthState();
  const user = { id: "u_one", email: "one@example.com", name: "One" };
  const one = await runtime(store, TOKEN, "1".repeat(64)).createAccountSession(user, 3_000);
  const two = await runtime(store, TOKEN, "2".repeat(64)).createAccountSession(user, 3_001);
  await runtime(store).revokeSession(one);
  assert.equal((await runtime(store).lookupSession(one, 3_002)).authenticated, false);
  assert.equal((await runtime(store).lookupSession(two, 3_002)).authenticated, true);
  await runtime(store).revokeUserSessions(user.id);
  assert.equal((await runtime(store).lookupSession(two, 3_003)).authenticated, false);
});

test("forged and malformed session ids fail before touching storage", async () => {
  const store = new MemoryAuthState();
  assert.equal((await runtime(store).lookupSession(undefined)).authenticated, false);
  assert.equal((await runtime(store).lookupSession("not-a-session")).authenticated, false);
  assert.equal(store.findCalls, 0);
  assert.equal((await runtime(store).lookupSession("f".repeat(64))).authenticated, false);
  assert.equal(store.findCalls, 1, "positive control: a well-shaped unknown id reaches storage");
});

test("two runtimes share one failure budget and success clears it", async () => {
  const store = new MemoryAuthState();
  const firstProcess = runtime(store);
  const secondProcess = runtime(store, TOKEN, "b".repeat(64));
  const t0 = 9_000_000;
  for (let i = 0; i < MAX_FAILURES; i += 1) await firstProcess.noteFailure("198.51.100.4", t0);
  assert.equal(await firstProcess.isLocked("other-client", t0 + 1), 0);
  const wait = await secondProcess.isLocked("198.51.100.4", t0 + 1);
  assert.ok(wait > 0 && wait <= LOCKOUT_MS);

  const locked = await secondProcess.attemptLogin(TOKEN, "198.51.100.4", { now: t0 + 1 });
  assert.deepEqual(locked, { ok: false, reason: "locked", retryAfterMs: wait });
  const accepted = await secondProcess.attemptLogin(TOKEN, "198.51.100.4", {
    now: t0 + LOCKOUT_MS + 1,
  });
  assert.equal(accepted.ok, true);
  assert.equal(await firstProcess.isLocked("198.51.100.4", t0 + LOCKOUT_MS + 2), 0);
});

test("the migration stores session and client hashes with ownership and RLS", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260912090000_citefleet_auth_runtime.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS citefleet_sessions/);
  assert.match(migration, /token_hash\s+TEXT PRIMARY KEY/);
  assert.match(migration, /user_id\s+TEXT REFERENCES citefleet_users/);
  assert.match(migration, /ALTER TABLE citefleet_sessions OWNER TO citefleet/);
  assert.match(migration, /ALTER TABLE citefleet_sessions ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS citefleet_auth_failures/);
  assert.match(migration, /ALTER TABLE citefleet_auth_failures ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /^\s*token\s+TEXT/m, "plaintext session tokens must not have a column");
});

test("password recovery creates the new identified account session", () => {
  const resetSource = readFileSync(new URL("./reset.server.ts", import.meta.url), "utf8");
  assert.match(resetSource, /revokeUserSessions\(result\.user\.id\)/);
  assert.match(resetSource, /createAccountSession\(result\.user\)/);
});

test("only https provider images are ever stored", () => {
  const text = readFileSync(new URL("./oauth.server.ts", import.meta.url), "utf8");
  assert.match(text, /function httpsImage/, "positive control: the guard exists");
  assert.match(text, /protocol === "https:"/);
  assert.match(text, /image: httpsImage\(profile\.picture\)/);
  assert.match(text, /image: httpsImage\(user\.avatar_url\)/);
});
