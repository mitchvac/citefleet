export type OAuthProvider = "google" | "github";

export type OAuthIntent =
  { kind: "sign-in" } | { kind: "github-connect"; siteId: string; userId: string };

const SITE_ID = /^site-[a-f0-9]{8}$/;
const USER_ID = /^[a-f0-9]{32}$/;

/** Value stored in the short-lived, httpOnly OAuth state cookie. */
export function oauthStateValue(
  provider: OAuthProvider,
  state: string,
  intent: OAuthIntent = { kind: "sign-in" },
): string {
  if (intent.kind === "github-connect") {
    if (provider !== "github" || !SITE_ID.test(intent.siteId) || !USER_ID.test(intent.userId)) {
      throw new Error("Invalid GitHub connection target.");
    }
    return `github-connect:${intent.siteId}:${intent.userId}:${state}`;
  }
  return `${provider}:${state}`;
}

/** Exact state comparison plus recovery of the action the customer approved. */
export function readOAuthIntent(
  provider: OAuthProvider,
  state: string,
  cookieValue: string,
): OAuthIntent | null {
  if (!state || !cookieValue) return null;
  if (cookieValue === `${provider}:${state}`) return { kind: "sign-in" };
  if (provider !== "github") return null;

  const match = cookieValue.match(/^github-connect:(site-[a-f0-9]{8}):([a-f0-9]{32}):([a-f0-9]+)$/);
  if (!match || match[3] !== state) return null;
  return { kind: "github-connect", siteId: match[1], userId: match[2] };
}

export function requestedGithubSite(request: Request): string | null {
  const value = new URL(request.url).searchParams.get("connect") || "";
  return SITE_ID.test(value) ? value : null;
}
