import { randomBytes } from "node:crypto";
import { isAllowedEmail } from "./operator-allowlist.ts";
import type { SessionUser } from "./operator-core.ts";
import {
  createSession,
  readCookie,
  sessionCookie,
} from "./operator-core.ts";

const STATE_COOKIE = "citefleet_oauth";
const STATE_TTL = 10 * 60;

type Provider = "google" | "github";

/**
 * Only an https URL is ever stored or rendered. A provider response is remote
 * input: anything else — http, data:, javascript: — must not reach an <img src>,
 * and an http image would break the page's mixed-content posture anyway.
 */
function httpsImage(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    return new URL(raw).protocol === "https:" ? raw : undefined;
  } catch {
    return undefined;
  }
}

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function oauthConfigured(): { google: boolean; github: boolean } {
  return {
    google: Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")),
    github: Boolean(env("GITHUB_OAUTH_CLIENT_ID") && env("GITHUB_OAUTH_CLIENT_SECRET")),
  };
}

function publicOrigin(request: Request): string {
  const fromEnv = env("CITEFLEET_PUBLIC_URL").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "citefleet.app";
  return `${proto}://${host}`;
}

function isSecure(request: Request): boolean {
  return publicOrigin(request).startsWith("https:");
}

function stateCookie(value: string, request: Request, maxAge = STATE_TTL): string {
  const parts = [
    `${STATE_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (isSecure(request)) parts.push("Secure");
  return parts.join("; ");
}

function redirect(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { Location: location, ...extra } });
}

function loginError(reason: string): Response {
  return redirect(`/login?error=${reason}`);
}

function signedIn(
  request: Request,
  user?: SessionUser,
  extraCookies: string[] = [],
): Response {
  const session = sessionCookie(createSession(Date.now(), user ?? undefined), {
    secure: isSecure(request),
  });
  const cookies = [session, stateCookie("", request, 0), ...extraCookies];
  return new Response(null, {
    status: 303,
    headers: [
      ["Location", "/"],
      ...cookies.map((c) => ["Set-Cookie", c] as [string, string]),
    ],
  });
}

export function startOAuth(provider: Provider, request: Request): Response {
  const ready = oauthConfigured();
  if (provider === "google" && !ready.google) return loginError("google-not-configured");
  if (provider === "github" && !ready.github) return loginError("github-not-configured");

  const state = randomBytes(24).toString("hex");
  const origin = publicOrigin(request);
  let authorize: string;
  if (provider === "google") {
    const params = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: `${origin}/api/oauth/google-callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    authorize = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  } else {
    const params = new URLSearchParams({
      client_id: env("GITHUB_OAUTH_CLIENT_ID"),
      redirect_uri: `${origin}/api/oauth/github-callback`,
      scope: "read:user user:email repo",
      state,
    });
    authorize = `https://github.com/login/oauth/authorize?${params}`;
  }
  return redirect(authorize, { "Set-Cookie": stateCookie(`${provider}:${state}`, request) });
}

export async function finishOAuth(provider: Provider, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const expected = readCookie(request.headers.get("cookie"), STATE_COOKIE) || "";
  if (!code || !state || expected !== `${provider}:${state}`) return loginError("oauth-denied");

  try {
    if (provider === "google") {
      const profile = await googleProfile(code, publicOrigin(request));
      if (!profile.verified) return loginError("email-unverified");
      if (!isAllowedEmail(profile.email)) return loginError("not-allowed");
      const { upsertOAuthUser } = await import("./users.server");
      await upsertOAuthUser({
        provider: "google",
        providerId: profile.id,
        email: profile.email,
        name: profile.name,
        image: profile.image,
      });
      return signedIn(request, {
        email: profile.email,
        name: profile.name,
        imageUrl: profile.image ?? null,
      });
    }
    const profile = await githubProfile(code, publicOrigin(request));
    // Checked BEFORE the workspace GitHub token is touched.
    if (!profile.verified) return loginError("email-unverified");
    if (!isAllowedEmail(profile.email)) return loginError("not-allowed");
    const { upsertOAuthUser } = await import("./users.server");
    await upsertOAuthUser({
      provider: "github",
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      githubToken: profile.token,
      image: profile.image,
    });
    if (profile.token) {
      const { setGithubToken } = await import("@/lib/citefleet/github");
      await setGithubToken(profile.token);
    }
    return signedIn(request, {
      email: profile.email,
      name: profile.name,
      imageUrl: profile.image ?? null,
    });
  } catch {
    return loginError("oauth-failed");
  }
}

async function googleProfile(code: string, origin: string): Promise<{ id: string; email: string; name: string; verified: boolean; image?: string }> {
  const body = new URLSearchParams({
    code,
    client_id: env("GOOGLE_CLIENT_ID"),
    client_secret: env("GOOGLE_CLIENT_SECRET"),
    redirect_uri: `${origin}/api/oauth/google-callback`,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) throw new Error("google token");
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("google token");
  const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!me.ok) throw new Error("google userinfo");
  const profile = (await me.json()) as { id?: string; email?: string; name?: string; verified_email?: boolean; picture?: string };
  if (!profile.id || !profile.email) throw new Error("google profile");
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name || profile.email,
    verified: profile.verified_email === true,
    image: httpsImage(profile.picture),
  };
}

async function githubProfile(
  code: string,
  origin: string,
): Promise<{ id: string; email: string; name: string; token: string; verified: boolean; image?: string }> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("GITHUB_OAUTH_CLIENT_ID"),
      client_secret: env("GITHUB_OAUTH_CLIENT_SECRET"),
      code,
      redirect_uri: `${origin}/api/oauth/github-callback`,
    }),
  });
  if (!tokenRes.ok) throw new Error("github token");
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error("github token");
  const token = tokenJson.access_token;
  const me = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "citefleet" },
  });
  if (!me.ok) throw new Error("github user");
  const user = (await me.json()) as { id?: number; login?: string; name?: string; email?: string | null; avatar_url?: string };
  // Only a VERIFIED address may match the allow-list: the public profile email
  // and the noreply fallback are not proof of anything.
  let email = "";
  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "citefleet" },
  });
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{ email: string; primary?: boolean; verified?: boolean }>;
    email = emails.find((e) => e.primary && e.verified)?.email || emails.find((e) => e.verified)?.email || "";
  }
  if (!user.id) throw new Error("github profile");
  const verified = Boolean(email);
  if (!email) email = `${user.login || user.id}@users.noreply.github.com`;
  return {
    id: String(user.id),
    verified,
    email,
    name: user.name || user.login || email,
    token,
    image: httpsImage(user.avatar_url),
  };
}


