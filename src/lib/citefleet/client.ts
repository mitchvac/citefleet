import { useCallback, useEffect, useState } from "react";
import type { AuditResult, StoreShape } from "./types";
import {
  auditProperty,
  dispatchProperty,
  loadState,
  onboardProperty,
  patchTaskFn,
  publishListingFn,
  resetState,
  runControlCycleFn,
  runTaskFn,
  setAutopilotFn,
  setKillFn,
  tickAutopilotFn,
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

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
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
    onboard: (body: { name: string; url: string; indexNowKey?: string }) =>
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
  };
}
