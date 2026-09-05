import type {
  ActivityEvent,
  Bot,
  Site,
  StoreShape,
  Task,
} from "./types";
import { SCORE_BUCKETS } from "./playbook.ts";
import { seedStore } from "./seed.ts";
import { loadSnapshot, mergeSnapshot, saveSnapshot } from "./persist.ts";

let cache: StoreShape | null = null;
let boot: Promise<StoreShape> | null = null;

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function persist(store: StoreShape) {
  try {
    await saveSnapshot(store);
  } catch (err) {
    console.error("[citefleet] snapshot save failed", err);
    throw err;
  }
}

async function bootStore(): Promise<StoreShape> {
  const seeded = seedStore();
  try {
    const saved = await loadSnapshot();
    cache = saved ? mergeSnapshot(seeded, saved) : seeded;
  } catch (err) {
    console.error("[citefleet] snapshot load failed — seeding", err);
    cache = seeded;
  }
  for (const site of cache.sites) recalcScores(cache, site.id);
  try {
    await saveSnapshot(cache);
  } catch (err) {
    console.error("[citefleet] snapshot save failed on boot", err);
  }
  return cache;
}

async function ensureLoaded(): Promise<StoreShape> {
  if (cache) return cache;
  boot ??= bootStore();
  return boot;
}

export async function getStore(): Promise<StoreShape> {
  return clone(await ensureLoaded());
}

export async function mutateStore<T>(
  fn: (store: StoreShape) => T,
): Promise<T> {
  const store = await ensureLoaded();
  const result = fn(store);
  await persist(store);
  return result;
}

export async function resetStore(): Promise<StoreShape> {
  cache = seedStore();
  boot = Promise.resolve(cache);
  await persist(cache);
  return clone(cache);
}

export function logActivity(
  store: StoreShape,
  event: Omit<ActivityEvent, "id" | "at"> & { at?: string },
) {
  store.activity.unshift({
    id: crypto.randomUUID(),
    at: event.at ?? new Date().toISOString(),
    actor: event.actor,
    kind: event.kind,
    message: event.message,
    siteId: event.siteId,
    botId: event.botId,
    taskId: event.taskId,
  });
  store.activity = store.activity.slice(0, 400);
}

export function touchBot(store: StoreShape, botId: string, patch: Partial<Bot>) {
  const bot = store.bots.find((b) => b.id === botId);
  if (!bot) return;
  Object.assign(bot, patch, { lastHeartbeat: new Date().toISOString() });
}

export function getSite(store: StoreShape, siteId: string): Site | undefined {
  return store.sites.find((s) => s.id === siteId);
}

export function getTask(store: StoreShape, taskId: string): Task | undefined {
  return store.tasks.find((t) => t.id === taskId);
}

export function recalcScores(store: StoreShape, siteId: string) {
  const site = getSite(store, siteId);
  if (!site) return;
  const tasks = store.tasks.filter((t) => t.siteId === siteId);
  const ratio = (ids: readonly string[]) => {
    const slice = tasks.filter((t) => ids.includes(t.playbookId));
    if (!slice.length) return 0;
    const done = slice.filter((t) => t.status === "done").length;
    // Work in flight earns partial credit. "blocked" does NOT: a blocked task is
    // stalled waiting on a person, so paying it 45% reported progress where there
    // was none (wflowprocess.app showed Mentions 45 with zero mention work done).
    // It scores 0 here and stays visible as a blocked row for the operator to act on.
    const partial = slice.filter((t) =>
      ["assigned", "running"].includes(t.status),
    ).length;
    return Math.round(((done + partial * 0.45) / slice.length) * 100);
  };
  // Buckets live in playbook.ts so the campaign card's completion total counts
  // exactly the tasks these scores average. See SCORE_BUCKETS for why `monitor`
  // is in neither.
  site.scores.technical = ratio(SCORE_BUCKETS.technical);
  site.scores.submissions = ratio(SCORE_BUCKETS.submissions);
  site.scores.mentions = ratio(SCORE_BUCKETS.mentions);
  site.scores.overall = Math.round(
    site.scores.technical * 0.4 +
      site.scores.submissions * 0.3 +
      site.scores.mentions * 0.3,
  );
  const open = tasks.filter((t) => t.status !== "done").length;
  if (open === 0) site.status = "indexed";
  else if (site.scores.technical >= 80 && site.scores.submissions >= 70) {
    site.status = "waiting";
  } else {
    site.status = "campaign";
  }
}
