// The ONE way to read or write a tenant's workspace.
//
// This replaces the zero-argument `getStore()` / `mutateStore()` that every
// caller used while exactly one workspace existed. Those are deliberately GONE
// rather than kept as a convenience: while they exist, forgetting to name a
// tenant compiles and reads whichever workspace happened to be cached. Deleting
// them makes that mistake a type error instead of a data leak, and `tsc` becomes
// the proof that every call site was converted.
//
// Why a handle object and not a `getStore(id)` parameter: a handle is obtained
// in one place (`workspace-registry.server.ts`), always by resolving a
// principal, a proven domain or a proven repo. A bare id parameter is satisfied
// by any string in scope — `siteId`, `taskId`, `user.id` all compile.
//
// The cache and the isolation rule are driven through an injected
// `SnapshotStore` so both are tested without a database, the same way
// `webhook.ts` takes `HookDeps` and `smtp.ts` takes `SmtpIO`.

import { loadSnapshot, mergeSnapshot, saveSnapshot } from "./persist.ts";
import { seedStore } from "./seed.ts";
import { recalcScores } from "./store.ts";
import type { StoreShape } from "./types";
import type { WorkspaceId } from "./workspace-id.ts";

export interface WorkspaceHandle {
  readonly id: WorkspaceId;
  /** A private copy. Mutating it changes nothing — write through `mutate`. */
  get(): Promise<StoreShape>;
  /** Apply `fn` to the live workspace and persist the result. */
  mutate<T>(fn: (store: StoreShape) => T): Promise<T>;
}

/** Where snapshots come from and go. The real one is Postgres; tests pass a fake. */
export interface SnapshotStore {
  load(id: WorkspaceId): Promise<unknown | null>;
  save(id: WorkspaceId, store: StoreShape): Promise<void>;
}

/**
 * Workspaces this process is holding, keyed by tenant.
 *
 * The previous implementation was a single module-level `let cache` that was
 * never invalidated. Keyed by tenant it must also be BOUNDED: one entry per
 * signed-in customer would grow without limit until the process died of it.
 *
 * Eviction is safe because the cache never holds unsaved state — `mutate`
 * persists before it returns, so a dropped entry costs a re-read and nothing
 * else. Any change that defers the write breaks that invariant, and must not be
 * made without replacing this comment.
 */
export const MAX_CACHED_WORKSPACES = 64;

export interface Workspaces {
  handleFor(id: WorkspaceId): WorkspaceHandle;
  /** Drop every cached workspace. For tests, and for a process told state moved. */
  forget(): void;
  /** How many workspaces are currently held. Read by the cache test. */
  size(): number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createWorkspaces(io: SnapshotStore, max = MAX_CACHED_WORKSPACES): Workspaces {
  const loaded = new Map<WorkspaceId, StoreShape>();
  /** In-flight boots, so two concurrent requests for a cold tenant load it once. */
  const booting = new Map<WorkspaceId, Promise<StoreShape>>();

  function remember(id: WorkspaceId, store: StoreShape) {
    // Re-insert on touch so Map iteration order is least-recently-used first.
    loaded.delete(id);
    loaded.set(id, store);
    while (loaded.size > max) {
      const oldest = loaded.keys().next();
      if (oldest.done) break;
      loaded.delete(oldest.value);
    }
  }

  async function boot(id: WorkspaceId): Promise<StoreShape> {
    const seeded = seedStore(id);
    let store: StoreShape;
    try {
      const saved = await io.load(id);
      store = saved ? mergeSnapshot(seeded, saved) : seeded;
    } catch (err) {
      // A read failure must never be answered with another tenant's data. The
      // seed is empty, so the worst case is an empty workspace, never a leak.
      console.error(`[citefleet] snapshot load failed for ${id} — seeding`, err);
      store = seeded;
    }
    for (const site of store.sites) recalcScores(store, site.id);
    return store;
  }

  async function ensureLoaded(id: WorkspaceId): Promise<StoreShape> {
    const cached = loaded.get(id);
    if (cached) {
      remember(id, cached);
      return cached;
    }
    let inflight = booting.get(id);
    if (!inflight) {
      inflight = boot(id).finally(() => booting.delete(id));
      booting.set(id, inflight);
    }
    const store = await inflight;
    remember(id, store);
    return store;
  }

  return {
    handleFor(id: WorkspaceId): WorkspaceHandle {
      return {
        id,
        async get() {
          return clone(await ensureLoaded(id));
        },
        async mutate<T>(fn: (store: StoreShape) => T): Promise<T> {
          const store = await ensureLoaded(id);
          const result = fn(store);
          try {
            await io.save(id, store);
          } catch (err) {
            // The in-memory copy now disagrees with the database. Drop it so the
            // next read comes from Postgres rather than serving a change that
            // was never durably written.
            loaded.delete(id);
            console.error(`[citefleet] snapshot save failed for ${id}`, err);
            throw err;
          }
          return result;
        },
      };
    },
    forget() {
      loaded.clear();
      booting.clear();
    },
    size() {
      return loaded.size;
    },
  };
}

/** The process-wide instance, wired to Postgres. */
export const workspaces = createWorkspaces({
  load: (id) => loadSnapshot(id),
  save: (id, store) => saveSnapshot(id, store),
});

export function handleFor(id: WorkspaceId): WorkspaceHandle {
  return workspaces.handleFor(id);
}
