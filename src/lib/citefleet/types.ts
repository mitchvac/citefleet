export type TaskStatus =
  | "queued"
  | "assigned"
  | "running"
  | "blocked"
  | "done"
  | "failed";

export type BotStatus = "idle" | "assigned" | "working" | "blocked" | "standby";

export type SiteStatus =
  | "onboarding"
  | "auditing"
  | "campaign"
  | "waiting"
  | "indexed";

export type EngineId =
  | "google"
  | "bing"
  | "indexnow"
  | "chatgpt"
  | "copilot"
  | "perplexity"
  | "gemini"
  | "claude"
  | "grok"
  | "meta-ai";

export type PlaybookId =
  | "spa_fallback"
  | "robots_ai"
  | "sitemap"
  | "gsc_submit"
  | "bing_webmaster"
  | "indexnow"
  | "app_health"
  | "x_mentions"
  | "directories"
  | "press"
  | "monitor"
  | "botcentral_list";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  href?: string;
}

export interface Evidence {
  id: string;
  at: string;
  kind: "http" | "console" | "mention" | "note" | "dispatch" | "control";
  label: string;
  detail?: string;
  url?: string;
  ok?: boolean;
}

export interface EngineCoverage {
  engine: EngineId;
  label: string;
  primarySource: string;
  submissionDoor: string;
  lever: string;
  status: "covered" | "in-progress" | "waiting" | "blocked";
}

export interface SiteScores {
  technical: number;
  submissions: number;
  mentions: number;
  overall: number;
}

export interface Site {
  id: string;
  workspaceId: string;
  name: string;
  domain: string;
  url: string;
  status: SiteStatus;
  sitemapUrl: string;
  indexNowKey?: string;
  /** BotCentral proof-of-control token; must appear as botcentral-verify=<token> at the origin. */
  verifyToken?: string;
  /** Where the origin is hosted, from the last Live audit (DNS + response headers). */
  hosting?: import("./hosting-hint").HostingResult;
  /** Last pre-flight proof check (same rules BotCentral applies). */
  proof?: { proven: boolean; method: "well-known-file" | "dns-txt" | "none"; note: string; checkedAt: string };
  /** GitHub webhook intake for automatic listing (secret is shown to the operator). */
  webhook?: {
    secret: string;
    createdAt: string;
    lastEventAt?: string;
    lastEvent?: string;
    lastDelivery?: string;
    lastResult?: string;
    /** Recent delivery ids (GitHub retries / replays are answered without re-running the check). */
    recentDeliveries?: string[];
  };
  routes: string[];
  createdAt: string;
  lastAuditAt?: string;
  scores: SiteScores;
  summary: string;
  github?: {
    owner: string;
    repo: string;
    branch: string;
    root: string;
    lastPushAt?: string;
    lastPushSha?: string;
    lastPushUrl?: string;
  };
  botcentral?: {
    listed: boolean;
    /**
     * Whether the live card's proof still resolves on BotCentral's side.
     * BotCentral revalidates origins on its own schedule and answers
     * `verification.method: "unverified"` for a card whose proof has stopped
     * serving — the listing stays up, but it is no longer proven.
     * `undefined` means the card carried no verification block at all, which is
     * "unknown", not "unproven": it must never revoke anything on its own.
     */
    verified?: boolean;
    /** The method the card reports: "well-known-file", "dns-txt", "unverified", … */
    verificationMethod?: string;
    /** BotCentral's own words on the last proof check — the remediation to show. */
    verificationNote?: string;
    /**
     * BotCentral's crawl-priority score for this origin's home page (0-100) and
     * its six components, read straight off the card. Kept beside CiteFleet's
     * own `scores` so the two can be compared: they measure different things and
     * nothing else reconciles them.
     *
     * Deliberately NOT turned into a "gap" or a target here. Roughly 40 of the
     * 100 points (proof, freshness) are externally verified by BotCentral's
     * probe; the rest are publisher-declared, and some are only reachable by
     * conceding rights (`tdm: "open"` pays a point). Which of the remainder are
     * legitimate to pursue is a judgement about the customer's business, so the
     * per-component maxima stay BotCentral's to publish rather than ours to
     * guess.
     */
    quality?: number;
    rank?: Record<string, number>;
    href?: string;
    api?: string;
    updated?: string;
    summary?: string;
    error?: string;
  };
}

export interface Bot {
  id: string;
  name: string;
  callsign: string;
  role: string;
  specialty: string;
  playbookIds: PlaybookId[];
  engines: EngineId[];
  status: BotStatus;
  currentTaskId?: string;
  currentSiteId?: string;
  lastHeartbeat?: string;
}

export interface Task {
  id: string;
  siteId: string;
  botId?: string;
  playbookId: PlaybookId;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 1 | 2 | 3 | 4 | 5;
  checklist: ChecklistItem[];
  evidence: Evidence[];
  assignedBy?: "grok-dispatcher" | "operator";
  assignedAt?: string;
  updatedAt: string;
  completedAt?: string;
  blockedReason?: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  actor: string;
  kind:
    | "dispatch"
    | "audit"
    | "task"
    | "mention"
    | "system"
    | "index"
    | "security"
    | "control"
    | "monitor"
    | "reconcile";
  message: string;
  siteId?: string;
  botId?: string;
  taskId?: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: "enterprise";
  region: string;
  autopilot?: boolean;
  autopilotLastTickAt?: string;
  githubToken?: string;
}

export type ActDoor =
  | "catalog"
  | "mentions"
  | "submissions"
  | "spend"
  | "autopilot";

export interface KillSwitch {
  global: boolean;
  doors: Record<ActDoor, boolean>;
  reason: string;
  setBy: string;
  setAt: string | null;
}

export type ProbeKind = "ok" | "spa404" | "dead" | "payment402" | "error";

export interface ProbeRow {
  url: string;
  path: string;
  status: number | null;
  ms: number;
  kind: ProbeKind;
  contentType: string;
  note?: string;
}

export interface ReconcileCheck {
  id: string;
  ok: boolean;
  severity: "critical" | "warn" | "ok" | "info";
  title: string;
  detail: string;
}

export interface SiteMonitor {
  siteId: string;
  name: string;
  domain: string;
  url: string;
  at: string;
  probes: ProbeRow[];
  catalogListed: boolean;
  catalogHref?: string;
  catalogError?: string;
  sitemapHttps: boolean;
  sitemapUrlCount: number;
  wellKnown: boolean;
  llms: boolean;
  drift: boolean;
  checks: ReconcileCheck[];
  blockedByKill: boolean;
}

export interface PlatformHealth {
  at: string;
  citefleet: { ok: boolean; status: number | null; body?: string };
  botcentral: { ok: boolean; status: number | null; body?: string };
  catalogSearch: { ok: boolean; status: number | null };
}

export interface ControlJob {
  id: string;
  kind: "monitor" | "reconcile" | "cycle";
  at: string;
  ok: boolean;
  summary: string;
}

export interface ControlPlane {
  kill: KillSwitch;
  lastCycleAt?: string;
  lastMonitorAt?: string;
  lastReconcileAt?: string;
  snapshots: Record<string, SiteMonitor>;
  platform?: PlatformHealth;
  jobs: ControlJob[];
}

export interface StoreShape {
  workspace: Workspace;
  sites: Site[];
  bots: Bot[];
  tasks: Task[];
  activity: ActivityEvent[];
  engines: EngineCoverage[];
  control: ControlPlane;
}

export interface AuditFinding {
  id: string;
  severity: "critical" | "warn" | "ok" | "info";
  title: string;
  detail: string;
  playbookId?: PlaybookId;
}

export interface AuditResult {
  at: string;
  siteId: string;
  ok: boolean;
  findings: AuditFinding[];
  routeChecks: Array<{
    path: string;
    status: number | null;
    ms: number;
    spaFallbackRisk: boolean;
    kind?: ProbeKind;
    error?: string;
  }>;
  robots?: {
    ok: boolean;
    status: number | null;
    allowsAi: boolean;
    sitemapDeclared: boolean;
    snippet: string;
  };
  sitemap?: {
    ok: boolean;
    status: number | null;
    urlCount: number;
  };
  hosting?: import("./hosting-hint").HostingResult;
}
