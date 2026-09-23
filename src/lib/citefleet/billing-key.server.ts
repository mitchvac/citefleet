import { billingEnabled } from "./botcentral.ts";
import { cleanPrefix } from "./topup.ts";
import { logActivity } from "./store.ts";
import type { WorkspaceHandle } from "./workspace-handle.ts";

/** Verify possession transiently; only the public prefix and verification time persist. */
export async function setBillingKey(ws: WorkspaceHandle, siteId: string, raw: string) {
  if (typeof raw !== "string") throw new Error("Enter the full BotCentral secret key.");
  const value = raw.trim();
  if (!(await ws.get()).sites.some((site) => site.id === siteId)) throw new Error("Site not found");
  let keyPrefix = "";
  if (value) {
    if (!/^bc_live_[a-f0-9]{48}$/.test(value))
      throw new Error("Enter the full BotCentral secret key, not its public prefix.");
    const token = process.env.BOTCENTRAL_SERVICE_TOKEN?.trim() || "";
    if (token.length < 16) throw new Error("Billing key verification is unavailable.");
    const origin = (process.env.BOTCENTRAL_URL || "https://botcentral.org").replace(/\/$/, "");
    let verified = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`${origin}/internal/keys/verify`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ keySecret: value }),
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 422) throw new Error("invalid-key");
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
          continue;
        const body: unknown = await response.json();
        const prefix =
          body && typeof body === "object" && "keyPrefix" in body ? body.keyPrefix : undefined;
        if (typeof prefix === "string" && cleanPrefix(prefix) === value.slice(0, 16)) {
          keyPrefix = prefix;
          verified = true;
          break;
        }
      } catch (error) {
        if (error instanceof Error && error.message === "invalid-key")
          throw new Error(
            "BotCentral could not verify this key. Check the full key or create a new one.",
          );
        // Retry a read-only verification once; no provider response or secret enters an error.
      }
    }
    if (!verified) throw new Error("Billing key verification is unavailable. Please retry.");
  }
  const billing = billingEnabled();
  const at = new Date().toISOString();
  await ws.mutate((store) => {
    const site = store.sites.find((candidate) => candidate.id === siteId);
    if (!site) throw new Error("Site not found");
    site.billing = keyPrefix ? { keyPrefix, setAt: at, verifiedAt: at } : undefined;
    logActivity(store, {
      actor: "Operator",
      kind: "control",
      siteId,
      message: keyPrefix
        ? `Verified BotCentral API key ${keyPrefix} for ${site.domain}.`
        : `Cleared the BotCentral API key for ${site.domain}. A verified key is required when billing is on.`,
    });
  });
  return { keyPrefix, billing };
}
