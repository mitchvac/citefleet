import { FLEET_TEMPLATE } from "./bots.ts";
import { ENGINE_MATRIX, applyPlaybookHrefs } from "./playbook.ts";
import { defaultControl } from "./control.ts";
import type { StoreShape } from "./types";
import type { WorkspaceId } from "./workspace-id.ts";

/**
 * A fresh CiteFleet workspace: the nine-bot fleet on standby, the answer-engine
 * matrix, the control plane, and no properties. Customers are onboarded from
 * Command; nothing customer-specific ships in code.
 *
 * The id is a REQUIRED argument rather than a constant. It used to be the
 * literal "ws-citefleet", which was correct while one workspace existed and
 * would silently stamp every new tenant with the same identity now that more
 * than one can.
 */
export function seedStore(id: WorkspaceId, name = "CiteFleet"): StoreShape {
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
      id,
      name,
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
