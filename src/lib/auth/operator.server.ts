import { getRequest } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "./isolation.server";
import { isAllowedEmail } from "./operator-allowlist.ts";
import { sessionUser, type SessionUser } from "./operator-core.ts";
import {
  OPERATOR_COOKIE,
  attemptLogin,
  clearFailures,
  clearedCookie,
  createSession,
  isLocked,
  noteFailure,
  hasSession,
  operatorTokenConfigured,
  readCookie,
  revokeSession,
  sessionCookie,
} from "./operator-core.ts";

export class OperatorUnauthorizedError extends Error {
  readonly status = 401;
  constructor(detail: string) {
    super(`Unauthorized: ${detail}`);
    this.name = "OperatorUnauthorizedError";
  }
}

function clientKey(request: Request): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "unknown";
}

function isSecure(request: Request): boolean {
  return request.url.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https";
}

function signedInResponse(request: Request, sessionId: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": sessionCookie(sessionId, { secure: isSecure(request) }) },
  });
}

function loginError(reason: string, retryAfterMs?: number): Response {
  const headers: Record<string, string> = { Location: `/login?error=${reason}` };
  if (retryAfterMs) headers["Retry-After"] = String(Math.ceil(retryAfterMs / 1000));
  return new Response(null, { status: 303, headers });
}

/**
 * The account behind the request's session, or null. Null is a normal answer,
 * not an error: the operator token path is a break-glass credential with no
 * account behind it, and the header simply shows nothing for it.
 */
export function currentSessionUser(request: Request): SessionUser | null {
  const id = readCookie(request.headers.get("cookie"), OPERATOR_COOKIE);
  return sessionUser(id);
}

export function requireOperator(): void {
  const request = getRequest();
  if (!request) throw new OperatorUnauthorizedError("no request context");
  const id = readCookie(request.headers.get("cookie"), OPERATOR_COOKIE);
  if (!hasSession(id)) throw new OperatorUnauthorizedError("sign-in required");
  assertSameSiteRequest();
}

async function readFields(request: Request): Promise<{
  token: string;
  email: string;
  password: string;
  name: string;
}> {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      token: typeof body.token === "string" ? body.token : "",
      email: typeof body.email === "string" ? body.email : "",
      password: typeof body.password === "string" ? body.password : "",
      name: typeof body.name === "string" ? body.name : "",
    };
  }
  const form = await request.formData().catch(() => null);
  return {
    token: typeof form?.get("token") === "string" ? (form!.get("token") as string) : "",
    email: typeof form?.get("email") === "string" ? (form!.get("email") as string) : "",
    password: typeof form?.get("password") === "string" ? (form!.get("password") as string) : "",
    name: typeof form?.get("name") === "string" ? (form!.get("name") as string) : "",
  };
}

/** POST /api/login — email/password for users, or the server token for ops. */
export async function handleLogin(request: Request): Promise<Response> {
  const fields = await readFields(request);
  if (fields.email && fields.password) {
    const key = clientKey(request);
    const wait = isLocked(key);
    if (wait > 0) return loginError("locked", wait);
    const { verifyUser } = await import("./users.server");
    // Invite-only console: every email takes the same path (DB lookup + scrypt,
    // burned when no hash exists) and the allow-list is applied to the result,
    // so neither the answer nor its timing says whether an address is listed
    // or registered.
    const user = await verifyUser(fields.email, fields.password);
    if (!user || !isAllowedEmail(fields.email)) {
      noteFailure(key);
      return loginError("bad-credentials");
    }
    clearFailures(key);
    return signedInResponse(
      request,
      createSession(Date.now(), { email: user.email, name: user.name, imageUrl: user.imageUrl }),
    );
  }
  const result = attemptLogin(fields.token, clientKey(request));
  if (!result.ok) return loginError(result.reason, result.retryAfterMs);
  return signedInResponse(request, result.sessionId);
}

/** POST /api/signup — create a user account and sign in. */
export async function handleSignup(request: Request): Promise<Response> {
  const fields = await readFields(request);
  // Invite-only: only allow-listed emails may create an account.
  if (!isAllowedEmail(fields.email)) return loginError("not-allowed");
  const { createUser } = await import("./users.server");
  const created = await createUser({
    email: fields.email,
    name: fields.name,
    password: fields.password,
  });
  if (!created.ok) return loginError(created.reason === "exists" ? "exists" : "invalid");
  return signedInResponse(request, createSession());
}

export function handleLogout(request: Request): Response {
  revokeSession(readCookie(request.headers.get("cookie"), OPERATOR_COOKIE));
  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": clearedCookie({ secure: isSecure(request) }) },
  });
}

export { operatorTokenConfigured };
