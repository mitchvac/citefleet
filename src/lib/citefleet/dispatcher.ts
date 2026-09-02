import { PLAYBOOK, applyPlaybookHrefs, playbookToTaskDraft } from "./playbook";
import { FLEET_TEMPLATE } from "./bots";
import { auditSite } from "./auditor";
import { publishListing } from "./botcentral";
import {
  getStore,
  logActivity,
  mutateStore,
  recalcScores,
  touchBot,
} from "./store";
import { assertCanAct, doorForPlaybook, freezeReason, isFrozen } from "./control";
import type { AuditResult, PlaybookId, Site, Task } from "./types";
import { siteVerifyToken, verifyTokenFor } from "./verify-token.ts";

function botForPlaybook(playbookId: PlaybookId) {
  return FLEET_TEMPLATE.find((b) => b.playbookIds.includes(playbookId));
}

export async function onboardSite(input: {
  name: string;
  url: string;
  routes?: string[];
  indexNowKey?: string;
  github?: { owner: string; repo: string; branch?: string; root?: string };
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
    verifyToken: verifyTokenFor(domain),
    routes: input.routes?.length
      ? input.routes
      : ["/", "/privacy", "/terms", "/about"],
    createdAt: new Date().toISOString(),
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    summary: "Onboarded. Awaiting Grok Dispatcher assignment.",
    github:
      input.github?.owner && input.github.repo
        ? {
            owner: input.github.owner.replace(/^@/, ""),
            repo: input.github.repo.replace(/\.git$/, ""),
            branch: input.github.branch || "main",
            root: input.github.root ?? "public",
          }
        : undefined,
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
    applyPlaybookHrefs(store.tasks, store.sites);
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
      const bot = store.bots.find((b) => b.id === spec.id);
      if (!bot) continue;
      if (
        usedBots.has(spec.id) &&
        task.status === "queued" &&
        bot.currentSiteId &&
        bot.currentSiteId !== siteId
      )
        continue;

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
  const preview = await getStore();
  const existing = preview.tasks.find((t) => t.id === taskId);
  if (!existing) throw new Error("Task not found");
  const door = doorForPlaybook(existing.playbookId);
  if (door !== "observe" && isFrozen(preview, door)) {
    throw new Error(freezeReason(preview, door));
  }

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

  if (snapshot.playbookId === "botcentral_list") {
    return { audit: null, listing: await publishSiteToBotCentral(snapshot.siteId) };
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

/**
 * Drop a property from the workspace: its tasks and monitor snapshot go with it,
 * bots working it go to standby, the audit log keeps its history. The BotCentral
 * card (if any) is not touched — the catalog is a separate system of record.
 */
export async function removeSite(siteId: string) {
  let domain = "";
  await mutateStore((store) => {
    const site = store.sites.find((s) => s.id === siteId);
    if (!site) throw new Error("Site not found");
    domain = site.domain;
    store.sites = store.sites.filter((s) => s.id !== siteId);
    store.tasks = store.tasks.filter((t) => t.siteId !== siteId);
    if (store.control?.snapshots) delete store.control.snapshots[siteId];
    for (const bot of store.bots) {
      if (bot.currentSiteId === siteId) {
        touchBot(store, bot.id, {
          status: "standby",
          currentSiteId: undefined,
          currentTaskId: undefined,
        });
      }
    }
    logActivity(store, {
      actor: "Operator",
      kind: "control",
      siteId,
      message: `Removed ${site.domain} (${site.name}) from the workspace. Tasks and monitor snapshot dropped; BotCentral card untouched.`,
    });
  });
  return { ok: true as const, siteId, domain };
}

export async function publishSiteToBotCentral(siteId: string) {
  const preview = await getStore();
  assertCanAct(preview, "catalog");
  const store = await getStore();
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) throw new Error("Site not found");

  // Backfill sites onboarded before verifyToken existed; the card and the
  // origin pack must carry the same value.
  const verifyToken = siteVerifyToken(site);
  const listing = await publishListing({ ...site, verifyToken });

  await mutateStore((s) => {
    const current = s.sites.find((x) => x.id === siteId);
    if (current) {
      current.verifyToken = verifyToken;
      // A rejected publish (422, catalog down) must not flip an already-listed
      // site to "not listed": the catalog row is untouched. Keep the listing and
      // surface the error beside it.
      current.botcentral =
        listing.listed || !current.botcentral?.listed
          ? listing
          : { ...current.botcentral, error: listing.error };
    }
    const task = s.tasks.find(
      (t) => t.siteId === siteId && t.playbookId === "botcentral_list",
    );
    if (task) {
      task.evidence.unshift({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        kind: "http",
        label: listing.listed ? "Published to BotCentral" : "BotCentral publish blocked",
        detail: listing.href || listing.error,
        url: listing.href,
        ok: listing.listed,
      });
      if (listing.listed) {
        task.status = "done";
        task.completedAt = new Date().toISOString();
        task.checklist = task.checklist.map((c) => ({ ...c, done: true }));
        task.blockedReason = undefined;
        if (task.botId) {
          touchBot(s, task.botId, { status: "standby", currentTaskId: undefined });
        }
      } else {
        task.status = "blocked";
        task.blockedReason = listing.error || "catalog rejected the card";
      }
      task.updatedAt = new Date().toISOString();
    }
    recalcScores(s, siteId);
    logActivity(s, {
      actor: "Orion",
      kind: "index",
      siteId,
      botId: "bot-orion",
      message: listing.listed
        ? `${site.domain} is live on BotCentral (${listing.href}).`
        : `BotCentral did not list ${site.domain}: ${listing.error}`,
    });
  });

  if (!listing.listed) {
    throw new Error(listing.error || "BotCentral did not list the site");
  }
  // The raw catalog card is Record<string, unknown> — not a serializable server-fn
  // return. Callers only need the status fields.
  const { card: _card, ...status } = listing;
  return status;
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
    const door = doorForPlaybook(task.playbookId);
    if (
      door !== "observe" &&
      isFrozen(store, door) &&
      (patch.status === "done" || patch.done === true)
    ) {
      throw new Error(freezeReason(store, door));
    }
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
