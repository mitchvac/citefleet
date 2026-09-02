import { getRequest } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "./isolation.server";
import {
  OPERATOR_COOKIE,
  attemptLogin,
  clearedCookie,
  hasSession,
  operatorTokenConfigured,
  readCookie,
  revokeSession,
  sessionCookie,
} from "./operator-core.ts";

/**
 * Operator gate — server-only (`.server.ts`: imports the request context).
 * Every mutating server fn and the workspace load run behind requireOperator();
 * the public surface is /health, llms.txt, sitemap.xml, the training pages,
 * /login, and the two signed hook endpoints.
 */

export class OperatorUnauthorizedError extends Error {
  readonly status = 401;
  constructor(detail: string) {
    super(`Unauthorized: ${detail}`);
    this.name = "OperatorUnauthorizedError";
  }
}

function clientKey(request: Request): string {
  // nginx sets X-Real-IP to $remote_addr (not spoofable through the proxy). If
  // only X-Forwarded-For is present, its LAST hop is the one the proxy appended;
  // the first hop is client-controlled and must not key the lockout.
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

export function requireOperator(): void {
  if (!operatorTokenConfigured()) {
    throw new OperatorUnauthorizedError("operator token not configured on this server");
  }
  const request = getRequest();
  if (!request) throw new OperatorUnauthorizedError("no request context");
  const id = readCookie(request.headers.get("cookie"), OPERATOR_COOKIE);
  if (!hasSession(id)) throw new OperatorUnauthorizedError("operator sign-in required");
  assertSameSiteRequest();
}

/** POST /api/login (form or JSON {token}) → 303 to "/" with the session cookie, or 303 to /login?error=… */
export async function handleLogin(request: Request): Promise<Response> {
  let presented = "";
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    presented = typeof body.token === "string" ? body.token : "";
  } else {
    const form = await request.formData().catch(() => null);
    presented = typeof form?.get("token") === "string" ? (form!.get("token") as string) : "";
  }
  const result = attemptLogin(presented, clientKey(request));
  if (!result.ok) {
    const headers: Record<string, string> = { Location: `/login?error=${result.reason}` };
    if (result.retryAfterMs) headers["Retry-After"] = String(Math.ceil(result.retryAfterMs / 1000));
    return new Response(null, { status: 303, headers });
  }
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Set-Cookie": sessionCookie(result.sessionId, { secure: isSecure(request) }) },
  });
}

/** POST or GET /api/logout → revoke + clear cookie → 303 /login */
export function handleLogout(request: Request): Response {
  revokeSession(readCookie(request.headers.get("cookie"), OPERATOR_COOKIE));
  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": clearedCookie({ secure: isSecure(request) }) },
  });
}
