import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readEntriJobId } from "./dns-provider.ts";
import { beginCheck, endCheck, type HookResponse } from "./webhook.ts";
import { normalizeDomain } from "./verify-token.ts";
import type { Site, StoreShape } from "./types.ts";

export const ENTRI_HOOK_PATH = "/api/hooks/entri";
export const ENTRI_SIGNATURE_MAX_AGE_SECONDS = 300;

const ENTRI_EVENTS = [
  "domain.added",
  "domain.flow.completed",
  "domain.propagation.timeout",
] as const;
const RECENT_EVENT_IDS = 50;

type EntriEvent = (typeof ENTRI_EVENTS)[number];

export interface EntriHookTarget {
  getStore: () => Promise<StoreShape>;
  mutateStore: <T>(fn: (store: StoreShape) => T) => Promise<T>;
  onCheck: (
    siteId: string,
    reason: string,
    context: { jobId: string; inFlightKey: string },
  ) => void;
}

export interface EntriHookDeps {
  resolveTarget: (domain: string, jobId: string) => Promise<EntriHookTarget>;
  secret?: string;
  now?: () => Date;
}

export function entriHookSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.CITEFLEET_ENTRI_SECRET?.trim() || "";
}

export function entriHookUrl(
  origin = process.env.PUBLIC_ORIGIN || process.env.CITEFLEET_PUBLIC_URL || "https://citefleet.app",
): string {
  return `${origin.replace(/\/$/, "")}${ENTRI_HOOK_PATH}`;
}

export function signEntriPayload(rawBody: string, timestamp: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

export function verifyEntriSignature(
  rawBody: string,
  timestampHeader: string | null | undefined,
  signatureHeader: string | null | undefined,
  secret: string,
  now: Date,
): boolean {
  const timestampText = timestampHeader?.trim() || "";
  const signature = signatureHeader?.trim() || "";
  if (!secret || !/^\d+$/.test(timestampText) || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return false;
  }
  const timestamp = Number(timestampText);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now.getTime() / 1000 - timestamp) > ENTRI_SIGNATURE_MAX_AGE_SECONDS
  ) {
    return false;
  }
  const expected = Buffer.from(signEntriPayload(rawBody, timestampText, secret));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function isEntriEvent(value: unknown): value is EntriEvent {
  return typeof value === "string" && (ENTRI_EVENTS as readonly string[]).includes(value);
}

function shortText(value: unknown, max = 200): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/\p{Cc}/gu, " ");
  return clean ? clean.slice(0, max) : undefined;
}

function validDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const domain = normalizeDomain(value).replace(/\.+$/, "");
  const labels = domain.split(".");
  return domain.length <= 253 &&
    labels.length >= 2 &&
    labels.every(
      (label) =>
        label.length >= 1 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
    ? domain
    : null;
}

/** Entri sends a zone in `domain` and, when present, its relative subdomain separately. */
function webhookDomain(domainValue: unknown, subdomainValue: unknown): string | null {
  const domain = validDomain(domainValue);
  if (!domain) return null;
  if (subdomainValue === undefined || subdomainValue === null || subdomainValue === "") {
    return domain;
  }
  if (typeof subdomainValue !== "string") return null;
  const subdomain = subdomainValue.trim().toLowerCase();
  const labels = subdomain.split(".");
  if (
    subdomain.length > 253 ||
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return null;
  }
  // Some Entri payload variants already carry the full configured host in
  // `domain`; do not duplicate the relative label in that case.
  return validDomain(domain.startsWith(`${subdomain}.`) ? domain : `${subdomain}.${domain}`);
}

function correlated(setup: NonNullable<Site["dnsSetup"]>, jobId: string): boolean {
  return jobId === setup.jobId;
}

function nextStatus(
  current: NonNullable<Site["dnsSetup"]>["status"],
  event: EntriEvent,
  shouldCheck: boolean,
): NonNullable<Site["dnsSetup"]>["status"] {
  // A provider callback cannot overturn CiteFleet's independent live check.
  if (current === "verified") return current;
  if (shouldCheck) return "propagated";
  if (event === "domain.propagation.timeout") return "failed";
  if (event === "domain.flow.completed") {
    return current === "propagated" || current === "failed" ? current : "flow-completed";
  }
  return current === "propagated" ? current : "propagating";
}

export async function handleEntriWebhook(
  input: { rawBody: string; header: (name: string) => string | null },
  deps: EntriHookDeps,
): Promise<HookResponse> {
  const now = (deps.now ?? (() => new Date()))();
  const secret = (deps.secret ?? entriHookSecret()).trim();
  if (
    !verifyEntriSignature(
      input.rawBody,
      input.header("entri-timestamp"),
      input.header("entri-signature-v3"),
      secret,
      now,
    )
  ) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(input.rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: 400, body: { error: "body must be a JSON object" } };
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "body is not JSON" } };
  }
  const event = payload.type;
  const domain = webhookDomain(payload.domain, payload.subdomain);
  const eventId = shortText(payload.id);
  const jobId = readEntriJobId(payload.job_id);
  if (!isEntriEvent(event) || !domain || !eventId || !jobId) {
    return { status: 400, body: { error: "invalid event, domain, id, or job_id" } };
  }

  const target = await deps.resolveTarget(domain, jobId);
  const store = await target.getStore();
  const domainSites = store.sites.filter(
    (candidate) => normalizeDomain(candidate.domain) === domain,
  );
  const site = domainSites.find(
    (candidate) => candidate.dnsSetup && correlated(candidate.dnsSetup, jobId),
  );
  if (!site?.dnsSetup) {
    return {
      status: 202,
      body: {
        ok: true,
        action: "ignore",
        event,
        reason: domainSites.length
          ? "setup correlation did not match"
          : "no matching CiteFleet DNS setup",
      },
    };
  }

  const propagation = shortText(payload.propagation_status, 24);
  const provider = shortText(payload.provider, 100);
  const deliveryKey = `${eventId}:${event}:${propagation ?? ""}`;
  if (site.dnsSetup.recentEvents?.includes(deliveryKey)) {
    return { status: 202, body: { ok: true, action: "duplicate", event } };
  }
  const propagationSucceeded = event === "domain.added" && propagation === "success";
  const at = now.toISOString();

  const outcome = await target.mutateStore((next) => {
    const current = next.sites.find((candidate) => candidate.id === site.id);
    if (!current?.dnsSetup || !correlated(current.dnsSetup, jobId)) {
      return { action: "ignore" as const, shouldCheck: false };
    }
    if (current.dnsSetup.recentEvents?.includes(deliveryKey)) {
      return { action: "duplicate" as const, shouldCheck: false };
    }
    const shouldCheck = propagationSucceeded && current.dnsSetup.status !== "verified";
    const status = nextStatus(current.dnsSetup.status, event, shouldCheck);
    const preserveIndependentResult =
      status === current.dnsSetup.status &&
      (status === "verified" || status === "propagated") &&
      !shouldCheck;
    const recentEvents = (current.dnsSetup.recentEvents ?? []).filter(
      (candidate) => candidate !== deliveryKey,
    );
    recentEvents.unshift(deliveryKey);
    current.dnsSetup = {
      ...current.dnsSetup,
      status,
      updatedAt: at,
      lastEvent: event,
      lastEventId: eventId,
      recentEvents: recentEvents.slice(0, RECENT_EVENT_IDS),
      provider: provider ?? current.dnsSetup.provider,
      lastResult: preserveIndependentResult
        ? current.dnsSetup.lastResult
        : event === "domain.propagation.timeout"
          ? "Entri did not observe propagation within its retry window."
          : shouldCheck
            ? "Entri reported propagation; CiteFleet queued its own proof check."
            : `Entri reported ${event}${propagation ? ` (${propagation})` : ""}.`,
    };
    next.activity.unshift({
      id: randomUUID(),
      at,
      actor: "Entri",
      kind: "system",
      siteId: site.id,
      message: shouldCheck
        ? `Entri reported DNS propagation for ${site.domain}. CiteFleet is verifying the live proof before listing.`
        : `Entri ${event} for ${site.domain}${propagation ? ` (${propagation})` : ""}.`,
    });
    return { action: "recorded" as const, shouldCheck };
  });

  if (outcome.action === "ignore") {
    return {
      status: 202,
      body: { ok: true, action: "ignore", event, reason: "setup correlation changed" },
    };
  }
  if (outcome.action === "duplicate") {
    return { status: 202, body: { ok: true, action: "duplicate", event } };
  }

  if (!outcome.shouldCheck) {
    return { status: 202, body: { ok: true, action: "recorded", event } };
  }
  const inFlightKey = `entri:${site.id}:${jobId}`;
  if (!beginCheck(inFlightKey)) {
    return { status: 202, body: { ok: true, action: "in-progress", event } };
  }
  try {
    target.onCheck(site.id, "Entri DNS propagation", { jobId, inFlightKey });
  } catch (error) {
    endCheck(inFlightKey);
    throw error;
  }
  return { status: 202, body: { ok: true, action: "check", event } };
}
