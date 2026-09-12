/**
 * Stable client key for every public auth endpoint.
 *
 * Production nginx overwrites X-Real-IP with its socket peer and appends that
 * same peer to X-Forwarded-For. Prefer the trusted value; when running without
 * nginx, use the last forwarding hop so a caller cannot prepend a fresh key.
 */
export function authClientKey(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const hops = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops[hops.length - 1] || "unknown";
}
