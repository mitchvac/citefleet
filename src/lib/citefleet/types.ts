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
}

export interface Evidence {
  id: string;
  at: string;
  kind: "http" | "console" | "mention" | "note" | "dispatch";
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
  routes: string[];
  createdAt: string;
  lastAuditAt?: string;
  scores: SiteScores;
  summary: string;
  botcentral?: {
    listed: boolean;
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
    | "security";
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
}

export interface StoreShape {
  workspace: Workspace;
  sites: Site[];
  bots: Bot[];
  tasks: Task[];
  activity: ActivityEvent[];
  engines: EngineCoverage[];
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
}
