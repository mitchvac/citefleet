import { useCallback, useEffect, useState } from "react";
import type { AuditResult, StoreShape } from "./types";
import {
  attachGithubFn,
  auditProperty,
  dispatchProperty,
  loadState,
  onboardProperty,
  patchTaskFn,
  publishListingFn,
  pushOriginPackFn,
  removePropertyFn,
  resetState,
  runControlCycleFn,
  runTaskFn,
  setAutopilotFn,
  setGithubTokenFn,
  setKillFn,
  tickAutopilotFn,
  verifyProofFn,
  webhookSecretFn,
} from "./fleet-api";

export function useFleet() {
  const [store, setStore] = useState<StoreShape | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadState();
    setStore(next);
    setError(null);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspace"))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function run(label: string, fn: () => Promise<void>): Promise<boolean> {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch (err) {
      // A failed act still changes the workspace (evidence, blocked task, proof
      // token): reload it, then show the error on top of the fresh state.
      await refresh().catch(() => {});
      setError(err instanceof Error ? err.message : "Request failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    store,
    loading,
    error,
    busy,
    refresh,
    onboard: (body: {
      name: string;
      url: string;
      indexNowKey?: string;
      github?: { owner: string; repo: string; branch?: string; root?: string };
    }) =>
      run("onboard", async () => {
        await onboardProperty({ data: body });
      }),
    dispatch: (siteId: string) =>
      run("dispatch", async () => {
        await dispatchProperty({ data: { siteId } });
      }),
    audit: async (siteId: string): Promise<AuditResult | null> => {
      let audit: AuditResult | null = null;
      await run("audit", async () => {
        audit = await auditProperty({ data: { siteId } });
      });
      return audit;
    },
    runTask: (taskId: string) =>
      run("task", async () => {
        await runTaskFn({ data: { taskId } });
      }),
    patchTask: (taskId: string, body: Record<string, unknown>) =>
      run("patch", async () => {
        await patchTaskFn({ data: { taskId, body } });
      }),
    reset: () =>
      run("reset", async () => {
        await resetState();
      }),
    setAutopilot: (enabled: boolean) =>
      run("autopilot", async () => {
        await setAutopilotFn({ data: { enabled, grok: enabled } });
      }),
    tickAutopilot: () =>
      run("tick", async () => {
        await tickAutopilotFn({ data: { grok: false } });
      }),
    verifyProof: (siteId: string) =>
      run("proof", async () => {
        await verifyProofFn({ data: { siteId } });
      }),
    webhookSecret: (siteId: string, rotate = false) =>
      run("webhook", async () => {
        await webhookSecretFn({ data: { siteId, rotate } });
      }),
    removeProperty: (siteId: string) =>
      run("remove", async () => {
        await removePropertyFn({ data: { siteId } });
      }),
    publishListing: (siteId: string) =>
      run("publish", async () => {
        await publishListingFn({ data: { siteId } });
      }),
    runControlCycle: () =>
      run("control", async () => {
        await runControlCycleFn();
      }),
    setKill: (body: {
      global?: boolean;
      door?: "catalog" | "mentions" | "submissions" | "spend" | "autopilot";
      frozen?: boolean;
      reason?: string;
    }) =>
      run("kill", async () => {
        await setKillFn({ data: body });
      }),
    attachGithub: (body: {
      siteId: string;
      owner: string;
      repo: string;
      branch?: string;
      root?: string;
    }) =>
      run("github", async () => {
        await attachGithubFn({ data: body });
      }),
    pushOriginPack: (body: {
      siteId: string;
      owner: string;
      repo: string;
      branch?: string;
      root?: string;
    }) =>
      run("origin", async () => {
        await attachGithubFn({ data: body });
        await pushOriginPackFn({ data: { siteId: body.siteId } });
      }),
    setGithubToken: (token: string) =>
      run("ghtoken", async () => {
        await setGithubTokenFn({ data: { token } });
      }),
  };
}
