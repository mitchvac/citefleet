import { randomBytes } from "node:crypto";
import { getSql } from "../db.ts";
import {
  FAILURE_TTL_MS,
  LOCKOUT_MS,
  MAX_FAILURES,
  SESSION_TTL_MS,
  hashClientKey,
  hashOperatorToken,
  hashSessionToken,
  operatorTokenConfigured,
  safeEqual,
  type LoginResult,
  type SessionUser,
} from "./operator-core.ts";

export type StoredSession = {
  user: SessionUser | null;
  operatorTokenHash: string | null;
};

export type SessionWrite = StoredSession & {
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
};

/** Storage contract separated from auth decisions so behavior is testable without Postgres. */
export interface AuthStateStore {
  insertSession(row: SessionWrite): Promise<void>;
  findSession(tokenHash: string, now: number): Promise<StoredSession | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  pruneSessions(now: number): Promise<void>;
  lockedUntil(clientHash: string, now: number): Promise<number>;
  recordFailure(clientHash: string, now: number): Promise<void>;
  clearFailures(clientHash: string): Promise<void>;
  pruneFailures(now: number): Promise<void>;
}

type SessionRow = {
  user_id: string | null;
  operator_token_hash: string | null;
  email: string | null;
  name: string | null;
  image_url: string | null;
};

function epoch(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Raw-pg adapter for the Supabase-hosted PostgreSQL tables. */
export function postgresAuthStateStore(): AuthStateStore {
  return {
    async insertSession(row) {
      const sql = await getSql();
      await sql.query(
        `INSERT INTO citefleet_sessions
           (token_hash, user_id, operator_token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          row.tokenHash,
          row.user?.id ?? null,
          row.operatorTokenHash,
          new Date(row.createdAt).toISOString(),
          new Date(row.expiresAt).toISOString(),
        ],
      );
    },

    async findSession(tokenHash, now) {
      const sql = await getSql();
      const rows = await sql.query<SessionRow>(
        `SELECT s.user_id, s.operator_token_hash, u.email, u.name, u.image_url
           FROM citefleet_sessions s
           LEFT JOIN citefleet_users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, new Date(now).toISOString()],
      );
      const row = rows[0];
      if (!row) return null;
      if (row.user_id) {
        if (!row.email || row.name === null) return null;
        return {
          user: {
            id: row.user_id,
            email: row.email,
            name: row.name,
            imageUrl: row.image_url,
          },
          operatorTokenHash: null,
        };
      }
      return { user: null, operatorTokenHash: row.operator_token_hash };
    },

    async deleteSession(tokenHash) {
      const sql = await getSql();
      await sql.query("DELETE FROM citefleet_sessions WHERE token_hash = $1", [tokenHash]);
    },

    async deleteUserSessions(userId) {
      const sql = await getSql();
      await sql.query("DELETE FROM citefleet_sessions WHERE user_id = $1", [userId]);
    },

    async pruneSessions(now) {
      const sql = await getSql();
      await sql.query("DELETE FROM citefleet_sessions WHERE expires_at <= $1", [
        new Date(now).toISOString(),
      ]);
    },

    async lockedUntil(clientHash, now) {
      const sql = await getSql();
      const rows = await sql.query<{ locked_until: string | Date }>(
        `SELECT locked_until FROM citefleet_auth_failures
          WHERE client_hash = $1 AND locked_until > $2`,
        [clientHash, new Date(now).toISOString()],
      );
      return epoch(rows[0]?.locked_until);
    },

    async recordFailure(clientHash, now) {
      const sql = await getSql();
      const at = new Date(now).toISOString();
      await sql.query(
        `INSERT INTO citefleet_auth_failures
           (client_hash, failure_count, locked_until, last_at)
         VALUES ($1, 1, NULL, $2)
         ON CONFLICT (client_hash) DO UPDATE SET
           failure_count = CASE
             WHEN citefleet_auth_failures.last_at <= $2::timestamptz
                    - ($5::double precision * interval '1 millisecond')
               OR (citefleet_auth_failures.locked_until IS NOT NULL
                   AND citefleet_auth_failures.locked_until <= $2::timestamptz
                   AND citefleet_auth_failures.failure_count >= $3)
             THEN 1
             ELSE citefleet_auth_failures.failure_count + 1
           END,
           locked_until = CASE
             WHEN citefleet_auth_failures.last_at <= $2::timestamptz
                    - ($5::double precision * interval '1 millisecond')
               OR (citefleet_auth_failures.locked_until IS NOT NULL
                   AND citefleet_auth_failures.locked_until <= $2::timestamptz
                   AND citefleet_auth_failures.failure_count >= $3)
             THEN NULL
             WHEN citefleet_auth_failures.failure_count + 1 >= $3
             THEN $2::timestamptz + ($4::double precision * interval '1 millisecond')
             ELSE NULL
           END,
           last_at = $2::timestamptz`,
        [clientHash, at, MAX_FAILURES, LOCKOUT_MS, FAILURE_TTL_MS],
      );
    },

    async clearFailures(clientHash) {
      const sql = await getSql();
      await sql.query("DELETE FROM citefleet_auth_failures WHERE client_hash = $1", [clientHash]);
    },

    async pruneFailures(now) {
      const sql = await getSql();
      await sql.query(
        `DELETE FROM citefleet_auth_failures
          WHERE last_at <= $1::timestamptz
                 - ($2::double precision * interval '1 millisecond')
            AND (locked_until IS NULL OR locked_until <= $1::timestamptz)`,
        [new Date(now).toISOString(), FAILURE_TTL_MS],
      );
    },
  };
}

function configuredAuthSecret(): string {
  const dedicated = (process.env.CITEFLEET_AUTH_SECRET || "").trim();
  if (dedicated.length >= 32) return dedicated;
  const operator = (process.env.CITEFLEET_OPERATOR_TOKEN || "").trim();
  if (operatorTokenConfigured(operator)) return operator;
  throw new Error("CITEFLEET_AUTH_SECRET must be at least 32 characters");
}

type RuntimeOptions = {
  authSecret?: () => string;
  operatorToken?: () => string;
  randomToken?: () => string;
};

export type SessionLookup =
  { authenticated: true; user: SessionUser | null } | { authenticated: false; user: null };

export function createAuthRuntime(store: AuthStateStore, options: RuntimeOptions = {}) {
  const authSecret = options.authSecret ?? configuredAuthSecret;
  const operatorToken =
    options.operatorToken ?? (() => (process.env.CITEFLEET_OPERATOR_TOKEN || "").trim());
  const randomToken = options.randomToken ?? (() => randomBytes(32).toString("hex"));
  const clientHash = (key: string) => hashClientKey(key, authSecret());

  async function putSession(
    user: SessionUser | null,
    now: number,
    breakGlassToken?: string,
  ): Promise<string> {
    const token = randomToken();
    if (!/^[0-9a-f]{64}$/.test(token))
      throw new Error("session generator returned an invalid token");
    await store.pruneSessions(now);
    await store.insertSession({
      tokenHash: hashSessionToken(token),
      user,
      operatorTokenHash: user ? null : hashOperatorToken(breakGlassToken ?? operatorToken()),
      createdAt: now,
      expiresAt: now + SESSION_TTL_MS,
    });
    return token;
  }

  async function createSession(now = Date.now(), token = operatorToken()): Promise<string> {
    if (!operatorTokenConfigured(token)) throw new Error("operator token is not configured");
    return putSession(null, now, token);
  }

  async function createAccountSession(user: SessionUser, now = Date.now()): Promise<string> {
    return putSession(user, now);
  }

  async function lookupSession(id: string | undefined, now = Date.now()): Promise<SessionLookup> {
    if (!id || !/^[0-9a-f]{64}$/.test(id)) return { authenticated: false, user: null };
    const tokenHash = hashSessionToken(id);
    const row = await store.findSession(tokenHash, now);
    if (!row) return { authenticated: false, user: null };
    if (row.user) return { authenticated: true, user: row.user };
    const token = operatorToken();
    if (
      !row.operatorTokenHash ||
      !operatorTokenConfigured(token) ||
      !safeEqual(row.operatorTokenHash, hashOperatorToken(token))
    ) {
      await store.deleteSession(tokenHash);
      return { authenticated: false, user: null };
    }
    return { authenticated: true, user: null };
  }

  async function revokeSession(id: string | undefined): Promise<void> {
    if (id && /^[0-9a-f]{64}$/.test(id)) await store.deleteSession(hashSessionToken(id));
  }

  async function revokeUserSessions(userId: string): Promise<void> {
    await store.deleteUserSessions(userId);
  }

  async function isLocked(key: string, now = Date.now()): Promise<number> {
    const until = await store.lockedUntil(clientHash(key), now);
    return until > now ? until - now : 0;
  }

  async function noteFailure(key: string, now = Date.now()): Promise<void> {
    await store.pruneFailures(now);
    await store.recordFailure(clientHash(key), now);
  }

  async function clearFailures(key: string): Promise<void> {
    await store.clearFailures(clientHash(key));
  }

  async function attemptLogin(
    presented: string,
    key: string,
    opts: { token?: string; now?: number } = {},
  ): Promise<LoginResult> {
    const token = (opts.token ?? operatorToken()).trim();
    const now = opts.now ?? Date.now();
    if (!operatorTokenConfigured(token)) return { ok: false, reason: "not-configured" };
    const wait = await isLocked(key, now);
    if (wait > 0) return { ok: false, reason: "locked", retryAfterMs: wait };
    if (!safeEqual(presented.trim(), token)) {
      await noteFailure(key, now);
      return { ok: false, reason: "bad-token" };
    }
    await clearFailures(key);
    return { ok: true, sessionId: await createSession(now, token) };
  }

  return {
    createSession,
    createAccountSession,
    lookupSession,
    revokeSession,
    revokeUserSessions,
    isLocked,
    noteFailure,
    clearFailures,
    attemptLogin,
  };
}

const runtime = createAuthRuntime(postgresAuthStateStore());

export const createSession = runtime.createSession;
export const createAccountSession = runtime.createAccountSession;
export const lookupSession = runtime.lookupSession;
export const revokeSession = runtime.revokeSession;
export const revokeUserSessions = runtime.revokeUserSessions;
export const isLocked = runtime.isLocked;
export const noteFailure = runtime.noteFailure;
export const clearFailures = runtime.clearFailures;
export const attemptLogin = runtime.attemptLogin;
