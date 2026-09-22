import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  DISCOVERY_MAX_BYTES,
  DISCOVERY_VERSION,
  discoveryUrl,
  exactObject,
  parseDiscoveryRecord,
  type DiscoveryRecord,
  type DiscoveryReceipt,
  type DiscoverySubmission,
} from "./discovery.ts";
import type { WorkspaceHandle } from "./workspace-handle.ts";
import type { Site } from "./types.ts";
import { packFiles } from "./originPack.ts";
import { createSiteVerifyToken } from "./verify-token.ts";
import { cleanIndexNowKey } from "./indexnow.ts";
import { assertCanAct } from "./control.ts";
import { billingPrefixFor } from "./botcentral.ts";
import { readWebhookBody } from "./webhook-body.server.ts";
import { workspaceForDiscoveryDigest } from "./workspace-registry.server.ts";

export const discoveryDigest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export interface DiscoveryRequest {
  version: typeof DISCOVERY_VERSION;
  mode: "hosted";
  publisherRecordId: string;
  revision: number;
  record: DiscoveryRecord;
  originOwnership: "observed" | "unknown";
  files: Array<{ path: string; content: string; sha256: string }>;
  keyPrefix?: string;
  digest: string;
  idempotencyKey: string;
}
export function buildDiscoveryRequest(
  site: Site,
  record: DiscoveryRecord,
  workspaceId: string,
  revision = 1,
): DiscoveryRequest {
  const safe = parseDiscoveryRecord(record);
  if (!cleanIndexNowKey(site.indexNowKey)) throw new Error("IndexNow key required.");
  const selected: Site = {
    ...site,
    name: safe.name,
    summary: safe.summary,
    url: safe.url,
    domain: new URL(safe.url).hostname,
    sitemapUrl: `${safe.url}/sitemap.xml`,
    routes: [...new Set(["/", ...safe.pages.map((page) => new URL(page.url).pathname)])],
  };
  const files = packFiles(selected).map((file) => ({
    ...file,
    sha256: discoveryDigest(file.content),
  }));
  if (files.length !== 5) throw new Error("Discovery requires exactly five files.");
  const keyPrefix = billingPrefixFor(site);
  const publisherRecordId = discoveryDigest(`${workspaceId}\n${site.id}`);
  const body = {
    publisherRecordId,
    version: DISCOVERY_VERSION,
    mode: "hosted" as const,
    record: safe,
    originOwnership: site.proof?.proven ? ("observed" as const) : ("unknown" as const),
    files,
    ...(keyPrefix ? { keyPrefix } : {}),
  };
  const digest = discoveryDigest(JSON.stringify(body));
  const request = {
    ...body,
    revision,
    digest,
    idempotencyKey: discoveryDigest(`${publisherRecordId}\n${revision}\n${digest}`),
  };
  if (Buffer.byteLength(JSON.stringify(request)) > DISCOVERY_MAX_BYTES)
    throw new Error("Discovery request exceeds 64 KiB.");
  return request;
}
function remoteOrigin(): string {
  return discoveryUrl(process.env.BOTCENTRAL_URL || "https://botcentral.org", true);
}
export function settingsDiscovery() {
  return {
    configured: (process.env.BOTCENTRAL_SERVICE_TOKEN?.trim().length ?? 0) >= 16,
    endpoint: "/api/discovery/submissions",
  };
}
export async function rotateDiscoveryKey(ws: WorkspaceHandle) {
  const token = `cfd_${randomBytes(32).toString("hex")}`;
  const key = { digest: discoveryDigest(token), createdAt: new Date().toISOString() };
  await ws.mutate((store) => {
    store.workspace.discoveryKey = key;
  });
  return { token };
}
export async function revokeDiscoveryKey(ws: WorkspaceHandle) {
  await ws.mutate((store) => {
    delete store.workspace.discoveryKey;
  });
  return { revoked: true };
}
export function readDiscoveryReceipt(
  value: unknown,
  request: DiscoveryRequest,
  origin: string,
): DiscoveryReceipt {
  const obj = exactObject(value, [
    "version",
    "status",
    "publisherRecordId",
    "revision",
    "idempotencyKey",
    "digest",
    "url",
    "files",
  ]);
  if (
    obj.publisherRecordId !== request.publisherRecordId ||
    obj.revision !== request.revision ||
    obj.version !== DISCOVERY_VERSION ||
    obj.status !== "accepted" ||
    obj.idempotencyKey !== request.idempotencyKey ||
    obj.digest !== request.digest ||
    !Array.isArray(obj.files) ||
    obj.files.length !== 5
  )
    throw new Error("Invalid discovery receipt.");
  const remoteUrl = (value: unknown) => {
    const url = discoveryUrl(value);
    if (new URL(url).origin !== origin) throw new Error("Receipt URL is outside BotCentral.");
    return url;
  };
  const paths = new Set<string>();
  const files = obj.files.map((value) => {
    const file = exactObject(value, ["path", "sha256", "url"]);
    const expected = request.files.find((f) => f.path === file.path);
    if (!expected || expected.sha256 !== file.sha256 || paths.has(expected.path))
      throw new Error("Receipt does not match the five files.");
    paths.add(expected.path);
    return { path: expected.path, sha256: expected.sha256, url: remoteUrl(file.url) };
  });
  return {
    version: DISCOVERY_VERSION,
    status: "accepted",
    publisherRecordId: request.publisherRecordId,
    revision: request.revision,
    digest: request.digest,
    idempotencyKey: request.idempotencyKey,
    url: remoteUrl(obj.url),
    files,
  };
}
export interface DiscoveryIO {
  fetch: typeof fetch;
  origin: string;
  token: string;
}
class DiscoveryDeliveryError extends Error {}
export async function forwardDiscovery(
  request: DiscoveryRequest,
  io: DiscoveryIO,
): Promise<DiscoveryReceipt> {
  const origin = discoveryUrl(io.origin, true);
  if (io.token.length < 16)
    throw new DiscoveryDeliveryError("BotCentral discovery service is not configured.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let receivedResponse = false;
    try {
      const response = await io.fetch(`${origin}/internal/discovery`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${io.token}`,
          "idempotency-key": request.idempotencyKey,
        },
        body: JSON.stringify(request),
      });
      receivedResponse = true;
      if ([429, 502, 503, 504].includes(response.status) && attempt === 0) {
        await response.body?.cancel();
        continue;
      }
      if (![200, 201].includes(response.status))
        throw new DiscoveryDeliveryError(
          response.status === 404
            ? "BotCentral discovery endpoint is not available (HTTP 404)."
            : `BotCentral discovery HTTP ${response.status}.`,
        );
      if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || ""))
        throw new Error("BotCentral did not return a JSON receipt.");
      const body = await readWebhookBody(response, DISCOVERY_MAX_BYTES);
      if (!body.ok) throw new Error("Invalid or oversized discovery receipt.");
      return readDiscoveryReceipt(JSON.parse(body.rawBody), request, origin);
    } catch (error) {
      if (
        attempt === 0 &&
        (controller.signal.aborted || (!receivedResponse && error instanceof TypeError))
      )
        continue;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("BotCentral discovery delivery failed.");
}
export async function submitDiscovery(
  ws: WorkspaceHandle,
  siteId: string | undefined,
  input: unknown,
  io?: DiscoveryIO,
  capabilityDigest?: string,
) {
  const record = parseDiscoveryRecord(input);
  const operationId = randomUUID();
  const generatedSiteId = randomUUID();
  const generatedVerifyToken = createSiteVerifyToken();
  const generatedKey = randomBytes(16).toString("hex");
  const at = new Date().toISOString();
  const prepared = await ws.mutate((store) => {
    // Return a denial through CAS so an old cached digest cannot reject a newly rotated key.
    if (capabilityDigest && store.workspace.discoveryKey?.digest !== capabilityDigest)
      return { denied: true as const };
    let site = siteId ? store.sites.find((s) => s.id === siteId) : undefined;
    if (siteId && !site) throw new Error("Website not found.");
    if (!siteId) {
      const matches = store.sites.filter((s) => s.url.replace(/\/$/, "") === record.url);
      if (matches.length > 1) throw new Error("Ambiguous website URL.");
      site = matches[0];
    }
    if (site && discoveryUrl(site.url, true) !== record.url)
      throw new Error("Discovery URL must match the selected website.");
    // Validate against a detached candidate: mutation callbacks can throw before save.
    if (site) site = structuredClone(site);
    if (!site) {
      site = {
        id: generatedSiteId,
        workspaceId: ws.id,
        name: record.name,
        domain: new URL(record.url).hostname,
        url: record.url,
        summary: record.summary,
        sitemapUrl: `${record.url}/sitemap.xml`,
        routes: ["/"],
        createdAt: at,
        verifyToken: generatedVerifyToken,
        status: "onboarding",
        scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
      };
    }
    site.indexNowKey = cleanIndexNowKey(site.indexNowKey) || generatedKey;
    let request = buildDiscoveryRequest(site, record, ws.id);
    const previous = site.discovery?.latest;
    const revision = previous
      ? previous.revision + (previous.digest === request.digest ? 0 : 1)
      : 1;
    request = buildDiscoveryRequest(site, record, ws.id, revision);
    const latest: DiscoverySubmission = {
      operationId,
      revision,
      idempotencyKey: request.idempotencyKey,
      digest: request.digest,
      status: "pending",
      at,
    };
    site.discovery = {
      record,
      latest,
      priorReceipt: site.discovery?.latest.receipt ?? site.discovery?.priorReceipt,
    };
    let blocked: string | undefined;
    try {
      assertCanAct(store, "catalog");
      if (request.keyPrefix) assertCanAct(store, "spend");
    } catch (error) {
      blocked = error instanceof Error ? error.message : "Discovery blocked.";
      latest.status = "failed";
      latest.error = blocked;
    }
    const existingIndex = store.sites.findIndex((s) => s.id === site.id);
    if (existingIndex < 0) store.sites.push(site);
    else store.sites[existingIndex] = site;
    return { siteId: site.id, request, blocked };
  });
  if ("denied" in prepared) throw new Error("Unauthorized");
  let receipt: DiscoveryReceipt | undefined;
  let error = prepared.blocked;
  if (!error) {
    try {
      receipt = await forwardDiscovery(
        prepared.request,
        io ?? {
          fetch,
          origin: remoteOrigin(),
          token: process.env.BOTCENTRAL_SERVICE_TOKEN?.trim() || "",
        },
      );
    } catch (failure) {
      error =
        failure instanceof DiscoveryDeliveryError
          ? failure.message
          : "Discovery delivery failed or receipt was invalid. Retry after checking BotCentral availability and configuration.";
    }
  }
  const submission = await ws.mutate((store) => {
    const latest = store.sites.find((s) => s.id === prepared.siteId)?.discovery?.latest;
    if (!latest || latest.operationId !== operationId)
      throw new Error("Discovery submission was superseded; refresh the website.");
    latest.status = receipt ? "accepted" : "failed";
    if (receipt) latest.receipt = receipt;
    if (error) latest.error = error;
    return structuredClone(latest);
  });
  return { siteId: prepared.siteId, submission };
}
export async function handleDiscoverySubmission(
  request: Request,
  deps = { resolve: workspaceForDiscoveryDigest, submit: submitDiscovery },
): Promise<Response> {
  const token = request.headers.get("authorization")?.match(/^Bearer (cfd_[a-f0-9]{64})$/)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const digest = discoveryDigest(token);
  const ws = await deps.resolve(digest);
  if (!ws) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
    return Response.json({ error: "JSON required." }, { status: 415 });
  const body = await readWebhookBody(request, DISCOVERY_MAX_BYTES);
  if (!body.ok)
    return Response.json(
      { error: "Invalid body or body exceeds 64 KiB." },
      { status: body.status },
    );
  let record: DiscoveryRecord;
  try {
    record = parseDiscoveryRecord(JSON.parse(body.rawBody));
  } catch {
    return Response.json({ error: "Invalid compact discovery record." }, { status: 400 });
  }
  try {
    const result = await deps.submit(ws, undefined, record, undefined, digest);
    return Response.json(result, { status: result.submission.status === "accepted" ? 200 : 502 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.message === "Unauthorized"
            ? "Unauthorized"
            : "Discovery submission could not be stored.",
      },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 409 },
    );
  }
}
