import {
  clearFailures,
  isLocked,
  noteFailure,
  createSession,
  sessionCookie,
} from "./operator-core.ts";
import { consumeReset, requestReset } from "./password-reset.server.ts";

/**
 * HTTP for the password-reset flow: POST /api/forgot and POST /api/reset.
 *
 * The shape mirrors operator.server.ts — 303 redirects with a `?error=` code
 * rather than a JSON API, because these are plain form posts from /login and
 * /reset and must work without JavaScript.
 */

function isSecure(request: Request): boolean {
  if (request.headers.get("x-forwarded-proto") === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "unknown";
}

function redirect(to: string, retryAfterMs?: number): Response {
  const headers: Record<string, string> = { Location: to };
  if (retryAfterMs) headers["Retry-After"] = String(Math.ceil(retryAfterMs / 1000));
  return new Response(null, { status: 303, headers });
}

async function readForm(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : ""]),
    );
  }
  const form = await request.formData().catch(() => null);
  const out: Record<string, string> = {};
  for (const [k, v] of form?.entries() ?? []) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * POST /api/forgot — always answers "check your inbox".
 *
 * Every branch below returns the SAME redirect. An unknown address, an address
 * that is not on the invite list, and a real account all look identical from
 * outside. This console is invite-only, so whether an address is a member is
 * exactly the fact worth protecting, and `handleLogin` already refuses to leak
 * it — a reset form that answered honestly would hand it straight back.
 *
 * The rate limiter is shared with sign-in on purpose: it is the same per-IP
 * budget, so hammering this endpoint also locks the login path rather than
 * giving an attacker a fresh allowance.
 */
export async function handleForgot(request: Request): Promise<Response> {
  const fields = await readForm(request);
  const key = clientKey(request);
  const wait = isLocked(key);
  if (wait > 0) return redirect("/login?error=locked", wait);

  const email = (fields.email || "").trim();
  if (!email.includes("@")) {
    noteFailure(key);
    // Still the generic answer: a malformed address is not worth its own line
    // and distinguishing it would start the oracle over again.
    return redirect("/login?sent=1");
  }

  const outcome = await requestReset(email, key);
  if (outcome.sent) {
    clearFailures(key);
  } else {
    // Counted against the same budget so probing for members is not free.
    noteFailure(key);
    if (outcome.reason === "mail-unconfigured" || outcome.reason === "send-failed") {
      // The one honest exception: this is OUR failure, not a statement about
      // the address, so it reveals nothing and hiding it would strand the user
      // in front of an inbox that will never receive anything.
      return redirect("/login?error=mail-unavailable");
    }
  }
  return redirect("/login?sent=1");
}

/**
 * POST /api/reset — spend a token and set the new password.
 *
 * On success the user is signed straight in. They have just proven control of
 * the mailbox and chosen a password; making them retype it immediately adds no
 * security and is where people give up.
 */
export async function handleReset(request: Request): Promise<Response> {
  const fields = await readForm(request);
  const key = clientKey(request);
  const wait = isLocked(key);
  if (wait > 0) return redirect("/login?error=locked", wait);

  const token = fields.token || "";
  const password = fields.password || "";
  const back = `/reset?token=${encodeURIComponent(token)}`;

  const result = await consumeReset(token, password);
  if (!result.ok) {
    noteFailure(key);
    // A weak password is the user's own input and keeps them on the form; a
    // dead token sends them back to sign-in, because there is nothing to retry.
    if (result.reason === "weak-password") return redirect(`${back}&error=weak-password`);
    return redirect(`/login?error=reset-${result.reason}`);
  }

  clearFailures(key);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": sessionCookie(createSession(), { secure: isSecure(request) }),
    },
  });
}

/** Whether a reset can even be offered — /login hides the link when it cannot. */
export function resetAvailable(): boolean {
  return Boolean(process.env.CITEFLEET_SMTP_USER && process.env.CITEFLEET_SMTP_PASSWORD);
}
