import { currentSessionUser } from "../auth/operator.server.ts";
import { assertSameSiteRequest } from "../auth/isolation.server.ts";
import { assertCanAct } from "./control.ts";
import { detectDnsProvider } from "./dns-provider-detection.server.ts";
import { dnsSetupOperationId } from "./dns-provider.ts";
import {
  consumePorkbunAuthorizationState,
  createPorkbunAuthorizationState,
} from "./dns-oauth-state.server.ts";
import {
  createPorkbunAuthorization,
  ensurePorkbunTxt,
  retrievePorkbunAuthorization,
  type PorkbunCredentials,
} from "./porkbun-dns.server.ts";
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

export async function startPorkbunDnsAuthorization(request: Request): Promise<Response> {
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
  const domain = normalizeDomain(site.domain);
  const detection = await detectDnsProvider(domain);
  if (detection.status !== "matched" || detection.provider?.slug !== "porkbun") {
    throw new Error("Porkbun is not the current authoritative DNS provider for this property.");
  }

  const authorization = await createPorkbunAuthorization(domain);
  const created = await createPorkbunAuthorizationState({
    workspaceId: ws.id,
    userId: user.id,
    siteId: site.id,
    domain,
    requestToken: authorization.requestToken,
    codeVerifier: authorization.codeVerifier,
  });
  const at = new Date().toISOString();
  await ws.mutate((next) => {
    const current = getSite(next, site.id);
    if (!current || normalizeDomain(current.domain) !== domain) {
      throw new Error("The stored property changed before DNS authorization started.");
    }
    current.dnsSetup = {
      providerSlug: "porkbun",
      service: "porkbun",
      operationId: created.operationId,
      status: "authorization-pending",
      createdAt: at,
      updatedAt: at,
      lastResult: "Waiting for the domain owner to approve CiteFleet in Porkbun.",
    };
    logActivity(next, {
      actor: user.email,
      kind: "system",
      siteId: site.id,
      message: `Started one-time Porkbun DNS authorization for ${domain}.`,
    });
  });
  return redirect(authorization.authUrl);
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

export async function finishPorkbunDnsAuthorization(request: Request): Promise<Response> {
  assertSameSiteRequest();
  const user = await currentSessionUser(request);
  if (!user) return login();
  const url = new URL(request.url);
  const requestToken = url.searchParams.get("requestToken")?.trim() ?? "";
  const transaction = await consumePorkbunAuthorizationState(requestToken, user.id);
  if (!transaction) return redirect("/?dns=invalid-state");
  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  if (ws.id !== transaction.workspaceId) return redirect("/?dns=invalid-state");
  if (url.searchParams.get("status") !== "approved") {
    await markFailed(
      transaction.siteId,
      transaction.operationId,
      user,
      ws,
      "Porkbun access was not approved. No DNS record was changed.",
    );
    return campaign(transaction.siteId, "denied");
  }

  let credentials: PorkbunCredentials | null = null;
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
    if (detection.status !== "matched" || detection.provider?.slug !== "porkbun") {
      throw new Error("Porkbun is no longer authoritative for this property.");
    }

    credentials = await retrievePorkbunAuthorization(requestToken, transaction.codeVerifier);
    const record = proofRecord(site);
    const result = await ensurePorkbunTxt(
      credentials,
      record.apex,
      record.value,
      transaction.operationId,
    );
    credentials = null;
    const at = new Date().toISOString();
    await ws.mutate((next) => {
      const current = getSite(next, transaction.siteId);
      if (!current || dnsSetupOperationId(current.dnsSetup) !== transaction.operationId) return;
      current.dnsSetup!.status = "propagating";
      current.dnsSetup!.updatedAt = at;
      current.dnsSetup!.lastResult = `${result.created ? "Added" : "Found"} the exact TXT record. CiteFleet discarded the approved Porkbun credentials and is checking public DNS now. You can remove the CiteFleet DNS verification key in Porkbun.`;
      logActivity(next, {
        actor: user.email,
        kind: "system",
        siteId: transaction.siteId,
        message: `${result.created ? "Added" : "Found"} the BotCentral proof TXT record for ${site.domain} through Porkbun. No Porkbun credential was stored.`,
      });
    });
    const { runWebhookListing } = await import("./dispatcher.ts");
    void runWebhookListing(ws, transaction.siteId, "Porkbun DNS setup", {
      dnsSetupOperationId: transaction.operationId,
      inFlightKey: `porkbun:${transaction.siteId}:${transaction.operationId}`,
    });
    return campaign(transaction.siteId, "verifying");
  } catch (error) {
    credentials = null;
    const message = error instanceof Error ? error.message : "Porkbun DNS setup failed.";
    console.error("[citefleet] Porkbun DNS setup failed", message);
    await markFailed(
      transaction.siteId,
      transaction.operationId,
      user,
      ws,
      `${message} No Porkbun credential was stored.`,
    );
    return campaign(transaction.siteId, "failed");
  }
}
