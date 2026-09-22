/** Keep the exact website host; DNS-proof normalization intentionally strips www. */
export function exactHostingerDomain(domain: string): string {
  if (domain !== domain.trim() || !/^[a-z0-9.-]+$/i.test(domain))
    throw new Error("Hostinger installation requires an exact website hostname.");
  const host = domain.toLowerCase();
  const url = new URL(`https://${host}`);
  if (url.hostname !== host || host.startsWith(".") || host.endsWith(".") || host.includes(".."))
    throw new Error("Hostinger installation requires an exact website hostname.");
  return host;
}
