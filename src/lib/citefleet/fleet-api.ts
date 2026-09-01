import { createServerFn } from "@tanstack/react-start";

export const loadState = createServerFn({ method: "GET" }).handler(async () => {
  const { hydrateListings } = await import("./ops.server");
  return hydrateListings();
});

export const resetState = createServerFn({ method: "POST" }).handler(async () => {
  const { resetStore } = await import("./ops.server");
  return resetStore();
});

export const onboardProperty = createServerFn({ method: "POST" })
  .validator((d: { name: string; url: string; indexNowKey?: string }) => d)
  .handler(async ({ data }) => {
    if (!data.url || data.url === "https://") {
      throw new Error("url required");
    }
    const { onboardSite, dispatchSite } = await import("./ops.server");
    const site = await onboardSite(data);
    await dispatchSite(site.id);
    return { id: site.id };
  });

export const dispatchProperty = createServerFn({ method: "POST" })
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { dispatchSite } = await import("./ops.server");
    return dispatchSite(data.siteId);
  });

export const auditProperty = createServerFn({ method: "POST" })
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { runAuditAndApply } = await import("./ops.server");
    return runAuditAndApply(data.siteId);
  });

export const runTaskFn = createServerFn({ method: "POST" })
  .validator((d: { taskId: string }) => d)
  .handler(async ({ data }) => {
    const { runTask } = await import("./ops.server");
    return runTask(data.taskId);
  });

export const patchTaskFn = createServerFn({ method: "POST" })
  .validator((d: { taskId: string; body: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    const { patchTask } = await import("./ops.server");
    await patchTask(
      data.taskId,
      data.body as {
        status?: "queued" | "assigned" | "running" | "blocked" | "done" | "failed";
        blockedReason?: string;
        checklistId?: string;
        done?: boolean;
      },
    );
    return { ok: true };
  });

export const setAutopilotFn = createServerFn({ method: "POST" })
  .validator((d: { enabled: boolean; grok?: boolean }) => d)
  .handler(async ({ data }) => {
    const { setAutopilot, runAutopilotTick, getStore, grokConfigured } =
      await import("./ops.server");
    await setAutopilot(data.enabled);
    const result = data.enabled
      ? await runAutopilotTick({ grok: Boolean(data.grok) })
      : null;
    const store = await getStore();
    return {
      enabled: Boolean(store.workspace.autopilot),
      lastTickAt: store.workspace.autopilotLastTickAt || null,
      grok: grokConfigured(),
      result,
    };
  });

export const tickAutopilotFn = createServerFn({ method: "POST" })
  .validator((d: { grok?: boolean }) => d)
  .handler(async ({ data }) => {
    const { runAutopilotTick } = await import("./ops.server");
    return runAutopilotTick({ grok: Boolean(data?.grok) });
  });

export const publishListingFn = createServerFn({ method: "POST" })
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { publishSiteToBotCentral } = await import("./ops.server");
    return publishSiteToBotCentral(data.siteId);
  });

export const runControlCycleFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { runMonitorCycle } = await import("./ops.server");
    return runMonitorCycle();
  },
);

export const setKillFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      global?: boolean;
      door?: "catalog" | "mentions" | "submissions" | "spend" | "autopilot";
      frozen?: boolean;
      reason?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { applyKill, getStore } = await import("./ops.server");
    const { mutateStore } = await import("./store");
    await mutateStore((store) => {
      applyKill(store, { ...data, by: "Operator" });
    });
    return (await getStore()).control.kill;
  });
