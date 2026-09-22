import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db.ts";
import { assertCanAct } from "./control.ts";
import { originRepoConflict } from "./origin-repo.ts";
import { packFiles, type OriginFile } from "./originPack.ts";
import { getSite } from "./store.ts";
import type { Site } from "./types.ts";
import type { VercelInstallResponse, VercelInstallStatus } from "./vercel-install.ts";
import {
  exchangeVercelCode,
  removeVercelIntegration,
  vercelAuthorizationUrl,
  vercelCompletionUrl,
  type VercelOAuthConfig,
} from "./vercel-dns.server.ts";
import type { VercelProjectTarget } from "./vercel-project.server.ts";

export interface VercelInstallRow {
  id: string;
  workspace_id: string;
  user_id: string;
  site_id: string;
  domain: string;
  site_url: string;
  client_id: string;
  status: VercelInstallStatus;
  message: string;
  encrypted_token: string | null;
  configuration_id: string | null;
  team_id: string | null;
  target: VercelProjectTarget | null;
  expected_files: OriginFile[];
  commit_sha: string | null;
  deployment_id: string | null;
  deployment_url: string | null;
  verified_paths: string[];
  lease_id: string | null;
  expires_at: Date | string;
}
const TERMINAL = new Set<VercelInstallStatus>(["verified", "failed"]);
const digest = (state: string) => createHash("sha256").update(state).digest("hex");
const redirect = (path: string) =>
  new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
const campaign = (siteId: string) => redirect(`/sites/${encodeURIComponent(siteId)}`);
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export function vercelInstallConfig(
  env: NodeJS.ProcessEnv = process.env,
): (VercelOAuthConfig & { tokenKey: Buffer }) | null {
  const integrationSlug = env.CITEFLEET_VERCEL_INSTALL_INTEGRATION_SLUG?.trim() ?? "";
  const clientId = env.CITEFLEET_VERCEL_INSTALL_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.CITEFLEET_VERCEL_INSTALL_CLIENT_SECRET?.trim() ?? "";
  const encoded = env.CITEFLEET_VERCEL_INSTALL_TOKEN_KEY?.trim() ?? "";
  if (!integrationSlug || !clientId || !clientSecret || !encoded) return null;
  const tokenKey = Buffer.from(encoded, "base64");
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(integrationSlug) ||
    tokenKey.length !== 32 ||
    tokenKey.toString("base64") !== encoded
  )
    return null;
  let origin: URL;
  try {
    origin = new URL(env.CITEFLEET_PUBLIC_URL || env.PUBLIC_ORIGIN || "https://citefleet.app");
  } catch {
    return null;
  }
  const local = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
  if ((origin.protocol !== "https:" && !local) || origin.username || origin.password) return null;
  return {
    integrationSlug,
    clientId,
    clientSecret,
    tokenKey,
    redirectUri: `${origin.origin}/api/hosting/vercel/callback`,
  };
}
export function encryptVercelToken(token: string, operationId: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(operationId));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((v) => v.toString("base64url")).join(".");
}
export function decryptVercelToken(encoded: string, operationId: string, key: Buffer): string {
  const parts = encoded.split(".");
  if (parts.length !== 3) throw new Error("Invalid temporary credential");
  const [iv, tag, ciphertext] = parts.map((v) => Buffer.from(v, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid temporary credential");
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(operationId));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString("utf8");
}
export function assertVercelProperty(
  site: Site | undefined,
  row?: Pick<VercelInstallRow, "site_url" | "domain">,
): asserts site is Site {
  if (!site) throw new Error("Property not found");
  const url = new URL(site.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Vercel installation needs an exact HTTPS website origin");
  if (row && (site.url !== row.site_url || site.domain !== row.domain))
    throw new Error("The property changed after authorization; start a new installation");
}
export async function consumeVercelInstallState(
  sql: Sql,
  state: string,
  userId: string,
  workspaceId: string,
): Promise<VercelInstallRow | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  const rows = await sql.query<VercelInstallRow>(
    `UPDATE citefleet_vercel_installs j SET consumed_at=now(), state_hash=NULL
    WHERE state_hash=$1 AND user_id=$2 AND workspace_id=$3 AND consumed_at IS NULL
      AND status='authorization-pending' AND expires_at>now()
      AND EXISTS (SELECT 1 FROM citefleet_workspace_members m JOIN citefleet_workspaces w ON w.id=m.workspace_id
        WHERE m.user_id=j.user_id AND m.workspace_id=j.workspace_id AND w.archived_at IS NULL)
    RETURNING j.*`,
    [digest(state), userId, workspaceId],
  );
  return rows[0] ?? null;
}
export async function claimVercelInstall(
  sql: Sql,
  id: string,
  workspaceId: string,
  userId: string,
): Promise<VercelInstallRow | null> {
  const lease = randomUUID();
  const rows = await sql.query<VercelInstallRow>(
    `UPDATE citefleet_vercel_installs j SET lease_id=$4,lease_until=now()+interval '3 minutes'
    WHERE id=$1 AND workspace_id=$2 AND user_id=$3 AND status IN ('authorized','installing','building','verifying')
      AND expires_at>now() AND (lease_until IS NULL OR lease_until<now())
      AND EXISTS (SELECT 1 FROM citefleet_workspace_members m JOIN citefleet_workspaces w ON w.id=m.workspace_id
        WHERE m.user_id=j.user_id AND m.workspace_id=j.workspace_id AND w.archived_at IS NULL)
    RETURNING j.*`,
    [id, workspaceId, userId, lease],
  );
  return rows[0] ?? null;
}
async function patch(
  sql: Sql,
  row: VercelInstallRow,
  values: Partial<VercelInstallRow>,
): Promise<void> {
  const entries = Object.entries(values);
  const columns = new Set([
    "status",
    "message",
    "encrypted_token",
    "configuration_id",
    "team_id",
    "target",
    "commit_sha",
    "deployment_id",
    "deployment_url",
    "verified_paths",
  ]);
  if (entries.some(([name]) => !columns.has(name))) throw new Error("Invalid install update");
  const assignments = entries.map(([name], i) => `${name}=$${i + 4}`);
  const params = entries.map(([name, value]) =>
    ["target", "verified_paths"].includes(name) && value !== null ? JSON.stringify(value) : value,
  );
  const changed = await sql.query(
    `UPDATE citefleet_vercel_installs SET ${assignments.join(",")},updated_at=now()
    WHERE id=$1 AND workspace_id=$2 AND lease_id IS NOT DISTINCT FROM $3::uuid RETURNING id`,
    [row.id, row.workspace_id, row.lease_id, ...params],
  );
  if (!changed.length) throw new Error("Installation lease changed; refresh progress");
  Object.assign(row, values);
}
async function terminate(
  sql: Sql,
  row: VercelInstallRow,
  status: "verified" | "failed",
  message: string,
  transientToken?: string,
): Promise<void> {
  const held = await sql.query(
    "UPDATE citefleet_vercel_installs SET lease_until=CASE WHEN lease_id IS NULL THEN NULL ELSE now()+interval '3 minutes' END WHERE id=$1 AND workspace_id=$2 AND lease_id IS NOT DISTINCT FROM $3::uuid AND status NOT IN ('verified','failed') RETURNING id",
    [row.id, row.workspace_id, row.lease_id],
  );
  if (!held.length) throw new Error("Installation ownership changed before cleanup");
  let removed = !row.encrypted_token && !transientToken;
  try {
    const config = vercelInstallConfig();
    const token =
      transientToken ||
      (row.encrypted_token && config
        ? decryptVercelToken(row.encrypted_token, row.id, config.tokenKey)
        : "");
    if (token && row.configuration_id)
      removed = await removeVercelIntegration(token, row.configuration_id, row.team_id);
  } catch {
    removed = false;
  }
  await patch(sql, row, {
    status,
    encrypted_token: null,
    message: `${message}${removed ? "" : " Temporary access was discarded locally; remove the CiteFleet file-install integration in Vercel because revocation could not be confirmed."}`,
  });
  await sql.query(
    "UPDATE citefleet_vercel_installs SET finished_at=now(),state_hash=NULL WHERE id=$1 AND workspace_id=$2",
    [row.id, row.workspace_id],
  );
}
/** Bounded scheduler/start/advance cleanup; deletes local credentials even when Vercel is unavailable. */
export async function cleanupExpiredVercelInstalls(): Promise<void> {
  const sql = await getSql();
  const rows = await sql.query<VercelInstallRow>(
    `UPDATE citefleet_vercel_installs SET lease_id=$1,lease_until=now()+interval '3 minutes'
    WHERE id IN (SELECT id FROM citefleet_vercel_installs WHERE status NOT IN ('verified','failed')
      AND expires_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY expires_at LIMIT 3 FOR UPDATE SKIP LOCKED)
    RETURNING *`,
    [randomUUID()],
  );
  for (const row of rows)
    await terminate(
      sql,
      row,
      "failed",
      "Installation expired. Public installation was not confirmed; start again to retry.",
    );
}
async function context(request: Request) {
  const { assertSameSiteRequest } = await import("../auth/isolation.server.ts");
  const { currentSessionUser } = await import("../auth/operator.server.ts");
  const { workspaceForPrincipal } = await import("./workspace-registry.server.ts");
  assertSameSiteRequest();
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new Error("Cross-origin installation request refused");
  }
  const user = await currentSessionUser(request);
  if (!user) return null;
  const ws = await workspaceForPrincipal({ kind: "user", userId: user.id, email: user.email });
  return { user, ws, sql: await getSql() };
}
async function githubCredential(
  sql: Sql,
  userId: string,
  workspaceToken?: string,
): Promise<string> {
  const rows = await sql.query<{ github_token: string | null }>(
    "SELECT github_token FROM citefleet_users WHERE id=$1",
    [userId],
  );
  return rows[0]?.github_token?.trim() || workspaceToken?.trim() || "";
}
async function latest(sql: Sql, workspaceId: string, userId: string, siteId: string) {
  return (
    (
      await sql.query<VercelInstallRow>(
        "SELECT * FROM citefleet_vercel_installs WHERE workspace_id=$1 AND user_id=$2 AND site_id=$3 ORDER BY created_at DESC LIMIT 1",
        [workspaceId, userId, siteId],
      )
    )[0] ?? null
  );
}
async function responseFor(
  ctx: NonNullable<Awaited<ReturnType<typeof context>>>,
  siteId: string,
): Promise<Response> {
  const store = await ctx.ws.get();
  if (!getSite(store, siteId)) return json({ error: "Property not found" }, 404);
  const row = await latest(ctx.sql, ctx.ws.id, ctx.user.id, siteId);
  const result: VercelInstallResponse = {
    configured: Boolean(vercelInstallConfig()),
    githubConnected: Boolean(
      await githubCredential(ctx.sql, ctx.user.id, store.workspace.githubToken),
    ),
    job: row
      ? {
          operationId: row.id,
          status: row.status,
          message: row.message,
          projectName: row.target?.projectName,
          deploymentUrl: row.deployment_url ?? undefined,
          verifiedPaths: row.verified_paths,
        }
      : null,
  };
  return json(result);
}
export async function getVercelInstallStatus(request: Request): Promise<Response> {
  const ctx = await context(request);
  if (!ctx) return json({ error: "Sign in with an account" }, 401);
  return responseFor(ctx, new URL(request.url).searchParams.get("siteId") ?? "");
}
export async function startVercelInstall(request: Request): Promise<Response> {
  const ctx = await context(request);
  if (!ctx) return redirect("/login");
  const siteId = String((await request.formData()).get("siteId") ?? "");
  const config = vercelInstallConfig();
  if (!config) return json({ error: "Vercel file installation is not configured" }, 503);
  const store = await ctx.ws.get();
  assertCanAct(store, "spend");
  assertVercelProperty(getSite(store, siteId));
  if (!(await githubCredential(ctx.sql, ctx.user.id, store.workspace.githubToken)))
    return json({ error: "Connect GitHub before installing Vercel files" }, 409);
  await cleanupExpiredVercelInstalls();
  const { ensureIndexNowKey } = await import("./dispatcher.ts");
  await ensureIndexNowKey(ctx.ws, siteId);
  const current = await ctx.ws.get();
  assertCanAct(current, "spend");
  const site = getSite(current, siteId);
  assertVercelProperty(site);
  const files = packFiles(site);
  if (files.length !== 5) throw new Error("The origin package must contain five files");
  const state = randomBytes(32).toString("base64url");
  const inserted = await ctx.sql.query(
    `INSERT INTO citefleet_vercel_installs
    (id,workspace_id,user_id,site_id,domain,site_url,client_id,state_hash,status,message,expected_files,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'authorization-pending','Waiting for Vercel authorization',$9,now()+interval '10 minutes')
    ON CONFLICT (workspace_id,site_id) WHERE status NOT IN ('verified','failed') DO NOTHING RETURNING id`,
    [
      randomUUID(),
      ctx.ws.id,
      ctx.user.id,
      siteId,
      site.domain,
      site.url,
      config.clientId,
      digest(state),
      JSON.stringify(files),
    ],
  );
  return inserted.length ? redirect(vercelAuthorizationUrl(config, state)) : campaign(siteId);
}
export async function finishVercelInstall(request: Request): Promise<Response> {
  const ctx = await context(request);
  if (!ctx) return redirect("/login");
  const url = new URL(request.url);
  const row = await consumeVercelInstallState(
    ctx.sql,
    url.searchParams.get("state") ?? "",
    ctx.user.id,
    ctx.ws.id,
  );
  if (!row) return json({ error: "Invalid or expired Vercel authorization" }, 400);
  let token = "";
  try {
    const config = vercelInstallConfig();
    if (!config || config.clientId !== row.client_id)
      throw new Error("Vercel installation configuration changed; start again");
    const code = url.searchParams.get("code") ?? "";
    const configurationId = url.searchParams.get("configurationId") ?? "";
    const teamId = url.searchParams.get("teamId") || null;
    if (
      url.searchParams.has("error") ||
      !code ||
      code.length > 4096 ||
      !/^icfg_[A-Za-z0-9_-]{6,160}$/.test(configurationId) ||
      (teamId && !/^team_[A-Za-z0-9_-]{6,160}$/.test(teamId))
    )
      throw new Error("Vercel access was not approved");
    const store = await ctx.ws.get();
    assertCanAct(store, "spend");
    assertVercelProperty(getSite(store, row.site_id), row);
    const authorization = await exchangeVercelCode(code, config);
    token = authorization.accessToken;
    row.configuration_id =
      authorization.installationId &&
      /^icfg_[A-Za-z0-9_-]{6,160}$/.test(authorization.installationId)
        ? authorization.installationId
        : null;
    row.team_id = authorization.teamId;
    if (row.configuration_id !== configurationId)
      throw new Error("Vercel returned a different installation than the callback");
    if (authorization.teamId !== teamId)
      throw new Error("Vercel authorization account scope did not match");
    const scope = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    const result = await fetch(
      `https://api.vercel.com/v1/integrations/configuration/${encodeURIComponent(configurationId)}${scope}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!result.ok || !result.headers.get("content-type")?.includes("application/json"))
      throw new Error("Vercel installation identity could not be verified");
    const identity = (await result.json()) as {
      id?: unknown;
      integrationId?: unknown;
      teamId?: unknown;
    };
    if (
      identity.id !== configurationId ||
      identity.integrationId !== config.clientId ||
      (identity.teamId ?? null) !== teamId
    )
      throw new Error("Vercel installation identity did not match");
    await patch(ctx.sql, row, {
      status: "authorized",
      message: "Vercel authorized. Preparing the connected production repository.",
      configuration_id: configurationId,
      team_id: teamId,
      encrypted_token: encryptVercelToken(token, row.id, config.tokenKey),
    });
    await ctx.sql.query(
      "UPDATE citefleet_vercel_installs SET expires_at=now()+interval '30 minutes' WHERE id=$1 AND workspace_id=$2",
      [row.id, ctx.ws.id],
    );
  } catch {
    await terminate(
      ctx.sql,
      row,
      "failed",
      "Vercel authorization failed or was denied. No files were installed by this attempt.",
      token,
    );
  }
  const completion =
    row.status === "authorized" ? vercelCompletionUrl(url.searchParams.get("next")) : null;
  return completion ? redirect(completion) : campaign(row.site_id);
}
export async function advanceVercelInstall(request: Request): Promise<Response> {
  const ctx = await context(request);
  if (!ctx) return json({ error: "Sign in with an account" }, 401);
  const body = (await request.json()) as { siteId?: unknown };
  if (typeof body.siteId !== "string") return json({ error: "siteId is required" }, 400);
  const store = await ctx.ws.get();
  if (!getSite(store, body.siteId)) return json({ error: "Property not found" }, 404);
  await cleanupExpiredVercelInstalls();
  const candidate = await latest(ctx.sql, ctx.ws.id, ctx.user.id, body.siteId);
  if (!candidate || TERMINAL.has(candidate.status) || candidate.status === "authorization-pending")
    return responseFor(ctx, body.siteId);
  const row = await claimVercelInstall(ctx.sql, candidate.id, ctx.ws.id, ctx.user.id);
  if (!row) return responseFor(ctx, body.siteId);
  try {
    const config = vercelInstallConfig();
    if (!config || config.clientId !== row.client_id || !row.encrypted_token)
      throw new Error("Temporary Vercel authorization is unavailable; reconnect");
    const current = await ctx.ws.get();
    assertCanAct(current, "spend");
    const site = getSite(current, row.site_id);
    assertVercelProperty(site, row);
    if (JSON.stringify(packFiles(site)) !== JSON.stringify(row.expected_files))
      throw new Error("The five-file package changed after authorization; start again");
    const token = decryptVercelToken(row.encrypted_token, row.id, config.tokenKey);
    const adapter = await import("./vercel-project.server.ts");
    // Renew and check durable ownership before each bounded provider API request.
    // A suspended/stale runner cannot start another request after another worker claims it.
    const guardedDeps = {
      fetch: (async (input, init) => {
        const renewed = await ctx.sql.query(
          "UPDATE citefleet_vercel_installs SET lease_until=now()+interval '3 minutes' WHERE id=$1 AND workspace_id=$2 AND lease_id=$3 AND lease_until>now() AND expires_at>now() AND status NOT IN ('verified','failed') RETURNING id",
          [row.id, ctx.ws.id, row.lease_id],
        );
        if (!renewed.length)
          throw new Error("Installation lease expired or changed; refresh progress");
        return fetch(input, init);
      }) as typeof fetch,
    };
    if (row.status === "authorized") {
      const target = await adapter.resolveVercelProject(token, row.team_id, site, guardedDeps);
      const conflict = originRepoConflict(site, target.repo, current.sites);
      if (conflict) throw new Error(conflict.message);
      await patch(ctx.sql, row, {
        target,
        status: "installing",
        message: "Installing the five files in the connected production repository.",
      });
      const githubToken = await githubCredential(
        ctx.sql,
        ctx.user.id,
        current.workspace.githubToken,
      );
      if (!githubToken) throw new Error("GitHub connection is unavailable; reconnect");
      const installed = await adapter.installVercelRepoFiles(
        githubToken,
        site,
        target,
        guardedDeps,
        row.expected_files,
      );
      await patch(ctx.sql, row, {
        commit_sha: installed.commitSha,
        status: "building",
        message: "Files saved to the repository. Preparing the Vercel production deployment.",
      });
    } else if (row.status === "installing") {
      throw new Error(
        "The repository write was interrupted. Its outcome is unknown; inspect the repository before starting again",
      );
    } else if (row.status === "building") {
      if (!row.target || !row.commit_sha)
        throw new Error("The pinned deployment source is unavailable");
      if (!row.deployment_id) {
        const liveTarget = await adapter.resolveVercelProject(
          token,
          row.team_id,
          site,
          guardedDeps,
        );
        if (
          liveTarget.projectId !== row.target.projectId ||
          JSON.stringify(liveTarget.repo) !== JSON.stringify(row.target.repo)
        )
          throw new Error(
            "The Vercel production repository changed after authorization; start again",
          );
        const conflict = originRepoConflict(site, liveTarget.repo, current.sites);
        if (conflict) throw new Error(conflict.message);
        const deployed = await adapter.createVercelDeployment(
          token,
          row.target,
          row.commit_sha,
          row.id,
          guardedDeps,
        );
        await patch(ctx.sql, row, {
          deployment_id: deployed.id,
          deployment_url: deployed.url,
          message: "Vercel is building the production deployment. Files are not yet verified live.",
        });
      } else {
        const deployment = await adapter.readVercelDeployment(
          token,
          row.target,
          row.deployment_id,
          row.commit_sha,
          guardedDeps,
        );
        if (deployment.state === "failed")
          throw new Error(
            deployment.message ||
              "The Vercel build failed; repository files remain saved but public installation is unverified",
          );
        if (deployment.state === "ready")
          await patch(ctx.sql, row, {
            status: "verifying",
            message: "Vercel reports Ready. Checking all five files on your website.",
          });
      }
    } else if (row.status === "verifying") {
      const result = await adapter.verifyVercelOriginFiles(site, row.expected_files);
      await patch(ctx.sql, row, { verified_paths: result.verified });
      if (result.problems.length || result.verified.length !== 5)
        await patch(ctx.sql, row, {
          message:
            "The deployment is Ready, but all five public files are not yet verified. Retrying until the installation expires.",
        });
      else
        await terminate(ctx.sql, row, "verified", "All five files were verified on your website.");
    }
  } catch (error) {
    // Adapter errors describe operations/status codes, never provider response bodies or credentials.
    const message = error instanceof Error ? error.message : "Vercel installation failed";
    await terminate(ctx.sql, row, "failed", message);
  } finally {
    await ctx.sql.query(
      "UPDATE citefleet_vercel_installs SET lease_id=NULL,lease_until=NULL WHERE id=$1 AND workspace_id=$2 AND lease_id=$3",
      [row.id, ctx.ws.id, row.lease_id],
    );
  }
  return responseFor(ctx, body.siteId);
}
