import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Site, StoreShape } from "./types";

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

export function payloadUrl(origin = process.env.PUBLIC_ORIGIN || "https://citefleet.app"): string {
  return `${origin.replace(/\/$/, "")}${GITHUB_HOOK_PATH}`;
}

export function deployedUrl(origin = process.env.PUBLIC_ORIGIN || "https://citefleet.app"): string {
  return `${origin.replace(/\/$/, "")}${DEPLOYED_HOOK_PATH}`;
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

export type HookAction = "ping" | "check" | "ignore";

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
  if (!site || !site.webhook?.secret) {
    return { status: 404, body: { error: "no property is attached to this repository with a webhook secret" } };
  }
  if (!verifyGithubSignature(input.rawBody, input.header("x-hub-signature-256"), site.webhook.secret)) {
    return { status: 401, body: { error: "signature mismatch" } };
  }
  const event = input.header("x-github-event");
  const delivery = input.header("x-github-delivery") || undefined;
  const { action, reason } = classifyGithubEvent(event, payload, site);
  const at = (deps.now ?? (() => new Date()))().toISOString();
  await deps.mutateStore((s) => {
    const current = s.sites.find((x) => x.id === site.id);
    if (!current?.webhook) return;
    current.webhook.lastEventAt = at;
    current.webhook.lastEvent = `${event || "unknown"} · ${reason}`;
    current.webhook.lastDelivery = delivery;
    s.activity.unshift({
      id: crypto.randomUUID(),
      at,
      actor: "GitHub",
      kind: "system",
      siteId: site.id,
      message:
        action === "check"
          ? `Webhook received for ${site.domain} (${reason}). Checking the origin proof, then listing.`
          : `Webhook received for ${site.domain} (${reason}) — ignored.`,
    });
  });
  if (action === "check") deps.onCheck(site.id, reason);
  return { status: action === "ping" ? 200 : 202, body: { ok: true, action, reason, site: site.domain } };
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
  if (!site || !site.webhook?.secret) {
    return { status: 404, body: { error: "no property with a webhook secret for this domain" } };
  }
  if (!verifyGithubSignature(input.rawBody, input.header("x-citefleet-signature"), site.webhook.secret)) {
    return { status: 401, body: { error: "signature mismatch" } };
  }
  const at = (deps.now ?? (() => new Date()))().toISOString();
  await deps.mutateStore((s) => {
    const current = s.sites.find((x) => x.id === site.id);
    if (!current?.webhook) return;
    current.webhook.lastEventAt = at;
    current.webhook.lastEvent = "deployed hook · deploy reported";
    current.webhook.lastDelivery = input.header("x-citefleet-delivery") || undefined;
    s.activity.unshift({
      id: crypto.randomUUID(),
      at,
      actor: "CI",
      kind: "system",
      siteId: site.id,
      message: `Deploy hook received for ${site.domain}. Checking the origin proof, then listing.`,
    });
  });
  deps.onCheck(site.id, "deploy hook");
  return { status: 202, body: { ok: true, action: "check", reason: "deploy hook", site: site.domain } };
}
