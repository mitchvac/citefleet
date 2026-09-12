import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Operator gate, pure part (no request context or storage; unit-tested).
 *
 * CiteFleet is a single-operator console. One shared secret
 * (CITEFLEET_OPERATOR_TOKEN, env) is exchanged at /login for a random session
 * id sent back as an httpOnly cookie. The cookie never holds the token. Durable
 * session and rate-limit storage lives in auth-state.server.ts.
 */

export const OPERATOR_COOKIE = "citefleet_op";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 60_000;
export const FAILURE_TTL_MS = 60 * 60 * 1000;
const MIN_TOKEN_LENGTH = 32;

/**
 * Who a session belongs to. Still optional on the session record, because the
 * operator TOKEN path is a break-glass credential with no account behind it —
 * that session is genuinely anonymous and must stay that way rather than being
 * attributed to someone.
 *
 * `id` is REQUIRED here, and it is `citefleet_users.id`. It used to be absent:
 * `verifyUser` and `upsertOAuthUser` both return the row id and every caller
 * threw it away, so a signed-in request could be attributed to an email but
 * never joined to anything. An email is not an identity key — it changes, and
 * it cannot carry a foreign key to a workspace membership. Making it optional
 * would push a null branch into every consumer, and those branches diverge.
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  imageUrl?: string | null;
};

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

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashOperatorToken(token: string): string {
  return createHash("sha256").update(`operator:${token}`).digest("hex");
}

/** The database sees an HMAC, never a raw client IP or forwarding header. */
export function hashClientKey(clientKey: string, secret: string): string {
  if (secret.trim().length < MIN_TOKEN_LENGTH) {
    throw new Error("auth-state secret must be at least 32 characters");
  }
  return createHmac("sha256", secret).update(`client:${clientKey}`).digest("hex");
}

export type LoginResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "not-configured" | "locked" | "bad-token"; retryAfterMs?: number };

/** Cookie attributes for the session id (never the token). */
export function sessionCookie(
  id: string,
  opts: { secure: boolean; maxAgeSeconds?: number },
): string {
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
