import { currentSessionUser } from "../auth/operator.server.ts";
import { assertSameSiteRequest } from "../auth/isolation.server.ts";
import { assertCanAct } from "./control.ts";
import {
  cloudflareAuthorizationUrl,
  cloudflareOAuthConfig,
  ensureCloudflareTxt,
  exchangeCloudflareCode,
  revokeCloudflareToken,
} from "./cloudflare-dns.server.ts";
import { detectDnsProvider } from "./dns-provider-detection.server.ts";
import { dnsSetupOperationId } from "./dns-provider.ts";
import { createDnsOAuthState, consumeDnsOAuthState } from "./dns-oauth-state.server.ts";
import { runWebhookListing } from "./dispatcher.ts";
import { proofRecord } from "./proof-record.ts";
import { getSite, logActivity } from "./store.ts";
import { normalizeDomain } from "./verify-token.ts";
import { workspaceForPrincipal } from "./workspace-registry.server.ts";

function redirect(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}

function campaign(siteId: string, result: string): Response {
  return redirect(`/sites/${encodeURIComponent(siteId)}?dns=${encodeURIComponent(result)}`);
}

function login(): Response {
  return redirect("/login");
}

export async function startCloudflareDnsOAuth(request: Request): Promise<Response> {
  assertSameSiteRequest();
  const user = await currentSessionUser(request);
  if (!user) return login();
  const siteId = new URL(request.url).searchParams.get("siteId")?.trim() ?? "";
  if (!siteId) return redirect("/");

  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  const store = await ws.get();
  const site = getSite(store, siteId);
  if (!site) return redirect("/");
  assertCanAct(store, "spend");
  const detection = await detectDnsProvider(site.domain);
  if (detection.status !== "matched" || detection.provider?.slug !== "cloudflare") {
    throw new Error("Cloudflare is not the current authoritative DNS provider for this property.");
  }
  const config = cloudflareOAuthConfig();
  if (!config) throw new Error("Cloudflare DNS connection is not configured.");
  const created = await createDnsOAuthState({
    workspaceId: ws.id,
    userId: user.id,
    siteId: site.id,
    provider: "cloudflare",
    domain: normalizeDomain(site.domain),
  });
  const at = new Date().toISOString();
  await ws.mutate((next) => {
    const current = getSite(next, site.id);
    if (!current) throw new Error("property not found");
    current.dnsSetup = {
      providerSlug: "cloudflare",
      service: "cloudflare",
      operationId: created.operationId,
      status: "authorization-pending",
      createdAt: at,
      updatedAt: at,
      lastResult: "Waiting for the customer to approve DNS access in Cloudflare.",
    };
    logActivity(next, {
      actor: user.email,
      kind: "system",
      siteId: site.id,
      message: `Started Cloudflare DNS authorization for ${site.domain}.`,
    });
  });
  return redirect(cloudflareAuthorizationUrl(config, created.state));
}

async function markFailed(
  siteId: string,
  operationId: string,
  user: { email: string },
  ws: Awaited<ReturnType<typeof workspaceForPrincipal>>,
  message: string,
): Promise<void> {
  await ws.mutate((store) => {
    const site = getSite(store, siteId);
    if (!site || dnsSetupOperationId(site.dnsSetup) !== operationId) return;
    site.dnsSetup!.status = "failed";
    site.dnsSetup!.updatedAt = new Date().toISOString();
    site.dnsSetup!.lastResult = message;
    logActivity(store, { actor: user.email, kind: "audit", siteId, message });
  });
}

export async function finishCloudflareDnsOAuth(request: Request): Promise<Response> {
  assertSameSiteRequest();
  const user = await currentSessionUser(request);
  if (!user) return login();
  const url = new URL(request.url);
  const rawState = url.searchParams.get("state") ?? "";
  const transaction = await consumeDnsOAuthState(rawState, user.id);
  if (!transaction) return redirect("/?dns=invalid-state");
  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  if (ws.id !== transaction.workspaceId) return redirect("/?dns=invalid-state");
  const denied = url.searchParams.has("error");
  const code = url.searchParams.get("code")?.trim() ?? "";
  if (denied || !code) {
    await markFailed(
      transaction.siteId,
      transaction.operationId,
      user,
      ws,
      "Cloudflare access was not approved. No DNS record was changed.",
    );
    return campaign(transaction.siteId, "denied");
  }

  let token = "";
  try {
    const store = await ws.get();
    const site = getSite(store, transaction.siteId);
    if (!site || normalizeDomain(site.domain) !== transaction.domain) {
      throw new Error("The stored property no longer matches this authorization.");
    }
    if (dnsSetupOperationId(site.dnsSetup) !== transaction.operationId) {
      throw new Error("This DNS authorization was replaced by a newer attempt.");
    }
    assertCanAct(store, "spend");
    const detection = await detectDnsProvider(site.domain);
    if (detection.status !== "matched" || detection.provider?.slug !== "cloudflare") {
      throw new Error("Cloudflare is no longer authoritative for this property.");
    }
    const config = cloudflareOAuthConfig();
    if (!config) throw new Error("Cloudflare DNS connection is not configured.");
    token = await exchangeCloudflareCode(code, config);
    const record = proofRecord(site);
    const result = await ensureCloudflareTxt(token, record.apex, record.value);
    const revoked = await revokeCloudflareToken(token, config);
    token = "";
    const at = new Date().toISOString();
    await ws.mutate((next) => {
      const current = getSite(next, transaction.siteId);
      if (!current || dnsSetupOperationId(current.dnsSetup) !== transaction.operationId) return;
      current.dnsSetup!.status = "propagating";
      current.dnsSetup!.updatedAt = at;
      current.dnsSetup!.lastResult = revoked
        ? `${result.created ? "Created" : "Found"} the exact apex TXT record and revoked temporary Cloudflare access. Checking public DNS now.`
        : `${result.created ? "Created" : "Found"} the exact apex TXT record. Temporary access was discarded locally, but Cloudflare revocation could not be confirmed.`;
      logActivity(next, {
        actor: user.email,
        kind: "system",
        siteId: transaction.siteId,
        message: `${result.created ? "Created" : "Found"} the BotCentral proof TXT record for ${site.domain}; Cloudflare token revocation ${revoked ? "confirmed" : "not confirmed"}.`,
      });
    });
    void runWebhookListing(ws, transaction.siteId, "Cloudflare DNS setup", {
      dnsSetupOperationId: transaction.operationId,
      inFlightKey: `cloudflare:${transaction.siteId}:${transaction.operationId}`,
    });
    return campaign(transaction.siteId, "verifying");
  } catch (error) {
    if (token) {
      try {
        const config = cloudflareOAuthConfig();
        if (config) await revokeCloudflareToken(token, config);
      } catch {
        // The temporary token is still discarded locally when config changed mid-flow.
      }
    }
    const message = error instanceof Error ? error.message : "Cloudflare DNS setup failed.";
    console.error("[citefleet] Cloudflare DNS setup failed", message);
    await markFailed(
      transaction.siteId,
      transaction.operationId,
      user,
      ws,
      `${message} No Cloudflare credential was stored.`,
    );
    return campaign(transaction.siteId, "failed");
  }
}
