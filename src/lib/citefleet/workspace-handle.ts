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
  load(id: WorkspaceId): Promise<{ payload: unknown; version: number } | null>;
  /**
   * Write, but only if the row is still at `expected`. `null` means "create it,
   * it must not exist yet". Throws when the row moved — the caller re-reads and
   * re-applies rather than overwriting.
   */
  save(id: WorkspaceId, store: StoreShape, expected: number | null): Promise<number>;
}

/** How many times a mutation re-reads and re-applies before giving up. */
export const MAX_SAVE_ATTEMPTS = 3;

/**
 * Workspaces this process is holding, keyed by tenant.
 *
 * The previous implementation was a single module-level `let cache` that was
 * never invalidated. Keyed by tenant it must also be BOUNDED: one entry per
 * signed-in customer would grow without limit until the process died of it.
 *
 * Eviction is safe ONLY while no mutation is in flight. Between `fn(store)` and
 * the database accepting the write, the cached object holds a change Postgres
 * has not got yet — evict it there and a concurrent read re-boots from the old
 * row, and the write that already returned success is silently overwritten by
 * the next save. So entries are PINNED for the duration of a mutation, and
 * mutations on one workspace are SERIALISED: two overlapping `mutate` calls hand
 * `fn` the same object by reference, so a failed save cannot be un-applied while
 * another call is holding it. Both were reproduced before this was written.
 */
export const MAX_CACHED_WORKSPACES = 64;

/**
 * A cached workspace and the version it was read at.
 *
 * `version: null` means the row does not exist yet, so the first write must
 * INSERT. Carrying the version in the cache is what lets a write say "only if
 * nobody else has touched this since I read it".
 */
interface Entry {
  store: StoreShape;
  version: number | null;
}

export interface Workspaces {
  handleFor(id: WorkspaceId): WorkspaceHandle;
  /** Drop every cached workspace. For tests, and for a process told state moved. */
  forget(): void;
  /** How many workspaces are currently held. Read by the cache test. */
  size(): number;
  /** Outstanding mutation queues. Read by the leak test — it must drain to 0. */
  queueDepth(): number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Was this a version conflict, as opposed to the database being unreachable?
 * Matched by NAME rather than by `instanceof` so a fake store in a test can
 * signal one without importing persist.ts, and so a serialised error crossing a
 * module boundary still reads as one.
 */
function isConflict(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === "SnapshotConflictError";
}

export function createWorkspaces(io: SnapshotStore, max = MAX_CACHED_WORKSPACES): Workspaces {
  const loaded = new Map<WorkspaceId, Entry>();
  /** In-flight boots, so two concurrent requests for a cold tenant load it once. */
  const booting = new Map<WorkspaceId, Promise<Entry>>();
  /** Workspaces with a mutation in flight. Never evicted — see the note above. */
  const pinned = new Map<WorkspaceId, number>();
  /** One mutation at a time per workspace, so no two share a live store object. */
  const queues = new Map<WorkspaceId, Promise<unknown>>();

  function remember(id: WorkspaceId, store: Entry) {
    // Re-insert on touch so Map iteration order is least-recently-used first.
    loaded.delete(id);
    loaded.set(id, store);
    if (loaded.size <= max) return;
    for (const key of [...loaded.keys()]) {
      if (loaded.size <= max) break;
      // Never evict the entry we were just asked to remember. It is the newest,
      // so it sorts last — and when every older entry is pinned it is the only
      // candidate, which made `remember` delete its own argument and put the
      // cache back in exactly the stale-read state pinning exists to prevent.
      if (key === id) continue;
      // Skip a workspace that is mid-write. Dropping it there loses the write.
      if (pinned.get(key)) continue;
      loaded.delete(key);
    }
  }

  /** Run `task` after any mutation already queued for this workspace. */
  function serialise<T>(id: WorkspaceId, task: () => Promise<T>): Promise<T> {
    // Whatever is stored is already `.catch`-ed below, so it never rejects and
    // a rejection handler here would be unreachable.
    const previous = queues.get(id) ?? Promise.resolve();
    const next = previous.then(task);
    // Drop the queue entry once it drains, but only if nothing has queued behind
    // it. Without this the map retains one promise per tenant for the life of
    // the process — an unbounded per-tenant leak in the module whose whole point
    // is a bounded cache.
    const tail: Promise<void> = next.then(
      () => {
        if (queues.get(id) === tail) queues.delete(id);
      },
      () => {
        if (queues.get(id) === tail) queues.delete(id);
      },
    );
    queues.set(id, tail);
    return next;
  }

  async function boot(id: WorkspaceId): Promise<Entry> {
    const seeded = seedStore(id);
    let entry: Entry;
    try {
      const saved = await io.load(id);
      // `version: null` means "no row yet", which is what tells the first save
      // to INSERT rather than compare against a version that does not exist.
      entry = saved
        ? { store: mergeSnapshot(seeded, saved.payload), version: saved.version }
        : { store: seeded, version: null };
    } catch (err) {
      // A read failure must never be answered with another tenant's data. The
      // seed is empty, so the worst case is an empty workspace, never a leak.
      // Version stays null so nothing is overwritten on a guess.
      console.error(`[citefleet] snapshot load failed for ${id} — seeding`, err);
      entry = { store: seeded, version: null };
    }
    for (const site of entry.store.sites) recalcScores(entry.store, site.id);
    return entry;
  }

  async function ensureLoaded(id: WorkspaceId): Promise<Entry> {
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
    const entry = await inflight;
    remember(id, entry);
    return entry;
  }

  return {
    handleFor(id: WorkspaceId): WorkspaceHandle {
      return {
        id,
        async get() {
          return clone((await ensureLoaded(id)).store);
        },
        mutate<T>(fn: (store: StoreShape) => T): Promise<T> {
          return serialise(id, async () => {
            // Pinned BEFORE the load: `ensureLoaded` calls `remember`, which
            // evicts, so pinning afterwards is too late to protect the entry
            // this mutation is about to write.
            pinned.set(id, (pinned.get(id) ?? 0) + 1);
            try {
              // Re-read and re-apply on a version conflict rather than
              // overwriting. `fn` runs again against the fresher store, so the
              // other writer's work survives and so does this one's. Bounded:
              // a workspace under permanent contention must fail loudly rather
              // than spin.
              let lastConflict: unknown;
              for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt += 1) {
                const entry = await ensureLoaded(id);
                const result = fn(entry.store);
                try {
                  entry.version = await io.save(id, entry.store, entry.version);
                  return result;
                } catch (err) {
                  // Whatever happened, this copy no longer matches the database:
                  // on a conflict it is stale, and on any other failure it holds
                  // a change that was never durably written. Drop it either way.
                  // Safe only because `serialise` guarantees nobody else holds it.
                  loaded.delete(id);
                  if (!isConflict(err)) {
                    console.error(`[citefleet] snapshot save failed for ${id}`, err);
                    throw err;
                  }
                  lastConflict = err;
                }
              }
              console.error(
                `[citefleet] snapshot for ${id} kept changing under ${MAX_SAVE_ATTEMPTS} attempts`,
                lastConflict,
              );
              throw lastConflict;
            } finally {
              const count = (pinned.get(id) ?? 1) - 1;
              if (count > 0) pinned.set(id, count);
              else pinned.delete(id);
            }
          });
        },
      };
    },
    forget() {
      loaded.clear();
      booting.clear();
      pinned.clear();
      queues.clear();
    },
    size() {
      return loaded.size;
    },
    queueDepth() {
      return queues.size;
    },
  };
}

/** The process-wide instance, wired to Postgres. */
export const workspaces = createWorkspaces({
  load: (id) => loadSnapshot(id),
  save: (id, store, expected) => saveSnapshot(id, store, expected),
});

export function handleFor(id: WorkspaceId): WorkspaceHandle {
  return workspaces.handleFor(id);
}
