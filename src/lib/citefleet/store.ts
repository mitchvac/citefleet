import type {
  ActivityEvent,
  Bot,
  Site,
  StoreShape,
  Task,
} from "./types";
import { seedStore } from "./seed";

let cache: StoreShape | null = null;

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function ensureLoaded(): Promise<StoreShape> {
  if (!cache) cache = seedStore();
  return cache;
}

export async function getStore(): Promise<StoreShape> {
  return clone(await ensureLoaded());
}

export async function mutateStore<T>(
  fn: (store: StoreShape) => T,
): Promise<T> {
  const store = await ensureLoaded();
  return fn(store);
}

export async function resetStore(): Promise<StoreShape> {
  cache = seedStore();
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
  const ratio = (ids: string[]) => {
    const slice = tasks.filter((t) => ids.includes(t.playbookId));
    if (!slice.length) return 0;
    const done = slice.filter((t) => t.status === "done").length;
    const partial = slice.filter((t) =>
      ["assigned", "running", "blocked"].includes(t.status),
    ).length;
    return Math.round(((done + partial * 0.45) / slice.length) * 100);
  };
  site.scores.technical = ratio([
    "spa_fallback",
    "robots_ai",
    "sitemap",
    "app_health",
  ]);
  site.scores.submissions = ratio([
    "gsc_submit",
    "bing_webmaster",
    "indexnow",
    "botcentral_list",
  ]);
  site.scores.mentions = ratio(["x_mentions", "directories", "press"]);
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
