import { createServerFn } from "@tanstack/react-start";
import { operatorMiddleware } from "@/lib/auth/operator-middleware";
import type { Principal } from "@/lib/auth/operator.server";
import type { WorkspaceHandle } from "./workspace-handle.ts";

// Every server fn here is behind the signed-in session (see operator.server.ts).
// Public: /health, llms.txt, sitemap.xml, /learn, /login, /api/hooks/*.

/**
 * The workspace this request acts in, resolved from who is making it.
 *
 * Every handler below starts here. There is no other way in: the domain
 * functions take a `WorkspaceHandle` as their first argument and one cannot be
 * conjured from a string, so a handler that forgot to resolve a tenant does not
 * compile rather than operating on someone else's data.
 */
async function wsFor(context: { principal: Principal }): Promise<WorkspaceHandle> {
  const { workspaceForPrincipal } = await import("./workspace-registry.server.ts");
  return workspaceForPrincipal(context.principal);
}

export const loadState = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware]).handler(async ({ context }) => {
  const { hydrateListings } = await import("./ops.server");
  return hydrateListings(await wsFor(context));
});

export const resetState = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware]).handler(async ({ context }) => {
  const { maskStoreSecrets } = await import("./secrets.ts");
  const { seedStore } = await import("./seed.ts");
  const ws = await wsFor(context);
  // Reset THIS workspace, never "the" workspace. Seeded with the handle's own
  // id so a reset cannot re-stamp the tenant with a different identity.
  const fresh = seedStore(ws.id);
  await ws.mutate((store) => {
    Object.assign(store, fresh);
  });
  return maskStoreSecrets(await ws.get());
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
  .handler(async ({ data, context }) => {
    if (!data.url || data.url === "https://") {
      throw new Error("url required");
    }
    const { onboardSite, dispatchSite } = await import("./ops.server");
    const ws = await wsFor(context);
    const site = await onboardSite(ws, data);
    await dispatchSite(ws, site.id);
    return { id: site.id };
  });

export const dispatchProperty = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { dispatchSite } = await import("./ops.server");
    return dispatchSite(await wsFor(context), data.siteId);
  });

export const removePropertyFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { removeSite } = await import("./ops.server");
    return removeSite(await wsFor(context), data.siteId);
  });

export const verifyProofFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { verifySiteProof } = await import("./ops.server");
    return verifySiteProof(await wsFor(context), data.siteId);
  });

// Always mints a NEW secret and returns it once. An existing secret is never
// returned by any server fn (defence in depth behind the operator gate).
export const webhookSecretFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { rotateWebhookSecret } = await import("./ops.server");
    return rotateWebhookSecret(await wsFor(context), data.siteId);
  });

export const auditProperty = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { runAuditAndApply } = await import("./ops.server");
    return runAuditAndApply(await wsFor(context), data.siteId);
  });

export const runTaskFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const { runTask } = await import("./ops.server");
    return runTask(await wsFor(context), data.taskId);
  });

export const patchTaskFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { taskId: string; body: Record<string, unknown> }) => d)
  .handler(async ({ data, context }) => {
    const { patchTask } = await import("./ops.server");
    await patchTask(
      await wsFor(context),
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
  .handler(async ({ data, context }) => {
    const { setAutopilot, runAutopilotTick, grokConfigured } =
      await import("./ops.server");
    const ws = await wsFor(context);
    await setAutopilot(ws, data.enabled);
    const result = data.enabled
      ? await runAutopilotTick(ws, { grok: Boolean(data.grok) })
      : null;
    const store = await ws.get();
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
  .handler(async ({ data, context }) => {
    const { runAutopilotTick } = await import("./ops.server");
    return runAutopilotTick(await wsFor(context), { grok: Boolean(data?.grok) });
  });

export const publishListingFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { publishSiteToBotCentral } = await import("./ops.server");
    return publishSiteToBotCentral(await wsFor(context), data.siteId);
  });

export const runControlCycleFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware]).handler(
  async ({ context }) => {
    const { runMonitorCycle } = await import("./ops.server");
    return runMonitorCycle(await wsFor(context));
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
  .handler(async ({ data, context }) => {
    const { applyKill } = await import("./ops.server");
    const ws = await wsFor(context);
    await ws.mutate((store) => {
      applyKill(store, { ...data, by: "Operator" });
    });
    return (await ws.get()).control.kill;
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
  .handler(async ({ data, context }) => {
    const { attachGithub } = await import("./ops.server");
    return attachGithub(await wsFor(context), data.siteId, data);
  });

export const pushOriginPackFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { pushOriginPack } = await import("./ops.server");
    return pushOriginPack(await wsFor(context), data.siteId);
  });

/**
 * Read-only: what a push WOULD do to the repo, per file. Writes nothing, so
 * the campaign panel can show the verdict before the operator commits to it.
 */
export const inspectOriginPackFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { inspectOriginPack } = await import("./ops.server");
    return inspectOriginPack(await wsFor(context), data.siteId);
  });

export const setGithubTokenFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { token: string }) => d)
  .handler(async ({ data, context }) => {
    const { setGithubToken } = await import("./ops.server");
    return setGithubToken(await wsFor(context), data.token);
  });

/** The customer's BotCentral key prefix for a property (empty string clears it). Stored, not sent, until billing is switched on. */
export const setBillingKeyFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string; keyPrefix: string }) => d)
  .handler(async ({ data, context }) => {
    const { setBillingKey } = await import("./ops.server");
    return setBillingKey(await wsFor(context), data.siteId, data.keyPrefix);
  });

/** Set or rotate a property's IndexNow key. An empty string generates one. */
export const setIndexNowKeyFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string; key: string }) => d)
  .handler(async ({ data, context }) => {
    const { setIndexNowKey } = await import("./ops.server");
    return setIndexNowKey(await wsFor(context), data.siteId, data.key);
  });

/** Record the hosting provider a site runs on (the provider dropdown), or clear it with "". */
export const setProviderFn = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((d: { siteId: string; slug: string }) => d)
  .handler(async ({ data, context }) => {
    const { setProvider } = await import("./ops.server");
    return setProvider(await wsFor(context), data.siteId, data.slug);
  });

/**
 * What the billing side of this install is set to — the switch, the BotCentral
 * hook URL, whether its secret is configured.
 *
 * Deliberately takes no workspace: every value here is deployment configuration
 * read from the environment and is identical for every tenant. Resolving one
 * would imply these answers differ per customer, and they do not.
 */
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
  .handler(async ({ data, context }) => {
    const { settleTopup } = await import("./ops.server");
    return settleTopup(await wsFor(context), data);
  });
