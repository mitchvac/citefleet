import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { isAllowedEmail } from "./operator-allowlist.ts";
import {
  RESET_SUBJECT,
  RESET_TTL_MS,
  passwordAcceptable,
  resetEmailBody,
  resetLink,
  resetRejection,
  type ResetRejection,
} from "./password-reset.ts";
import { sendMail, mailConfigured } from "@/lib/mail/smtp";

/**
 * Request and consume password resets.
 *
 * Two rules run through everything here:
 *
 * 1. NO ORACLE. `requestReset` returns the same thing whether the address is
 *    registered, allow-listed, or entirely unknown. `handleLogin` already
 *    refuses to confirm whether an address exists; a reset form that answers
 *    "no such account" would hand back exactly what that protects, and this
 *    console is invite-only, so the member list is the thing worth hiding.
 *
 * 2. THE PLAINTEXT TOKEN EXISTS IN ONE PLACE — the email. We store its SHA-256.
 *    A leaked row, backup, or log line yields nothing usable.
 */

/** SHA-256 is right here and bcrypt/scrypt is not: the token is 256 bits of
 * randomness, so there is no dictionary to slow down, and a reset check must
 * stay cheap enough that it cannot itself be a DoS lever. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function publicUrl(): string {
  return (process.env.CITEFLEET_PUBLIC_URL || "https://citefleet.app").trim();
}

export type RequestOutcome =
  | { sent: true }
  | { sent: false; reason: "no-account" | "not-allowed" | "mail-unconfigured" | "send-failed" };

/**
 * Create a reset and email it. The CALLER MUST NOT vary its response on this
 * result — it is returned for the audit log and for tests, never for the wire.
 */
export async function requestReset(
  emailRaw: string,
  ip: string | null,
): Promise<RequestOutcome> {
  const email = emailRaw.trim().toLowerCase();
  if (!mailConfigured()) return { sent: false, reason: "mail-unconfigured" };
  if (!isAllowedEmail(email)) return { sent: false, reason: "not-allowed" };

  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    "SELECT id FROM citefleet_users WHERE email = $1",
    [email],
  );
  const user = rows[0];
  if (!user) return { sent: false, reason: "no-account" };

  // Any earlier unspent link is retired first. Two live links for one account
  // means a stolen older email still works after the user has quietly re-run
  // the flow, which is the opposite of what re-running it implies.
  await sql.query(
    "UPDATE citefleet_password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    [user.id],
  );

  const token = newToken();
  await sql.query(
    `INSERT INTO citefleet_password_resets (id, user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      randomBytes(16).toString("hex"),
      user.id,
      hashToken(token),
      new Date(Date.now() + RESET_TTL_MS).toISOString(),
      ip,
    ],
  );

  try {
    await sendMail({
      to: email,
      subject: RESET_SUBJECT,
      text: resetEmailBody(resetLink(publicUrl(), token), RESET_TTL_MS),
    });
  } catch (err) {
    // Burn the token: a link we could not deliver must not stay live.
    await sql.query(
      "UPDATE citefleet_password_resets SET used_at = now() WHERE token_hash = $1",
      [hashToken(token)],
    );
    console.error("[citefleet] reset email failed", err instanceof Error ? err.message : err);
    return { sent: false, reason: "send-failed" };
  }
  return { sent: true };
}

export type ConsumeResult =
  | { ok: true; email: string }
  | { ok: false; reason: ResetRejection };

/**
 * Spend a token and set the new password. The UPDATE that marks it spent is
 * guarded by `used_at IS NULL`, so of two requests racing the same link exactly
 * one wins — checking first and writing after would let both through.
 */
export async function consumeReset(
  token: string,
  password: string,
): Promise<ConsumeResult> {
  if (!passwordAcceptable(password)) return { ok: false, reason: "weak-password" };
  if (!token) return { ok: false, reason: "not-found" };

  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>(
    `SELECT id, user_id, expires_at, used_at
       FROM citefleet_password_resets WHERE token_hash = $1`,
    [hashToken(token)],
  );
  const row = rows[0];
  const rejection = resetRejection(
    row ? { expiresAt: row.expires_at, usedAt: row.used_at } : null,
  );
  if (rejection) return { ok: false, reason: rejection };

  const claimed = await sql.query<{ id: string }>(
    `UPDATE citefleet_password_resets SET used_at = now()
      WHERE id = $1 AND used_at IS NULL
      RETURNING id`,
    [row.id],
  );
  if (!claimed[0]) return { ok: false, reason: "used" };

  const { setPassword } = await import("./users.server");
  const email = await setPassword(row.user_id, password);
  if (!email) return { ok: false, reason: "not-found" };
  return { ok: true, email };
}

/** Housekeeping: spent and expired rows have no further use. */
export async function pruneResets(): Promise<number> {
  const sql = await getSql();
  const gone = await sql.query<{ id: string }>(
    `DELETE FROM citefleet_password_resets
      WHERE expires_at < now() - interval '7 days' OR used_at < now() - interval '7 days'
      RETURNING id`,
  );
  return gone.length;
}
