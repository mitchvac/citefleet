import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Site, StoreShape } from "./types";
import type { ListingStatus, ListingTransition } from "./botcentral.ts";
import { describeTerm, readTerm } from "./listing-term.ts";

/**
 * GitHub webhook intake for automatic listing. A customer (or our own repos)
 * points a repository webhook at /api/hooks/github with a per-property secret.
 * We verify the HMAC signature GitHub puts in X-Hub-Signature-256, accept only
 * a push to the attached branch or a successful deployment_status, and then
 * run the proof check (with retries, because deploys lag pushes) followed by
 * the normal publish. Everything else is answered and ignored.
 */

export const GITHUB_HOOK_PATH = "/api/hooks/github";
export const DEPLOYED_HOOK_PATH = "/api/hooks/deployed";
export const BOTCENTRAL_HOOK_PATH = "/api/hooks/botcentral";

export function payloadUrl(origin = process.env.PUBLIC_ORIGIN || "https://citefleet.app"): string {
  return `${origin.replace(/\/$/, "")}${GITHUB_HOOK_PATH}`;
}

export function deployedUrl(origin = process.env.PUBLIC_ORIGIN || "https://citefleet.app"): string {
  return `${origin.replace(/\/$/, "")}${DEPLOYED_HOOK_PATH}`;
}

export function botcentralHookUrl(origin = process.env.PUBLIC_ORIGIN || "https://citefleet.app"): string {
  return `${origin.replace(/\/$/, "")}${BOTCENTRAL_HOOK_PATH}`;
}

/**
 * What BotCentral signs its webhooks with (its src/lib/publisher.ts
 * `webhookSecret`): BOTCENTRAL_WEBHOOK_SECRET when set, else the publisher's
 * own token — which for CiteFleet is the shared BOTCENTRAL_SERVICE_TOKEN.
 * Verified live 2026-09-06: the secret is unset on botcentral.org and the
 * service token is identical on both boxes. Empty means fail closed.
 */
export function botcentralHookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.BOTCENTRAL_WEBHOOK_SECRET?.trim() || env.BOTCENTRAL_SERVICE_TOKEN?.trim() || "";
}

export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

export function signGithubPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyGithubSignature(rawBody: string, header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(signGithubPayload(rawBody, secret));
  const given = Buffer.from(header.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type HookAction = "ping" | "check" | "ignore" | "duplicate" | "in-progress";

const UNAUTHORIZED: HookResponse = { status: 401, body: { error: "unauthorized" } };
// A secret to compare against when no property matches, so the response time
// does not reveal whether the repository or domain is attached.
const DECOY_SECRET = "no-such-property-" + "x".repeat(32);
const RECENT_DELIVERIES = 50;

/** Site ids with a proof check + publish currently running (one at a time per site). */
const inFlight = new Set<string>();
export function beginCheck(siteId: string): boolean {
  if (inFlight.has(siteId)) return false;
  inFlight.add(siteId);
  return true;
}
export function endCheck(siteId: string) {
  inFlight.delete(siteId);
}
export function isChecking(siteId: string): boolean {
  return inFlight.has(siteId);
}
export function checksInFlight(): number {
  return inFlight.size;
}

export function isDuplicateDelivery(site: Pick<Site, "webhook">, delivery: string | undefined): boolean {
  return Boolean(delivery && site.webhook?.recentDeliveries?.includes(delivery));
}
function rememberDelivery(site: Site, delivery: string | undefined) {
  if (!delivery || !site.webhook) return;
  const list = (site.webhook.recentDeliveries ?? []).filter((d) => d !== delivery);
  list.unshift(delivery);
  site.webhook.recentDeliveries = list.slice(0, RECENT_DELIVERIES);
}

export function classifyGithubEvent(
  event: string | null | undefined,
  payload: Record<string, unknown>,
  site: Pick<Site, "github">,
): { action: HookAction; reason: string } {
  const branch = site.github?.branch || "main";
  if (event === "ping") return { action: "ping", reason: "GitHub ping" };
  if (event === "push") {
    const ref = typeof payload.ref === "string" ? payload.ref : "";
    return ref === `refs/heads/${branch}`
      ? { action: "check", reason: `push to ${branch}` }
      : { action: "ignore", reason: `push to ${ref || "unknown ref"}, not ${branch}` };
  }
  if (event === "deployment_status") {
    const status = payload.deployment_status as { state?: string } | undefined;
    return status?.state === "success"
      ? { action: "check", reason: "deployment succeeded" }
      : { action: "ignore", reason: `deployment_status ${status?.state ?? "unknown"}` };
  }
  return { action: "ignore", reason: `${event || "unknown"} event` };
}

export function repoFullName(payload: Record<string, unknown>): string {
  const repo = payload.repository as { full_name?: string } | undefined;
  return (repo?.full_name || "").toLowerCase();
}

export function siteForRepo(store: Pick<StoreShape, "sites">, fullName: string): Site | undefined {
  if (!fullName) return undefined;
  return store.sites.find(
    (s) => s.github && `${s.github.owner}/${s.github.repo}`.toLowerCase() === fullName,
  );
}

export interface HookDeps {
  getStore: () => Promise<StoreShape>;
  mutateStore: (fn: (store: StoreShape) => void) => Promise<unknown>;
  /** Fire-and-forget: proof check with retries, then publish. */
  onCheck: (siteId: string, reason: string) => void;
  now?: () => Date;
}

export interface HookResponse {
  status: number;
  body: Record<string, unknown>;
}

export async function handleGithubWebhook(
  input: { rawBody: string; header: (name: string) => string | null },
  deps: HookDeps,
): Promise<HookResponse> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "body is not JSON (set the webhook content type to application/json)" } };
  }
  const store = await deps.getStore();
  const site = siteForRepo(store, repoFullName(payload));
  // Unknown repository and bad signature answer identically (no existence oracle).
  const secret = site?.webhook?.secret || DECOY_SECRET;
  const valid = verifyGithubSignature(input.rawBody, input.header("x-hub-signature-256"), secret);
  if (!site?.webhook?.secret || !valid) return UNAUTHORIZED;
  const event = input.header("x-github-event");
  const delivery = input.header("x-github-delivery") || undefined;
  const classified = classifyGithubEvent(event, payload, site);
  if (classified.action !== "ping" && isDuplicateDelivery(site, delivery)) {
    return { status: 202, body: { ok: true, action: "duplicate", reason: "delivery already processed", site: site.domain } };
  }
  return finishDelivery(deps, site, { event: event || "unknown", delivery, actor: "GitHub", ...classified });
}

async function finishDelivery(
  deps: HookDeps,
  site: Site,
  d: { event: string; delivery?: string; actor: string; action: HookAction; reason: string },
): Promise<HookResponse> {
  // Decide before writing, hold the in-flight slot only after the write
  // succeeded: a failed persist must not leave the site "checking" forever.
  let action: HookAction = d.action === "check" && isChecking(site.id) ? "in-progress" : d.action;
  const at = (deps.now ?? (() => new Date()))().toISOString();
  await deps.mutateStore((s) => {
    const current = s.sites.find((x) => x.id === site.id);
    if (!current?.webhook) return;
    current.webhook.lastEventAt = at;
    current.webhook.lastEvent = `${d.event} · ${d.reason}`;
    current.webhook.lastDelivery = d.delivery;
    rememberDelivery(current, d.delivery);
    s.activity.unshift({
      id: crypto.randomUUID(),
      at,
      actor: d.actor,
      kind: "system",
      siteId: site.id,
      message:
        action === "check"
          ? `${d.actor} hook received for ${site.domain} (${d.reason}). Checking the origin proof, then listing.`
          : action === "in-progress"
            ? `${d.actor} hook received for ${site.domain} (${d.reason}) — a proof check is already running; it will pick up the new deploy.`
            : `${d.actor} hook received for ${site.domain} (${d.reason}) — ignored.`,
    });
  });
  if (action === "check") {
    if (beginCheck(site.id)) deps.onCheck(site.id, d.reason);
    else action = "in-progress"; // lost a race with a concurrent delivery
  }
  return { status: action === "ping" ? 200 : 202, body: { ok: true, action, reason: d.reason, site: site.domain } };
}

/**
 * Generic "deployed" hook for any CI or host that is not GitHub: after a
 * successful deploy, POST {"domain": "<domain>"} signed with the same
 * per-property secret (X-CiteFleet-Signature: sha256=HMAC-SHA256(body)).
 * Same outcome as a GitHub push: proof check with retries, then publish.
 */
export async function handleDeployedHook(
  input: { rawBody: string; header: (name: string) => string | null },
  deps: HookDeps,
): Promise<HookResponse> {
  let payload: { domain?: unknown };
  try {
    payload = JSON.parse(input.rawBody) as { domain?: unknown };
  } catch {
    return { status: 400, body: { error: 'body must be JSON like {"domain":"example.com"}' } };
  }
  const domain = typeof payload.domain === "string" ? payload.domain.trim().toLowerCase().replace(/^www\./, "") : "";
  if (!domain) return { status: 400, body: { error: "domain is required" } };
  const store = await deps.getStore();
  const site = store.sites.find((s) => s.domain.replace(/^www\./, "").toLowerCase() === domain);
  const secret = site?.webhook?.secret || DECOY_SECRET;
  const valid = verifyGithubSignature(input.rawBody, input.header("x-citefleet-signature"), secret);
  if (!site?.webhook?.secret || !valid) return UNAUTHORIZED;
  const delivery = input.header("x-citefleet-delivery") || undefined;
  if (isDuplicateDelivery(site, delivery)) {
    return { status: 202, body: { ok: true, action: "duplicate", reason: "delivery already processed", site: site.domain } };
  }
  return finishDelivery(deps, site, { event: "deployed", delivery, actor: "CI", action: "check", reason: "deploy reported" });
}

/**
 * BotCentral → CiteFleet. The catalog tells whoever listed a host when its
 * card changes without a publish: the 6-hour recheck downgraded or restored
 * it (site.reverified), its paid year ended (site.lapsed), a publisher
 * removed it (site.unpublished), or a publish landed (site.listed).
 *
 * Contract (BotCentral src/lib/publisher.ts `notifyPublisher`): POST, headers
 * `x-botcentral-event` and `x-botcentral-signature: sha256=<HMAC-SHA256 of the
 * raw body>`, body `{botcentral, event, created, publisher, domain, href,
 * verification, [term]}`. There is no delivery id; applying the same answer
 * twice is a no-op because `listingTransition` only moves a task that is not
 * already where the answer says it should be.
 *
 * A signed event for a host that is not a CiteFleet property is acknowledged
 * and ignored — BotCentral's seed fixtures fail every pass and would otherwise
 * be eight audit-log lines a day about sites nobody here owns.
 */
export const BOTCENTRAL_EVENTS = ["site.listed", "site.unpublished", "site.reverified", "site.lapsed"] as const;
/** Matches `publisherReady()`'s floor on the service token, which is the default secret. */
export const MIN_HOOK_SECRET = 16;
export type BotcentralEvent = (typeof BOTCENTRAL_EVENTS)[number];

function isBotcentralEvent(value: unknown): value is BotcentralEvent {
  return typeof value === "string" && (BOTCENTRAL_EVENTS as readonly string[]).includes(value);
}

export interface CatalogHookDeps {
  getStore: () => Promise<StoreShape>;
  mutateStore: (fn: (store: StoreShape) => void) => Promise<unknown>;
  /** `applyCatalogState` from botcentral.ts — injected so this module stays free of the store. */
  apply: (store: StoreShape, site: Site, listing: ListingStatus, opts: { now: string }) => ListingTransition;
  /** Where cards live, for the inspector link (`${catalog}/site/${domain}`). */
  catalogUrl: string;
  /** Defaults to `botcentralHookSecret()`; tests inject. */
  secret?: string;
  now?: () => Date;
}

function verificationOf(payload: Record<string, unknown>): Pick<ListingStatus, "verified" | "verificationMethod" | "verificationNote"> {
  const block = payload.verification;
  if (!block || typeof block !== "object") return { verified: undefined, verificationMethod: undefined, verificationNote: undefined };
  const { method, note } = block as { method?: unknown; note?: unknown };
  const verificationMethod = typeof method === "string" ? method : undefined;
  const verificationNote = typeof note === "string" ? note : undefined;
  return {
    verified: verificationMethod ? verificationMethod !== "unverified" : undefined,
    verificationMethod,
    verificationNote,
  };
}

export async function handleBotcentralWebhook(
  input: { rawBody: string; header: (name: string) => string | null },
  deps: CatalogHookDeps,
): Promise<HookResponse> {
  // Same floor /health reports (`catalogHookSecret`): a secret shorter than the
  // service token's minimum is "not configured", whoever supplied it.
  const secret = (deps.secret ?? botcentralHookSecret()).trim();
  // Same `sha256=` hex format GitHub uses, so the same verifier applies.
  if (secret.length < MIN_HOOK_SECRET || !verifyGithubSignature(input.rawBody, input.header("x-botcentral-signature"), secret)) {
    return UNAUTHORIZED;
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "body is not JSON" } };
  }
  const event = payload.event;
  const headerEvent = input.header("x-botcentral-event");
  // BotCentral always sends the header (publisher.ts `notifyPublisher`); a
  // body that names an event its header does not is not BotCentral.
  if (!isBotcentralEvent(event) || headerEvent !== event) {
    return { status: 400, body: { error: "unknown or mismatched event" } };
  }
  const domain = typeof payload.domain === "string" ? payload.domain.trim().toLowerCase().replace(/^www\./, "") : "";
  if (!domain) return { status: 400, body: { error: "domain is required" } };

  const store = await deps.getStore();
  const site = store.sites.find((s) => s.domain.replace(/^www\./, "").toLowerCase() === domain);
  if (!site) {
    return { status: 202, body: { ok: true, action: "ignore", event, reason: "not a CiteFleet property", domain } };
  }

  const at = (deps.now ?? (() => new Date()))().toISOString();
  const base = deps.catalogUrl.replace(/\/$/, "");
  const term = event === "site.lapsed" ? readTerm(payload.term) : undefined;
  const verification = verificationOf(payload);
  const answer: ListingStatus =
    event === "site.unpublished"
      ? { listed: false }
      : {
          listed: true,
          ...verification,
          // A lapse is not a proof failure the origin can fix; say what renews it.
          verificationNote:
            event === "site.lapsed" && term
              ? `${verification.verificationNote ?? ""} ${describeTerm(term, Date.parse(at))}`.trim()
              : verification.verificationNote,
          href: `${base}/site/${domain}`,
          api: `${base}/v1/site/${domain}`,
          updated: typeof payload.created === "string" ? payload.created : at,
        };

  let move: ListingTransition = "none";
  await deps.mutateStore((s) => {
    const current = s.sites.find((x) => x.id === site.id);
    if (!current) return;
    current.catalogHook = { lastEventAt: at, lastEvent: event };
    current.botcentral = answer.listed
      ? { ...(current.botcentral ?? { listed: false }), ...answer, error: undefined }
      : { ...(current.botcentral ?? {}), listed: false, verified: undefined, verificationMethod: undefined, error: undefined };
    if (term) current.term = { ...term, at, source: "webhook" };
    if (event === "site.listed") current.payment = undefined;
    move = deps.apply(s, current, answer, { now: at });
    s.activity.unshift({
      id: crypto.randomUUID(),
      at,
      actor: "botcentral",
      kind: "system",
      siteId: site.id,
      message:
        event === "site.lapsed"
          ? `BotCentral ${event} for ${site.domain}: ${describeTerm(term, Date.parse(at)) || "listing year ended"}`
          : `BotCentral ${event} for ${site.domain}: ${answer.listed ? (answer.verificationMethod ?? "verification unknown") : "card removed"}${answer.verificationNote ? ` — ${answer.verificationNote}` : ""}`,
    });
  });
  return { status: 202, body: { ok: true, action: move, event, site: site.domain } };
}
