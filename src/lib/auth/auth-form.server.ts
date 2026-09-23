/** Reject browser login CSRF before any account/session mutation. */
export function trustedAuthPost(
  request: Request,
  publicUrl = process.env.CITEFLEET_PUBLIC_URL,
): boolean {
  if (request.method !== "POST") return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  // Non-browser credential clients omit both headers. Browsers must supply a
  // concrete Origin; opaque/null origins never establish an account session.
  if (!origin) return !site;
  try {
    return new URL(origin).origin === new URL(publicUrl || request.url).origin;
  } catch {
    return false;
  }
}
export function rejectedAuthPost(): Response {
  return new Response("Sign-in request rejected. Reload the sign-in page and try again.", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
