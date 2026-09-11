// Server-only. How an UNAUTHENTICATED webhook finds the tenant it belongs to.
//
// The three inbound hooks (GitHub push, generic deploy, BotCentral catalog)
// carry no session. They are authenticated by an HMAC over the body, and the
// secret that verifies it lives on the site — so the tenant must be resolved
// from the payload before anything can be checked.
//
// Two rules hold here, and they pull in opposite directions:
//
//  1. NEVER default to a tenant. "Not found, so use the root workspace" would
//     route one customer's deploy hook into another customer's property the
//     moment a second workspace exists.
//  2. Never let the answer reveal whether a domain or repo is attached. The
//     handlers already verify against a DECOY_SECRET when nothing matches, so an
//     unknown target costs the same work and returns the same 401 as a bad
//     signature. That property must survive tenant resolution.
//
// Both are satisfied by resolving to an EMPTY store when no workspace matches:
// the handler runs its normal "no such site" path, burns the decoy, and answers
// 401 — with no tenant touched and nothing disclosed.

import { seedStore } from "./seed.ts";
import { handleFor, type WorkspaceHandle } from "./workspace-handle.ts";
import { ROOT_WORKSPACE_ID } from "./workspace-id.ts";
import {
  workspaceForDomain,
  workspaceForRepo,
} from "./workspace-registry.server.ts";
import type { StoreShape } from "./types";

/** Exactly `HookDeps` from webhook.ts, which these are handed to. */
export interface HookTenantDeps {
  getStore: () => Promise<StoreShape>;
  mutateStore: (fn: (store: StoreShape) => void) => Promise<unknown>;
  onCheck: (siteId: string, reason: string) => void;
}

/** What a hook sees when its target belongs to no workspace: nothing. */
function emptyDeps(): HookTenantDeps {
  // Seeded with the root id purely so the shape is valid. It is never persisted:
  // `mutateStore` is a no-op here, so a hook for an unknown target cannot write,
  // and `onCheck` does nothing, so it cannot start a listing run either.
  const empty = seedStore(ROOT_WORKSPACE_ID);
  return {
    getStore: async () => empty,
    mutateStore: async (fn) => fn(empty),
    onCheck: () => {},
  };
}

/**
 * Resolve the workspace for an inbound hook and wrap it in the `HookDeps` shape
 * `webhook.ts` already expects — which is why none of those handlers needed a
 * signature change for tenancy.
 */
export async function hookDeps(
  target: { domain?: string; repo?: string },
  onCheck?: (ws: WorkspaceHandle, siteId: string, reason: string) => void,
): Promise<HookTenantDeps> {
  const ws = target.repo
    ? await workspaceForRepo(target.repo)
    : target.domain
      ? await workspaceForDomain(target.domain)
      : null;
  if (!ws) return emptyDeps();
  return {
    getStore: () => ws.get(),
    mutateStore: (fn) => ws.mutate(fn),
    onCheck: onCheck ? (siteId, reason) => onCheck(ws, siteId, reason) : () => {},
  };
}

/** The handle itself, for a caller that needs more than the deps shape. */
export { handleFor };
