import { FLEET_TEMPLATE } from "./bots";
import { ENGINE_MATRIX, PLAYBOOK, playbookToTaskDraft } from "./playbook";
import { defaultControl } from "./control";
import type { StoreShape, Task } from "./types";

function isoHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

export function seedStore(): StoreShape {
  const siteId = "site-resonanse";
  const tasks: Task[] = PLAYBOOK.map((step) => {
    const draft = playbookToTaskDraft(siteId, step);
    return {
      ...draft,
      id: `task-${siteId}-${step.id}`,
      updatedAt: isoHoursAgo(8),
    };
  });

  const mark = (
    playbookId: Task["playbookId"],
    status: Task["status"],
    botId: string,
    extra?: Partial<Task>,
  ) => {
    const task = tasks.find((t) => t.playbookId === playbookId);
    if (!task) return;
    Object.assign(task, {
      status,
      botId,
      assignedBy: "grok-dispatcher",
      assignedAt: isoHoursAgo(30),
      updatedAt: isoHoursAgo(4),
      ...extra,
    });
    if (status === "done") {
      task.completedAt = isoHoursAgo(3);
      task.checklist = task.checklist.map((c) => ({ ...c, done: true }));
    }
  };

  mark("spa_fallback", "done", "bot-aether", {
    evidence: [
      {
        id: "ev-spa-1",
        at: isoHoursAgo(20),
        kind: "http",
        label: "Critical SPA 404 reproduced",
        detail:
          "GET /premium without Accept: text/html returned JSON 404. Google URL Inspection: Not found (404).",
        url: "https://resonanse.app/premium",
        ok: false,
      },
      {
        id: "ev-spa-2",
        at: isoHoursAgo(6),
        kind: "http",
        label: "V109 SPA fallback deployed",
        detail:
          "notFound handler now serves index.html for any GET/HEAD that is not /api/* or a real static file. 8/8 public routes HTTP 200 with no special headers.",
        url: "https://resonanse.app/premium",
        ok: true,
      },
    ],
  });

  mark("robots_ai", "done", "bot-orion", {
    evidence: [
      {
        id: "ev-rob-1",
        at: isoHoursAgo(48),
        kind: "http",
        label: "robots.txt welcomes AI crawlers",
        detail: "OAI-SearchBot, PerplexityBot, Googlebot, Bingbot allowed. Sitemap declared.",
        url: "https://resonanse.app/robots.txt",
        ok: true,
      },
    ],
  });

  mark("sitemap", "done", "bot-helios", {
    evidence: [
      {
        id: "ev-sm-1",
        at: isoHoursAgo(12),
        kind: "console",
        label: "GSC sitemap read — 8 URLs discovered",
        url: "https://resonanse.app/sitemap.xml",
        ok: true,
      },
    ],
  });

  mark("gsc_submit", "done", "bot-helios", {
    evidence: [
      {
        id: "ev-gsc-1",
        at: isoHoursAgo(10),
        kind: "console",
        label: "Domain property verified",
        detail: "/ indexed. /premium indexing requested. /guidelines crawled 8/29 3:54 PM — not yet indexed.",
        url: "https://search.google.com/search-console",
        ok: true,
      },
    ],
  });

  mark("bing_webmaster", "done", "bot-nimbus", {
    evidence: [
      {
        id: "ev-bing-1",
        at: isoHoursAgo(9),
        kind: "console",
        label: "Bing imported via GSC OAuth",
        detail: "Sitemap Success — 8 URLs, 0 errors.",
        url: "https://www.bing.com/webmasters",
        ok: true,
      },
    ],
  });

  mark("indexnow", "done", "bot-nimbus", {
    evidence: [
      {
        id: "ev-in-1",
        at: isoHoursAgo(8),
        kind: "http",
        label: "IndexNow key live + ping accepted",
        detail:
          "POST api.indexnow.org with 8 sitemap URLs → HTTP 200 Accepted. Key 22406cb37e296b837c68788f5454badc.txt",
        url: "https://resonanse.app/22406cb37e296b837c68788f5454badc.txt",
        ok: true,
      },
    ],
  });

  mark("app_health", "done", "bot-forge", {
    evidence: [
      {
        id: "ev-db-1",
        at: isoHoursAgo(14),
        kind: "note",
        label: "Production DB repaired",
        detail:
          "Created notifications, safe_dates, safe_date_checkins, emergency_contacts, safe_date_alerts, consent_records. 51/51 expected tables present. RLS enabled.",
        ok: true,
      },
    ],
  });

  mark("x_mentions", "assigned", "bot-lyra", {
    checklist: [
      { id: "x_mentions-1", label: "Draft #1 live from at least one account", done: true },
      { id: "x_mentions-2", label: "Drafts #2 and #3 scheduled 1–2 days apart", done: false },
      { id: "x_mentions-3", label: "Canonical URL present in each post", done: true },
    ],
    evidence: [
      {
        id: "ev-x-1",
        at: isoHoursAgo(5),
        kind: "mention",
        label: "Draft #1 live from 2 accounts",
        detail: "SafeDate police-station angle + link. Feeds Grok live search directly.",
        ok: true,
      },
    ],
  });

  mark("directories", "queued", "bot-vesper");
  mark("press", "queued", "bot-cassian", {
    evidence: [
      {
        id: "ev-pr-1",
        at: isoHoursAgo(7),
        kind: "note",
        label: "First organic inbound link",
        detail: "marketswarm.app → /guidelines confirmed by Google as referring page.",
        url: "https://resonanse.app/guidelines",
        ok: true,
      },
    ],
  });
  mark("monitor", "assigned", "bot-sentinel");

  const bots = FLEET_TEMPLATE.map((bot) => {
    const active = tasks.find(
      (t) => t.botId === bot.id && ["assigned", "running"].includes(t.status),
    );
    return {
      ...bot,
      status: active ? ("assigned" as const) : ("standby" as const),
      currentTaskId: active?.id,
      currentSiteId: active ? siteId : undefined,
      lastHeartbeat: isoHoursAgo(1),
    };
  });

  return {
    workspace: {
      id: "ws-resonance-labs",
      name: "Resonance Labs",
      plan: "enterprise",
      region: "us-east-1",
    },
    sites: [
      {
        id: siteId,
        workspaceId: "ws-resonance-labs",
        name: "Resonance",
        domain: "resonanse.app",
        url: "https://resonanse.app",
        status: "waiting",
        sitemapUrl: "https://resonanse.app/sitemap.xml",
        indexNowKey: "22406cb37e296b837c68788f5454badc",
        routes: [
          "/",
          "/premium",
          "/privacy",
          "/terms",
          "/cookies",
          "/guidelines",
          "/report",
          "/data",
        ],
        createdAt: isoHoursAgo(240),
        lastAuditAt: isoHoursAgo(4),
        scores: { technical: 96, submissions: 94, mentions: 42, overall: 79 },
        summary:
          "Technical foundation complete. Campaign is in crawl → index → cite. Mentions and press still drive AI-answer listings.",
      },
    ],
    bots,
    tasks,
    engines: ENGINE_MATRIX.map((e) => ({ ...e })),
    control: defaultControl(),
    activity: [
      {
        id: crypto.randomUUID(),
        at: isoHoursAgo(3),
        actor: "Grok Dispatcher",
        kind: "system",
        message:
          "Campaign status locked: technical doors closed. Waiting phase driven by inbound links and public mentions.",
        siteId,
      },
      {
        id: crypto.randomUUID(),
        at: isoHoursAgo(5),
        actor: "Lyra",
        kind: "mention",
        message: "Draft #1 posted from 2 X accounts — Grok live-search lever armed.",
        siteId,
        botId: "bot-lyra",
        taskId: "task-site-resonanse-x_mentions",
      },
      {
        id: crypto.randomUUID(),
        at: isoHoursAgo(6),
        actor: "Aether",
        kind: "audit",
        message:
          "SPA fallback V109 verified live. Google URL Inspection flipped from 404 to crawl allowed.",
        siteId,
        botId: "bot-aether",
        taskId: "task-site-resonanse-spa_fallback",
      },
      {
        id: crypto.randomUUID(),
        at: isoHoursAgo(8),
        actor: "Nimbus",
        kind: "index",
        message: "IndexNow accepted all 8 sitemap URLs (HTTP 200).",
        siteId,
        botId: "bot-nimbus",
        taskId: "task-site-resonanse-indexnow",
      },
      {
        id: crypto.randomUUID(),
        at: isoHoursAgo(9),
        actor: "Helios",
        kind: "index",
        message: "GSC sitemap ingested. Homepage on Google. /premium in priority crawl queue.",
        siteId,
        botId: "bot-helios",
        taskId: "task-site-resonanse-gsc_submit",
      },
      {
        id: crypto.randomUUID(),
        at: isoHoursAgo(14),
        actor: "Forge",
        kind: "system",
        message: "Production schema repaired — 51/51 tables. SafeDate sweep errors cleared.",
        siteId,
        botId: "bot-forge",
      },
      {
        id: crypto.randomUUID(),
        at: isoHoursAgo(30),
        actor: "Grok Dispatcher",
        kind: "dispatch",
        message:
          "Assigned 11 playbook tasks across 9 specialist bots for resonanse.app.",
        siteId,
      },
    ],
  };
}
