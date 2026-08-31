import { askGrok, grokConfigured } from "./grokApi";
import { dispatchSite, publishSiteToBotCentral, runAuditAndApply } from "./dispatcher";
import { getStore, logActivity, mutateStore, recalcScores } from "./store";

const MENTION_TASKS = new Set(["x_mentions", "directories", "press"]);

export async function runAutopilotTick(opts: { grok?: boolean } = {}) {
  const before = await getStore();
  const reports: string[] = [];
  const wantGrok = Boolean(opts.grok) && grokConfigured();

  for (const site of before.sites) {
    const audit = await runAuditAndApply(site.id);
    reports.push(
      `${site.domain}: audit ${audit.ok ? "ok" : "issues"} (${audit.findings.length} findings)`,
    );
    await dispatchSite(site.id);

    const listingTask = (await getStore()).tasks.find(
      (t) =>
        t.siteId === site.id &&
        t.playbookId === "botcentral_list" &&
        t.status !== "done",
    );
    if (listingTask && audit.ok) {
      try {
        const listing = await publishSiteToBotCentral(site.id);
        reports.push(
          `${site.domain}: BotCentral ${listing.listed ? "listed" : "not listed"}`,
        );
      } catch (err) {
        reports.push(
          `${site.domain}: BotCentral ${err instanceof Error ? err.message : "publish failed"}`,
        );
      }
    }

    if (!wantGrok) continue;

    const latest = await getStore();
    const open = latest.tasks.find(
      (t) =>
        t.siteId === site.id &&
        t.status !== "done" &&
        MENTION_TASKS.has(t.playbookId),
    );
    if (!open) continue;

    const bot = latest.bots.find((b) => b.id === open.botId);
    const reply = await askGrok(site, open, bot?.callsign);

    await mutateStore((store) => {
      const task = store.tasks.find((t) => t.id === open.id);
      if (!task) return;
      task.evidence.unshift({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: "mention",
        label: reply.ok ? "Grok autopilot draft" : "Grok autopilot blocked",
        detail: reply.text.slice(0, 4000),
        ok: reply.ok,
      });
      task.updatedAt = new Date().toISOString();
      if (!reply.ok) {
        task.status = "blocked";
        task.blockedReason = reply.text.slice(0, 240);
      } else {
        task.status = "assigned";
      }
      recalcScores(store, site.id);
      logActivity(store, {
        actor: bot?.name || "Grok",
        kind: "mention",
        siteId: site.id,
        botId: task.botId,
        taskId: task.id,
        message: reply.ok
          ? `Grok wrote a ${task.playbookId} packet for ${site.domain}. Review evidence, then publish.`
          : `Grok call failed for ${site.domain}: ${reply.text.slice(0, 160)}`,
      });
    });
    reports.push(
      `${site.domain}: Grok ${reply.ok ? "drafted" : "failed"} ${open.playbookId}`,
    );
  }

  await mutateStore((store) => {
    store.workspace.autopilotLastTickAt = new Date().toISOString();
    logActivity(store, {
      actor: "Sentinel",
      kind: "system",
      message: `Autopilot tick — ${reports.join(" · ") || "no properties"}`,
    });
  });

  return {
    at: new Date().toISOString(),
    grok: grokConfigured(),
    reports,
  };
}

export async function setAutopilot(enabled: boolean) {
  await mutateStore((store) => {
    store.workspace.autopilot = enabled;
    logActivity(store, {
      actor: "Operator",
      kind: "system",
      message: enabled
        ? "Autopilot on — Sentinel re-audits on a timer. Grok drafts only on Start."
        : "Autopilot off.",
    });
  });
}
