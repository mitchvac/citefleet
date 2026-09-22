import { createHash, randomBytes, randomUUID } from "node:crypto";
import { decryptHostingerToken, encryptHostingerToken } from "./hostinger-token.ts";
import { currentSessionUser } from "../auth/operator.server.ts";
import { assertSameSiteRequest } from "../auth/isolation.server.ts";
import { getSql, type Sql } from "../db.ts";
import { assertCanAct } from "./control.ts";
import { inspectHostingerInstall, installHostingerPack } from "./hostinger-files.server.ts";
import {
  exchangeHostingerCode,
  hostingerAuthorizationUrl,
  hostingerRedirectUri,
  newHostingerPkce,
  registerHostingerClient,
  revokeHostingerToken,
} from "./hostinger-oauth.server.ts";
import { getSite, logActivity } from "./store.ts";
import { exactHostingerDomain } from "./hostinger-site.ts";
import { handleFor } from "./workspace-handle.ts";
import { asWorkspaceId } from "./workspace-id.ts";
import { workspaceForPrincipal } from "./workspace-registry.server.ts";

const OAUTH_TTL_MS = 10 * 60_000;
const JOB_TTL_MS = 10 * 60_000;
const RUN_TTL_MINUTES = 30;

type StateRow = {
  workspace_id: string;
  user_id: string;
  site_id: string;
  domain: string;
  client_id: string;
  pkce_verifier: string;
};
type JobRow = {
  id: string;
  workspace_id: string;
  site_id: string;
  domain: string;
  client_id: string;
  encrypted_token: string;
};
export type HostingerJobStatus = {
  status: "queued" | "running" | "verified" | "failed";
  result: string | null;
  updatedAt: string;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function expireHostingerJobs(sql: Sql): Promise<void> {
  await sql.query(
    `UPDATE citefleet_hostinger_install_jobs
        SET status='failed', encrypted_token=NULL, finished_at=now(),
            result='The Bot did not start this install before its authorization expired.'
      WHERE expires_at<=now() AND status='queued'`,
  );
  await sql.query(
    `UPDATE citefleet_hostinger_install_jobs
        SET status='failed', finished_at=now(),
            result='The install run exceeded its verification deadline.'
      WHERE run_deadline<=now() AND status='running'`,
  );
}

function secretKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env.CITEFLEET_HOSTINGER_TOKEN_KEY?.trim() ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(raw))
    throw new Error("Hostinger token encryption key is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Hostinger token encryption key must be 32 bytes.");
  return key;
}


function botWebhook(env: NodeJS.ProcessEnv = process.env): { url: string; key: string } {
  const raw = env.CITEFLEET_GROK_BOT_WEBHOOK_URL?.trim() ?? "";
  const key = env.CITEFLEET_GROK_BOT_WEBHOOK_KEY?.trim() ?? "";
  if (!raw || !key) throw new Error("Grok Bot install routine is not configured.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Grok Bot webhook URL is invalid.");
  return { url: url.toString(), key };
}

function installConfigured(): boolean {
  if (process.env.CITEFLEET_HOSTINGER_OAUTH_APPROVED !== "on") return false;
  try {
    secretKey();
    botWebhook();
    return true;
  } catch {
    return false;
  }
}

function redirect(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}

function campaign(siteId: string, result: string): Response {
  return redirect(`/sites/${encodeURIComponent(siteId)}?hostinger=${encodeURIComponent(result)}`);
}

function exactSite(site: { domain: string; provider?: { slug: string } }, domain: string): void {
  if (site.provider?.slug !== "hostinger" || exactHostingerDomain(site.domain) !== domain)
    throw new Error("The selected Hostinger property changed during authorization.");
}

async function revokeQuietly(clientId: string, token: string): Promise<boolean> {
  try {
    await revokeHostingerToken(clientId, token);
    return true;
  } catch (error) {
    console.error("[citefleet] Hostinger token revocation failed", error);
    return false;
  }
}

export async function startHostingerInstall(request: Request): Promise<Response> {
  assertSameSiteRequest();
  const user = await currentSessionUser(request);
  if (!user) return redirect("/login");
  const siteId = new URL(request.url).searchParams.get("siteId")?.trim() ?? "";
  if (!siteId) return redirect("/");
  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  const store = await ws.get();
  const site = getSite(store, siteId);
  if (!site) return redirect("/");
  exactSite(site, exactHostingerDomain(site.domain));
  assertCanAct(store, "spend");
  if (!installConfigured()) return campaign(site.id, "unavailable");
  const redirectUri = hostingerRedirectUri();
  let clientId: string;
  try {
    clientId = await registerHostingerClient(redirectUri);
  } catch (error) {
    console.error("[citefleet] Hostinger OAuth registration failed", error);
    return campaign(site.id, "unavailable");
  }
  const pkce = newHostingerPkce();
  const state = randomBytes(32).toString("base64url");
  const sql = await getSql();
  await sql.query("DELETE FROM citefleet_hostinger_oauth_states WHERE expires_at<=now()");
  await expireHostingerJobs(sql);
  await sql.query(
    `INSERT INTO citefleet_hostinger_oauth_states
      (state_hash, workspace_id, user_id, site_id, domain, client_id, pkce_verifier, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [hash(state), ws.id, user.id, site.id, exactHostingerDomain(site.domain), clientId,
      pkce.verifier, new Date(Date.now() + OAUTH_TTL_MS)],
  );
  return redirect(hostingerAuthorizationUrl({
    clientId, redirectUri, state, challenge: pkce.challenge,
  }));
}

export async function finishHostingerInstall(request: Request): Promise<Response> {
  assertSameSiteRequest();
  const user = await currentSessionUser(request);
  if (!user) return redirect("/login");
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(state)) return redirect("/?hostinger=invalid-state");
  const sql = await getSql();
  const rows = await sql.query<StateRow>(
    `DELETE FROM citefleet_hostinger_oauth_states AS oauth
      USING citefleet_workspace_members AS member, citefleet_workspaces AS workspace
      WHERE oauth.state_hash = $1 AND oauth.user_id = $2 AND oauth.expires_at > now()
        AND member.workspace_id = oauth.workspace_id AND member.user_id = oauth.user_id
        AND workspace.id = oauth.workspace_id AND workspace.archived_at IS NULL
      RETURNING oauth.workspace_id, oauth.user_id, oauth.site_id, oauth.domain,
                oauth.client_id, oauth.pkce_verifier`,
    [hash(state), user.id],
  );
  if (rows.length !== 1) return redirect("/?hostinger=invalid-state");
  const transaction = rows[0];
  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  if (ws.id !== asWorkspaceId(transaction.workspace_id)) return redirect("/?hostinger=invalid-state");
  const code = url.searchParams.get("code") ?? "";
  if (url.searchParams.has("error") || !code || code.length > 4096)
    return campaign(transaction.site_id, "denied");

  let token = "";
  let queued = false;
  let jobId: string | null = null;
  try {
    const store = await ws.get();
    const site = getSite(store, transaction.site_id);
    if (!site) throw new Error("The property was removed during authorization.");
    exactSite(site, transaction.domain);
    assertCanAct(store, "spend");
    const authorization = await exchangeHostingerCode({
      clientId: transaction.client_id,
      code,
      verifier: transaction.pkce_verifier,
      redirectUri: hostingerRedirectUri(),
    });
    token = authorization.accessToken;
    const plan = await inspectHostingerInstall(site, token);
    if (!plan.writable) {
      const refused = plan.files.filter((file) => file.state === "refused")
        .map((file) => `${file.path}: ${file.reason}`).join(" ");
      throw new Error(refused || "Hostinger refused one or more origin file paths.");
    }
    const webhook = botWebhook();
    const capability = randomBytes(32).toString("base64url");
    jobId = randomUUID();
    const expiresAt = new Date(Date.now() + Math.min(JOB_TTL_MS, (authorization.expiresIn - 60) * 1000));
    await sql.query(
      `INSERT INTO citefleet_hostinger_install_jobs
        (id, capability_hash, workspace_id, site_id, domain, client_id,
         encrypted_token, status, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8)`,
      [jobId, hash(capability), ws.id, site.id, transaction.domain,
        transaction.client_id, encryptHostingerToken(token, secretKey()), expiresAt],
    );
    const endpoint = new URL("/api/hosting/hostinger/run", hostingerRedirectUri());
    const response = await fetch(webhook.url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${webhook.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: "Install and verify CiteFleet's five origin files for this exact Hostinger site.",
        domain: transaction.domain,
        jobId,
        endpoint: endpoint.toString(),
        authorization: `Bearer ${capability}`,
        instruction: "POST to endpoint with the authorization header exactly once. A successful response confirms all five live files; a failure requires reporting the error. Do not ask for or reveal the customer's Hostinger password.",
      }),
    });
    if (response.status !== 200) {
      await sql.query(
        `UPDATE citefleet_hostinger_install_jobs SET status='failed', encrypted_token=NULL,
          result=$2, finished_at=now() WHERE id=$1 AND status='queued'`,
        [jobId, `Grok Bot did not accept the install job (${response.status}).`],
      );
      throw new Error(`Grok Bot did not accept the install job (${response.status}).`);
    }
    queued = true;
    await ws.mutate((next) => logActivity(next, {
      actor: user.email, kind: "system", siteId: site.id,
      message: `Customer authorized Hostinger install for ${transaction.domain}; Grok Bot accepted job ${jobId}.`,
    }));
    return campaign(site.id, "queued");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hostinger install could not be queued.";
    console.error("[citefleet] Hostinger install setup failed", message);
    if (queued) return campaign(transaction.site_id, "queued");
    if (jobId) {
      await sql.query(
        `UPDATE citefleet_hostinger_install_jobs SET status='failed', encrypted_token=NULL,
          result=$2, finished_at=now() WHERE id=$1 AND status='queued'`,
        [jobId, message],
      );
    } else {
      await sql.query(
        `INSERT INTO citefleet_hostinger_install_jobs
          (id, capability_hash, workspace_id, site_id, domain, client_id,
           encrypted_token, status, result, expires_at, finished_at)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,'failed',$7,$8,now())`,
        [randomUUID(), hash(randomBytes(32).toString("base64url")), ws.id,
          transaction.site_id, transaction.domain, transaction.client_id,
          message, new Date(Date.now() + JOB_TTL_MS)],
      );
    }
    await ws.mutate((next) => logActivity(next, {
      actor: user.email, kind: "audit", siteId: transaction.site_id, message,
    }));
    return campaign(transaction.site_id, "failed");
  } finally {
    if (token && !queued) await revokeQuietly(transaction.client_id, token);
  }
}

export async function runHostingerInstall(request: Request): Promise<Response> {
  const bearer = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(bearer))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const capability = bearer.slice(7);
  const sql = await getSql();
  await expireHostingerJobs(sql);
  const rows = await sql.query<JobRow>(
    `WITH selected AS (
       SELECT candidate.id, candidate.encrypted_token
         FROM citefleet_hostinger_install_jobs AS candidate
        WHERE candidate.capability_hash=$1 AND candidate.status='queued'
          AND candidate.expires_at>now()
          AND EXISTS (
            SELECT 1 FROM citefleet_workspaces AS workspace
            WHERE workspace.id=candidate.workspace_id AND workspace.archived_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM citefleet_hostinger_install_jobs AS newer
            WHERE newer.workspace_id=candidate.workspace_id AND newer.site_id=candidate.site_id
              AND newer.created_at>candidate.created_at
          )
        FOR UPDATE OF candidate SKIP LOCKED
     )
     UPDATE citefleet_hostinger_install_jobs AS job
        SET status='running', encrypted_token=NULL,
            run_deadline=now()+interval '${RUN_TTL_MINUTES} minutes'
       FROM selected
      WHERE job.id=selected.id
      RETURNING job.id, job.workspace_id, job.site_id, job.domain,
                job.client_id, selected.encrypted_token`,
    [hash(capability)],
  );
  if (rows.length !== 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const job = rows[0];
  let token = "";
  try {
    token = decryptHostingerToken(job.encrypted_token, secretKey());
    const ws = handleFor(asWorkspaceId(job.workspace_id));
    const store = await ws.get();
    const site = getSite(store, job.site_id);
    if (!site) throw new Error("The property was removed before installation.");
    exactSite(site, job.domain);
    assertCanAct(store, "spend");
    const result = await installHostingerPack(site, token);
    if (result.verified.length !== 5) throw new Error("Hostinger did not verify all five live files.");
    const revoked = await revokeQuietly(job.client_id, token);
    let indexNowNote = "IndexNow was not submitted.";
    let indexNowAccepted = false;
    try {
      const { submitIndexNowForSite } = await import("./dispatcher.ts");
      const submission = await submitIndexNowForSite(ws, site.id, "deployment");
      indexNowNote = submission.note;
      indexNowAccepted = submission.accepted;
    } catch (indexError) {
      indexNowNote = indexError instanceof Error ? indexError.message : "IndexNow submission failed.";
      console.error("[citefleet] Hostinger IndexNow submission failed", indexNowNote);
    }
    const message = `${revoked
      ? "All five origin files are live and the temporary Hostinger token was revoked."
      : "All five origin files are live; Hostinger token revocation could not be confirmed."} ${indexNowNote}`;
    const completed = await sql.query<{ id: string }>(
      `UPDATE citefleet_hostinger_install_jobs SET status='verified', encrypted_token=NULL,
        result=$2, finished_at=now() WHERE id=$1 AND status='running'
        RETURNING id`,
      [job.id, message],
    );
    if (completed.length !== 1) {
      return Response.json({ status: "failed", error: "The install run expired before completion was recorded." }, { status: 409 });
    }
    try {
      await ws.mutate((next) => logActivity(next, {
        actor: "Grok Bot", kind: "system", siteId: site.id,
        message: `Verified all five Hostinger origin files for ${job.domain}.`,
      }));
    } catch (auditError) {
      console.error("[citefleet] Hostinger audit-log write failed", auditError);
    }
    return Response.json({ status: "verified", verified: result.verified, indexNowAccepted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hostinger install failed.";
    const revoked = token ? await revokeQuietly(job.client_id, token) : false;
    await sql.query(
      `UPDATE citefleet_hostinger_install_jobs SET status='failed', encrypted_token=NULL,
        result=$2, finished_at=now() WHERE id=$1 AND status='running'`,
      [job.id, `${message}${token && !revoked ? " Token revocation could not be confirmed." : ""}`],
    );
    console.error("[citefleet] Hostinger install failed", message);
    return Response.json({ status: "failed", error: message }, { status: 409 });
  }
}

export async function hostingerInstallStatus(request: Request): Promise<Response> {
  assertSameSiteRequest();
  const user = await currentSessionUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const siteId = new URL(request.url).searchParams.get("siteId")?.trim() ?? "";
  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  const site = getSite(await ws.get(), siteId);
  if (!site || site.provider?.slug !== "hostinger")
    return Response.json({ error: "Not found" }, { status: 404 });
  const sql: Sql = await getSql();
  await expireHostingerJobs(sql);
  const rows = await sql.query<{
    status: HostingerJobStatus["status"];
    result: string | null;
    created_at: Date;
    finished_at: Date | null;
    expires_at: Date;
    run_deadline: Date | null;
  }>(
    `SELECT status, result, created_at, finished_at, expires_at, run_deadline
       FROM citefleet_hostinger_install_jobs
      WHERE workspace_id=$1 AND site_id=$2 AND domain=$3
      ORDER BY created_at DESC LIMIT 1`,
    [ws.id, site.id, exactHostingerDomain(site.domain)],
  );
  const row = rows[0];
  if (!row) return Response.json({ job: null, configured: installConfigured() });
  const status: HostingerJobStatus = {
    status: row.status,
    result: row.result,
    updatedAt: new Date(row.finished_at ?? row.created_at).toISOString(),
  };
  return Response.json({ job: status, configured: installConfigured() });
}
