import type { ActDoor, ControlPlane, KillSwitch, PlaybookId, StoreShape } from "./types";
import { logActivity } from "./store.ts";

export const ACT_DOORS: ActDoor[] = [
  "catalog",
  "mentions",
  "submissions",
  "spend",
  "autopilot",
];

export function defaultKill(): KillSwitch {
  return {
    global: false,
    doors: {
      catalog: false,
      mentions: false,
      submissions: false,
      spend: false,
      autopilot: false,
    },
    reason: "",
    setBy: "system",
    setAt: null,
  };
}

export function defaultControl(): ControlPlane {
  return {
    kill: defaultKill(),
    snapshots: {},
    jobs: [],
  };
}

export function ensureControl(store: StoreShape): ControlPlane {
  if (!store.control) store.control = defaultControl();
  if (!store.control.kill) store.control.kill = defaultKill();
  if (!store.control.snapshots) store.control.snapshots = {};
  if (!store.control.jobs) store.control.jobs = [];
  return store.control;
}

export function doorForPlaybook(playbookId: PlaybookId): ActDoor | "observe" {
  if (playbookId === "botcentral_list") return "catalog";
  if (["x_mentions", "directories", "press"].includes(playbookId)) return "mentions";
  if (["gsc_submit", "bing_webmaster", "indexnow"].includes(playbookId)) {
    return "submissions";
  }
  return "observe";
}

export function isFrozen(store: StoreShape, door?: ActDoor): boolean {
  const kill = ensureControl(store).kill;
  if (kill.global) return true;
  if (door && kill.doors[door]) return true;
  return false;
}

export function freezeReason(store: StoreShape, door?: ActDoor): string {
  const kill = ensureControl(store).kill;
  if (kill.global) {
    return `Global kill switch is on${kill.reason ? ` — ${kill.reason}` : ""}. Observe still runs. Acts are frozen.`;
  }
  if (door && kill.doors[door]) {
    return `${door} door is frozen${kill.reason ? ` — ${kill.reason}` : ""}.`;
  }
  return "";
}

export function assertCanAct(store: StoreShape, door: ActDoor) {
  if (isFrozen(store, door)) {
    throw new Error(freezeReason(store, door));
  }
}

export function applyKill(
  store: StoreShape,
  patch: {
    global?: boolean;
    door?: ActDoor;
    frozen?: boolean;
    reason?: string;
    by?: string;
  },
) {
  const control = ensureControl(store);
  if (typeof patch.global === "boolean") control.kill.global = patch.global;
  if (patch.door && typeof patch.frozen === "boolean") {
    control.kill.doors[patch.door] = patch.frozen;
  }
  if (patch.reason !== undefined) control.kill.reason = patch.reason;
  control.kill.setBy = patch.by || "Operator";
  control.kill.setAt = new Date().toISOString();
  logActivity(store, {
    actor: control.kill.setBy,
    kind: "control",
    message: control.kill.global
      ? `Kill switch ON — all acts frozen. ${control.kill.reason}`.trim()
      : patch.door
        ? `${patch.door} ${patch.frozen ? "frozen" : "open"}. ${control.kill.reason}`.trim()
        : "Kill switch updated.",
  });
}

export function pushJob(
  store: StoreShape,
  job: { kind: "monitor" | "reconcile" | "cycle"; ok: boolean; summary: string },
) {
  const control = ensureControl(store);
  control.jobs.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...job,
  });
  control.jobs = control.jobs.slice(0, 40);
}
