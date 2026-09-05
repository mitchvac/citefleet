/**
 * Password-reset rules, kept pure so every one of them is provable without a
 * database or a mail server. The server half lives in `password-reset.server.ts`.
 *
 * Browser-safe: no `node:` import, so a route or component may import the types
 * and the link builder (see `client-bundle-guard.test.ts`).
 */

/** How long a link stays good. Short: the mailbox is the weak link, not us. */
export const RESET_TTL_MS = 30 * 60 * 1000;

/** Matches `createUser`, which refuses anything shorter. */
export const MIN_PASSWORD_LENGTH = 8;

export interface ResetRow {
  expiresAt: string;
  usedAt: string | null;
}

export type ResetRejection = "expired" | "used" | "weak-password" | "not-found";

/**
 * Why a token cannot be spent, or null if it can.
 *
 * Order matters: "used" outranks "expired" so a link someone already spent
 * reads as spent even after it ages out, which is the truthful account of what
 * happened and stops a user hunting for a clock problem.
 */
export function resetRejection(
  row: ResetRow | null,
  now: number = Date.now(),
): ResetRejection | null {
  if (!row) return "not-found";
  if (row.usedAt) return "used";
  if (Date.parse(row.expiresAt) <= now) return "expired";
  return null;
}

export function passwordAcceptable(password: string): boolean {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * The link that goes in the email. Built from the configured public URL rather
 * than the request's Host header — trusting Host here would let anyone who can
 * reach the server mint a reset link pointing at a domain they control.
 */
export function resetLink(baseUrl: string, token: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  return `${origin}/reset?token=${encodeURIComponent(token)}`;
}

/**
 * The message body. Plain text, no tracking, and it names the expiry in the
 * words the user will need if the link has already gone stale by the time they
 * open it.
 */
export function resetEmailBody(link: string, ttlMs: number = RESET_TTL_MS): string {
  const minutes = Math.round(ttlMs / 60_000);
  return [
    "Someone asked to reset the password for this CiteFleet account.",
    "",
    "Open this link to choose a new one:",
    link,
    "",
    `The link works once and expires in ${minutes} minutes.`,
    "",
    "If this wasn't you, nothing has changed and you can ignore this email.",
    "Your existing password still works until a new one is set.",
  ].join("\n");
}

export const RESET_SUBJECT = "Reset your CiteFleet password";
