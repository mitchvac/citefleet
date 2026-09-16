import { currentSessionUser } from "../auth/operator.server.ts";
import { assertSameSiteRequest } from "../auth/isolation.server.ts";
import { assertCanAct } from "./control.ts";
import { detectDnsProvider } from "./dns-provider-detection.server.ts";
import { dnsSetupOperationId } from "./dns-provider.ts";
import { createDnsOAuthState, consumeDnsOAuthState } from "./dns-oauth-state.server.ts";
import { runWebhookListing } from "./dispatcher.ts";
import { proofRecord } from "./proof-record.ts";
import { getSite, logActivity } from "./store.ts";
import {
  ensureVercelTxt,
  exchangeVercelCode,
  removeVercelIntegration,
  vercelAuthorizationUrl,
  vercelCompletionUrl,
  vercelOAuthConfig,
} from "./vercel-dns.server.ts";
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

export async function startVercelDnsOAuth(request: Request): Promise<Response> {
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
  if (detection.status !== "matched" || detection.provider?.slug !== "vercel") {
    throw new Error("Vercel is not the current authoritative DNS provider for this property.");
  }
  const config = vercelOAuthConfig();
  if (!config) throw new Error("Vercel DNS connection is not configured.");
  const created = await createDnsOAuthState({
    workspaceId: ws.id,
    userId: user.id,
    siteId: site.id,
    provider: "vercel",
    domain: normalizeDomain(site.domain),
  });
  const at = new Date().toISOString();
  await ws.mutate((next) => {
    const current = getSite(next, site.id);
    if (!current) throw new Error("property not found");
    current.dnsSetup = {
      providerSlug: "vercel",
      service: "vercel",
      operationId: created.operationId,
      status: "authorization-pending",
      createdAt: at,
      updatedAt: at,
      lastResult: "Waiting for the customer to approve temporary DNS access in Vercel.",
    };
    logActivity(next, {
      actor: user.email,
      kind: "system",
      siteId: site.id,
      message: `Started Vercel DNS authorization for ${site.domain}.`,
    });
  });
  return redirect(vercelAuthorizationUrl(config, created.state));
}

export async function finishVercelDnsOAuth(request: Request): Promise<Response> {
  assertSameSiteRequest();
  const user = await currentSessionUser(request);
  if (!user) return login();
  const url = new URL(request.url);
  const transaction = await consumeDnsOAuthState(
    url.searchParams.get("state") ?? "",
    user.id,
    "vercel",
  );
  if (!transaction) return redirect("/?dns=invalid-state");
  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  if (ws.id !== transaction.workspaceId) return redirect("/?dns=invalid-state");

  const code = url.searchParams.get("code")?.trim() ?? "";
  const configurationId = url.searchParams.get("configurationId")?.trim() ?? "";
  const rawTeamId = url.searchParams.get("teamId")?.trim() ?? "";
  const teamId = rawTeamId || null;
  const denied = url.searchParams.has("error");
  if (
    denied ||
    !code ||
    code.length > 4096 ||
    !/^icfg_[A-Za-z0-9_-]{6,160}$/.test(configurationId) ||
    (teamId !== null && !/^team_[A-Za-z0-9_-]{6,160}$/.test(teamId))
  ) {
    await markFailed(
      transaction.siteId,
      transaction.operationId,
      user,
      ws,
      "Vercel access was not approved. No DNS record was changed.",
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
    if (detection.status !== "matched" || detection.provider?.slug !== "vercel") {
      throw new Error("Vercel is no longer authoritative for this property.");
    }
    const config = vercelOAuthConfig();
    if (!config) throw new Error("Vercel DNS connection is not configured.");
    const authorization = await exchangeVercelCode(code, config);
    token = authorization.accessToken;
    if (authorization.teamId !== teamId) {
      throw new Error("Vercel returned a different account scope than the approved installation.");
    }
    const record = proofRecord(site);
    const result = await ensureVercelTxt(token, record.apex, record.value, teamId);
    const removed = await removeVercelIntegration(token, configurationId, teamId);
    token = "";
    const at = new Date().toISOString();
    await ws.mutate((next) => {
      const current = getSite(next, transaction.siteId);
      if (!current || dnsSetupOperationId(current.dnsSetup) !== transaction.operationId) return;
      current.dnsSetup!.status = "propagating";
      current.dnsSetup!.updatedAt = at;
      current.dnsSetup!.lastResult = removed
        ? `${result.created ? "Created" : "Found"} the exact apex TXT record and removed temporary Vercel access. Checking public DNS now.`
        : `${result.created ? "Created" : "Found"} the exact apex TXT record. Temporary access was discarded locally, but Vercel removal could not be confirmed.`;
      logActivity(next, {
        actor: user.email,
        kind: "system",
        siteId: transaction.siteId,
        message: `${result.created ? "Created" : "Found"} the BotCentral proof TXT record for ${site.domain}; Vercel integration removal ${removed ? "confirmed" : "not confirmed"}.`,
      });
    });
    void runWebhookListing(ws, transaction.siteId, "Vercel DNS setup", {
      dnsSetupOperationId: transaction.operationId,
      inFlightKey: `vercel:${transaction.siteId}:${transaction.operationId}`,
    });
    const completion = vercelCompletionUrl(url.searchParams.get("next"));
    return completion ? redirect(completion) : campaign(transaction.siteId, "verifying");
  } catch (error) {
    if (token) {
      try {
        await removeVercelIntegration(token, configurationId, teamId);
      } catch {
        // The temporary token is still discarded locally after a bounded removal attempt.
      }
    }
    const message = error instanceof Error ? error.message : "Vercel DNS setup failed.";
    console.error("[citefleet] Vercel DNS setup failed", message);
    await markFailed(
      transaction.siteId,
      transaction.operationId,
      user,
      ws,
      `${message} No Vercel credential was stored.`,
    );
    return campaign(transaction.siteId, "failed");
  }
}
