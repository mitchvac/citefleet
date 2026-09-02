import type { StoreShape } from "./types";

/**
 * What may leave the server. The console is public in v1
 * (VITE_AUTH_ENABLED=false), so every copy of the store handed to a browser
 * goes through here: the GitHub token becomes "set" and each property's
 * webhook secret becomes "". Secrets are only ever revealed by the server fn
 * that just minted them.
 */
export function maskStoreSecrets(store: StoreShape): StoreShape {
  const clone = structuredClone(store);
  if (clone.workspace.githubToken) clone.workspace.githubToken = "set";
  for (const site of clone.sites) {
    if (site.webhook) site.webhook = { ...site.webhook, secret: "" };
  }
  return clone;
}
