/**
 * What /login shows for each `?error=` code the server redirects with.
 * Browser-safe (login.tsx renders this); no node: imports.
 *
 * Every code emitted by operator.server.ts (handleLogin / handleSignup),
 * operator-core.ts (attemptLogin reasons), users.server.ts (createUser reasons)
 * and oauth.server.ts must have an entry — login-messages.test.ts scans those
 * files and fails when one is missing, so a refused sign-in never falls back to
 * the generic line (seen 2026-09-03: `not-allowed` and `email-unverified`
 * rendered "Sign-in failed." on citefleet.app).
 */
export const LOGIN_MESSAGES: Record<string, string> = {
  "bad-credentials": "That email or password is not right.",
  exists: "An account with that email already exists. Sign in instead.",
  invalid: "Use a real email and a password of at least 8 characters.",
  "bad-token": "That sign-in was not accepted.",
  locked: "Too many attempts. Wait a minute, then try again.",
  "not-configured": "This server is not ready for sign-in yet.",
  "not-allowed":
    "That email is not on this workspace's invite list. Ask the CiteFleet operator to add it, then try again.",
  "email-unverified":
    "That provider account has no verified email address. Verify the email with Google or GitHub, or sign in with email and password.",
  "google-not-configured": "Google sign-in is not enabled on this server yet.",
  "github-not-configured": "GitHub sign-in is not enabled on this server yet.",
  "oauth-denied": "Sign-in was cancelled or expired. Try again.",
  "oauth-failed": "That provider could not complete sign-in. Try email, or try again.",
};

export const GENERIC_LOGIN_MESSAGE = "Sign-in failed.";

/** The line to show for an `?error=` code; unknown codes get the generic line. */
export function loginMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return LOGIN_MESSAGES[code] ?? GENERIC_LOGIN_MESSAGE;
}
