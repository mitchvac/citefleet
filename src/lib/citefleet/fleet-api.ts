import { createServerFn } from "@tanstack/react-start";
import { operatorMiddleware } from "@/lib/auth/operator-middleware";

// Every server fn here is behind the signed-in session (see operator.server.ts).
// Public: /health, llms.txt, sitemap.xml, /learn, /login, /api/hooks/*.

export const loadState = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware]).handler(async () => {
  const { hydrateListings } = await import("./ops.server");
  return hydrateListings();
});

export const resetState = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware]).handler(async () => {
  const { resetStore } = await import("./ops.server");
  const { maskStoreSecrets } = await import("./secrets.ts");
  return maskStoreSecrets(await resetStore());
});

export const onboardProperty = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator(
    (d: {
      name: string;
      url: string;
      indexNowKey?: string;
      github?: { owner: string; repo: string; branch?: string; root?: string };
    }) => d,
  )
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
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { dispatchSite } = await import("./ops.server");
    return dispatchSite(data.siteId);
  });

export const removePropertyFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { removeSite } = await import("./ops.server");
    return removeSite(data.siteId);
  });

export const verifyProofFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { verifySiteProof } = await import("./ops.server");
    return verifySiteProof(data.siteId);
  });

// Always mints a NEW secret and returns it once. An existing secret is never
// returned by any server fn (defence in depth behind the operator gate).
export const webhookSecretFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { rotateWebhookSecret } = await import("./ops.server");
    return rotateWebhookSecret(data.siteId);
  });

export const auditProperty = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { runAuditAndApply } = await import("./ops.server");
    return runAuditAndApply(data.siteId);
  });

export const runTaskFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { taskId: string }) => d)
  .handler(async ({ data }) => {
    const { runTask } = await import("./ops.server");
    return runTask(data.taskId);
  });

export const patchTaskFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
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
  .middleware([operatorMiddleware])
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
  .middleware([operatorMiddleware])
  .validator((d: { grok?: boolean }) => d)
  .handler(async ({ data }) => {
    const { runAutopilotTick } = await import("./ops.server");
    return runAutopilotTick({ grok: Boolean(data?.grok) });
  });

export const publishListingFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { publishSiteToBotCentral } = await import("./ops.server");
    return publishSiteToBotCentral(data.siteId);
  });

export const runControlCycleFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware]).handler(
  async () => {
    const { runMonitorCycle } = await import("./ops.server");
    return runMonitorCycle();
  },
);

export const setKillFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
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

export const attachGithubFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator(
    (d: {
      siteId: string;
      owner: string;
      repo: string;
      branch?: string;
      root?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { attachGithub } = await import("./ops.server");
    return attachGithub(data.siteId, data);
  });

export const pushOriginPackFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data }) => {
    const { pushOriginPack } = await import("./ops.server");
    return pushOriginPack(data.siteId);
  });

export const setGithubTokenFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const { setGithubToken } = await import("./ops.server");
    return setGithubToken(data.token);
  });

/** The customer's BotCentral key prefix for a property (empty string clears it). Stored, not sent, until billing is switched on. */
export const setBillingKeyFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string; keyPrefix: string }) => d)
  .handler(async ({ data }) => {
    const { setBillingKey } = await import("./ops.server");
    return setBillingKey(data.siteId, data.keyPrefix);
  });

/** What the billing side of this install is set to — the switch, the BotCentral hook URL, whether its secret is configured. */
export const billingSettingsFn = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware]).handler(async () => {
  const { billingEnabled, botcentralHookSecret, botcentralHookUrl } = await import("./ops.server");
  const { MIN_HOOK_SECRET } = await import("./webhook.ts");
  return {
    billing: billingEnabled(),
    hookUrl: botcentralHookUrl(),
    hookSecret: botcentralHookSecret().length >= MIN_HOOK_SECRET,
  };
});

/** Operator confirms a BotCentral top-up payment; BotCentral credits the prefix. Behind the spend kill door. */
export const settleTopupFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { id: string; tx: string; prefix?: string }) => d)
  .handler(async ({ data }) => {
    const { settleTopup } = await import("./ops.server");
    return settleTopup(data);
  });
