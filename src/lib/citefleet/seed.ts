import { FLEET_TEMPLATE } from "./bots";
import { ENGINE_MATRIX, applyPlaybookHrefs } from "./playbook";
import { defaultControl } from "./control";
import type { StoreShape } from "./types";

/**
 * A fresh CiteFleet workspace: the nine-bot fleet on standby, the answer-engine
 * matrix, the control plane, and no properties. Customers are onboarded from
 * Command; nothing customer-specific ships in code.
 */
export function seedStore(): StoreShape {
  const now = new Date().toISOString();
  const bots = FLEET_TEMPLATE.map((bot) => ({
    ...bot,
    status: "standby" as const,
    currentTaskId: undefined,
    currentSiteId: undefined,
    lastHeartbeat: now,
  }));

  const store: StoreShape = {
    workspace: {
      id: "ws-citefleet",
      name: "CiteFleet",
      plan: "enterprise",
      region: "us-east-1",
    },
    sites: [],
    bots,
    tasks: [],
    engines: ENGINE_MATRIX.map((e) => ({ ...e })),
    control: defaultControl(),
    activity: [
      {
        id: crypto.randomUUID(),
        at: now,
        actor: "Grok Dispatcher",
        kind: "system",
        message: "Workspace ready. Add the first customer origin on Command to start its campaign.",
      },
    ],
  };
  applyPlaybookHrefs(store.tasks, store.sites);
  return store;
}
