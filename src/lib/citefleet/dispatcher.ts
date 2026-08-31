import { PLAYBOOK, playbookToTaskDraft } from "./playbook";
import { FLEET_TEMPLATE } from "./bots";
import { auditSite } from "./auditor";
import {
  getStore,
  logActivity,
  mutateStore,
  recalcScores,
  touchBot,
} from "./store";
import type { AuditResult, PlaybookId, Site, Task } from "./types";

function botForPlaybook(playbookId: PlaybookId) {
  return FLEET_TEMPLATE.find((b) => b.playbookIds.includes(playbookId));
}

export async function onboardSite(input: {
  name: string;
  url: string;
  routes?: string[];
  indexNowKey?: string;
}): Promise<Site> {
  const url = input.url.replace(/\/$/, "");
  const domain = new URL(url).hostname;
  const site: Site = {
    id: `site-${crypto.randomUUID().slice(0, 8)}`,
    workspaceId: "ws-resonance-labs",
    name: input.name || domain,
    domain,
    url,
    status: "auditing",
    sitemapUrl: `${url}/sitemap.xml`,
    indexNowKey: input.indexNowKey,
    routes: input.routes?.length
      ? input.routes
      : ["/", "/privacy", "/terms", "/about"],
    createdAt: new Date().toISOString(),
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "Onboarded. Awaiting Grok Dispatcher assignment.",
  };

  await mutateStore((store) => {
    store.sites.unshift(site);
    for (const step of PLAYBOOK) {
      const draft = playbookToTaskDraft(site.id, step);
      store.tasks.push({
        ...draft,
        id: `task-${site.id}-${step.id}`,
        updatedAt: new Date().toISOString(),
      });
    }
    logActivity(store, {
      actor: "Operator",
      kind: "system",
      siteId: site.id,
      message: `Workspace accepted ${site.domain} for indexing campaign.`,
    });
  });

  return site;
}

export async function dispatchSite(siteId: string) {
  const assigned: Array<{ bot: string; task: string }> = [];

  await mutateStore((store) => {
    const site = store.sites.find((s) => s.id === siteId);
    if (!site) throw new Error("Site not found");
    const open = store.tasks.filter(
      (t) => t.siteId === siteId && t.status !== "done",
    );
    open.sort((a, b) => a.priority - b.priority);

    const usedBots = new Set(
      store.bots
        .filter((b) => b.status === "working" && b.currentSiteId !== siteId)
        .map((b) => b.id),
    );

    for (const task of open) {
      const spec = botForPlaybook(task.playbookId);
      if (!spec) continue;
      if (usedBots.has(spec.id) && task.status === "queued") continue;
      const bot = store.bots.find((b) => b.id === spec.id);
      if (!bot) continue;

      task.botId = bot.id;
      task.status = task.status === "queued" ? "assigned" : task.status;
      task.assignedBy = "grok-dispatcher";
      task.assignedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();
      task.evidence.unshift({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: "dispatch",
        label: `Grok assigned ${bot.callsign}`,
        detail: `${bot.role} → ${task.title}`,
        ok: true,
      });

      touchBot(store, bot.id, {
        status: "assigned",
        currentTaskId: task.id,
        currentSiteId: siteId,
      });
      usedBots.add(bot.id);
      assigned.push({ bot: bot.callsign, task: task.title });
    }

    site.status = "campaign";
    site.summary = `Grok Dispatcher assigned ${assigned.length} active bot tasks.`;
    recalcScores(store, siteId);
    logActivity(store, {
      actor: "Grok Dispatcher",
      kind: "dispatch",
      siteId,
      message: `Assigned ${assigned.length} tasks: ${assigned
        .map((a) => `${a.bot} → ${a.task}`)
        .join("; ")}`,
    });
  });

  return { assigned };
}

export async function runAuditAndApply(siteId: string): Promise<AuditResult> {
  const store = await getStore();
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) throw new Error("Site not found");
  const audit = await auditSite(site);

  await mutateStore((s) => {
    const current = s.sites.find((x) => x.id === siteId);
    if (!current) return;
    current.lastAuditAt = audit.at;
    current.status = "campaign";

    const apply = (playbookId: PlaybookId, findingOk: boolean, label: string) => {
      const task = s.tasks.find(
        (t) => t.siteId === siteId && t.playbookId === playbookId,
      );
      if (!task) return;
      task.evidence.unshift({
        id: crypto.randomUUID(),
        at: audit.at,
        kind: "http",
        label,
        ok: findingOk,
      });
      if (findingOk && task.status !== "done") {
        const autoClosable: PlaybookId[] = [
          "spa_fallback",
          "robots_ai",
          "sitemap",
          "indexnow",
        ];
        if (autoClosable.includes(playbookId)) {
          const related = audit.findings.filter(
            (f) => f.playbookId === playbookId,
          );
          const anyBad = related.some(
            (f) => f.severity === "critical" || f.severity === "warn",
          );
          if (!anyBad) {
            task.status = "done";
            task.completedAt = audit.at;
            task.checklist = task.checklist.map((c) => ({ ...c, done: true }));
          }
        }
      }
      task.updatedAt = audit.at;
    };

    const spaBad = audit.findings.some((f) => f.id === "spa-fallback");
    apply(
      "spa_fallback",
      !spaBad,
      spaBad
        ? "Live audit: SPA fallback still failing"
        : "Live audit: public routes fetchable",
    );
    apply(
      "robots_ai",
      !!audit.robots?.ok,
      audit.robots?.ok
        ? "Live audit: robots.txt reachable"
        : "Live audit: robots.txt missing",
    );
    apply(
      "sitemap",
      !!audit.sitemap?.ok,
      audit.sitemap?.ok
        ? `Live audit: sitemap ${audit.sitemap.urlCount} URLs`
        : "Live audit: sitemap unreadable",
    );

    const keyFinding = audit.findings.find((f) => f.id.startsWith("indexnow"));
    if (keyFinding) {
      apply("indexnow", keyFinding.severity === "ok", keyFinding.title);
    }

    recalcScores(s, siteId);
    logActivity(s, {
      actor: "Sentinel",
      kind: "audit",
      siteId,
      botId: "bot-sentinel",
      message: `Live audit ${audit.ok ? "passed" : "found blocking issues"} — ${audit.findings.length} findings across ${audit.routeChecks.length} routes.`,
    });
  });

  return audit;
}

export async function runTask(taskId: string) {
  let snapshot: Task | undefined;
  await mutateStore((store) => {
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found");
    snapshot = task;
    task.status = "running";
    task.updatedAt = new Date().toISOString();
    if (task.botId) {
      touchBot(store, task.botId, {
        status: "working",
        currentTaskId: task.id,
        currentSiteId: task.siteId,
      });
    }
    logActivity(store, {
      actor: task.botId
        ? store.bots.find((b) => b.id === task.botId)?.name || "Bot"
        : "Grok Dispatcher",
      kind: "task",
      siteId: task.siteId,
      botId: task.botId,
      taskId: task.id,
      message: `Started work on "${task.title}".`,
    });
  });

  if (!snapshot) throw new Error("Task not found");

  if (
    ["spa_fallback", "robots_ai", "sitemap", "indexnow", "monitor"].includes(
      snapshot.playbookId,
    )
  ) {
    const audit = await runAuditAndApply(snapshot.siteId);
    const relevant = audit.findings.filter(
      (f) => f.playbookId === snapshot!.playbookId,
    );
    const blocked = relevant.some(
      (f) => f.severity === "critical" || f.severity === "warn",
    );

    await mutateStore((store) => {
      const task = store.tasks.find((t) => t.id === taskId);
      if (!task) return;
      if (blocked) {
        task.status = "blocked";
        task.blockedReason = relevant
          .filter((f) => f.severity !== "ok")
          .map((f) => f.title)
          .join("; ");
      } else if (relevant.length && relevant.every((f) => f.severity === "ok")) {
        task.status = "done";
        task.completedAt = new Date().toISOString();
        task.checklist = task.checklist.map((c) => ({ ...c, done: true }));
      } else {
        task.status = "assigned";
      }
      task.updatedAt = new Date().toISOString();
      if (task.botId) {
        touchBot(store, task.botId, {
          status: task.status === "done" ? "standby" : "assigned",
          currentTaskId: task.status === "done" ? undefined : task.id,
        });
      }
      recalcScores(store, task.siteId);
      logActivity(store, {
        actor: "Grok Dispatcher",
        kind: "task",
        siteId: task.siteId,
        botId: task.botId,
        taskId: task.id,
        message: `Task "${task.title}" → ${task.status}${
          task.blockedReason ? ` (${task.blockedReason})` : ""
        }.`,
      });
    });
    return { audit };
  }

  await mutateStore((store) => {
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = "assigned";
    task.updatedAt = new Date().toISOString();
    const nextOpen = task.checklist.find((c) => !c.done);
    if (nextOpen) {
      nextOpen.done = true;
      task.evidence.unshift({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: "note",
        label: "Operator checklist advanced",
        detail: nextOpen.label,
        ok: true,
      });
    }
    if (task.checklist.every((c) => c.done)) {
      task.status = "done";
      task.completedAt = new Date().toISOString();
      if (task.botId) {
        touchBot(store, task.botId, {
          status: "standby",
          currentTaskId: undefined,
        });
      }
    }
    recalcScores(store, task.siteId);
    logActivity(store, {
      actor: "Operator",
      kind: "task",
      siteId: task.siteId,
      botId: task.botId,
      taskId: task.id,
      message: `Advanced "${task.title}" — ${task.checklist.filter((c) => c.done).length}/${task.checklist.length} checks complete.`,
    });
  });

  return { audit: null };
}

export async function patchTask(
  taskId: string,
  patch: Partial<Pick<Task, "status" | "blockedReason">> & {
    checklistId?: string;
    done?: boolean;
  },
) {
  await mutateStore((store) => {
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found");
    if (patch.status) task.status = patch.status;
    if (patch.blockedReason !== undefined) task.blockedReason = patch.blockedReason;
    if (patch.checklistId && typeof patch.done === "boolean") {
      const item = task.checklist.find((c) => c.id === patch.checklistId);
      if (item) item.done = patch.done;
    }
    if (task.checklist.every((c) => c.done) && task.status !== "done") {
      task.status = "done";
      task.completedAt = new Date().toISOString();
    }
    task.updatedAt = new Date().toISOString();
    recalcScores(store, task.siteId);
  });
}
