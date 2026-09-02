import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Operator gate, pure part (no request context; unit-tested).
 *
 * CiteFleet is a single-operator console. One shared secret
 * (CITEFLEET_OPERATOR_TOKEN, env) is exchanged at /login for a random session
 * id kept in memory and sent back as an httpOnly cookie. The cookie never holds
 * the token. Sessions die with the process (the operator signs in again) and
 * can be revoked by sign-out or by rotating the env token.
 */

export const OPERATOR_COOKIE = "citefleet_op";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 60_000;
const MIN_TOKEN_LENGTH = 32;

const sessions = new Map<string, { createdAt: number; expiresAt: number }>();
const failures = new Map<string, { count: number; lockedUntil: number }>();

export function operatorTokenConfigured(token = process.env.CITEFLEET_OPERATOR_TOKEN): boolean {
  return typeof token === "string" && token.trim().length >= MIN_TOKEN_LENGTH;
}

/** Constant-time equality on HMAC digests, so length differences leak nothing. */
export function safeEqual(a: string, b: string): boolean {
  const key = "citefleet-operator-compare";
  const da = createHmac("sha256", key).update(a).digest();
  const db = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(da, db);
}

export type LoginResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "not-configured" | "locked" | "bad-token"; retryAfterMs?: number };

/** Verify a presented token for a client (keyed by IP) with lockout after repeated failures. */
export function attemptLogin(
  presented: string,
  clientKey: string,
  opts: { token?: string; now?: number } = {},
): LoginResult {
  const token = (opts.token ?? process.env.CITEFLEET_OPERATOR_TOKEN ?? "").trim();
  const now = opts.now ?? Date.now();
  if (!operatorTokenConfigured(token)) return { ok: false, reason: "not-configured" };
  const f = failures.get(clientKey);
  if (f && f.lockedUntil > now) return { ok: false, reason: "locked", retryAfterMs: f.lockedUntil - now };
  if (!safeEqual(presented.trim(), token)) {
    const count = (f && f.lockedUntil <= now && f.count >= MAX_FAILURES ? 0 : (f?.count ?? 0)) + 1;
    failures.set(clientKey, { count, lockedUntil: count >= MAX_FAILURES ? now + LOCKOUT_MS : 0 });
    return { ok: false, reason: "bad-token" };
  }
  failures.delete(clientKey);
  return { ok: true, sessionId: createSession(now) };
}

export function createSession(now = Date.now()): string {
  const id = randomBytes(32).toString("hex");
  sessions.set(id, { createdAt: now, expiresAt: now + SESSION_TTL_MS });
  return id;
}

export function hasSession(id: string | undefined, now = Date.now()): boolean {
  if (!id) return false;
  const s = sessions.get(id);
  if (!s) return false;
  if (s.expiresAt <= now) {
    sessions.delete(id);
    return false;
  }
  return true;
}

export function revokeSession(id: string | undefined): void {
  if (id) sessions.delete(id);
}

/** Test/ops helper: forget every session and lockout. */
export function resetOperatorState(): void {
  sessions.clear();
  failures.clear();
}

export function sessionCount(): number {
  return sessions.size;
}

/** Cookie attributes for the session id (never the token). */
export function sessionCookie(id: string, opts: { secure: boolean; maxAgeSeconds?: number }): string {
  const parts = [
    `${OPERATOR_COOKIE}=${id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${opts.maxAgeSeconds ?? Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedCookie(opts: { secure: boolean }): string {
  return sessionCookie("", { secure: opts.secure, maxAgeSeconds: 0 });
}

/** Parse one cookie value out of a Cookie header. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}
