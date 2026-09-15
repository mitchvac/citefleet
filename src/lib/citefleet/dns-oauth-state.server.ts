import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db.ts";
import { asWorkspaceId, type WorkspaceId } from "./workspace-id.ts";

export const DNS_OAUTH_TTL_MS = 10 * 60 * 1000;
export const PORKBUN_AUTH_TTL_MS = 30 * 60 * 1000;

export interface DnsOAuthState {
  operationId: string;
  workspaceId: WorkspaceId;
  userId: string;
  siteId: string;
  provider: "cloudflare";
  domain: string;
}

type DnsOAuthRow = {
  operation_id: string;
  workspace_id: string;
  user_id: string;
  site_id: string;
  provider: "cloudflare" | "porkbun";
  domain: string;
  pkce_verifier?: string | null;
};

export interface PorkbunAuthorizationState {
  operationId: string;
  workspaceId: WorkspaceId;
  userId: string;
  siteId: string;
  provider: "porkbun";
  domain: string;
  codeVerifier: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createDnsOAuthState(
  input: Omit<DnsOAuthState, "operationId">,
  deps: { sql?: Sql; now?: () => Date; randomState?: () => string; randomId?: () => string } = {},
): Promise<{ state: string; operationId: string }> {
  const sql = deps.sql ?? (await getSql());
  const now = deps.now?.() ?? new Date();
  const state = deps.randomState?.() ?? randomBytes(32).toString("base64url");
  const operationId = `dns-${deps.randomId?.() ?? randomUUID()}`;
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) throw new Error("invalid OAuth state entropy");

  await sql.query("DELETE FROM citefleet_dns_oauth_states WHERE expires_at <= $1", [now]);
  await sql.query(
    `INSERT INTO citefleet_dns_oauth_states
       (state_hash, operation_id, workspace_id, user_id, site_id, provider, domain, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      digest(state),
      operationId,
      input.workspaceId,
      input.userId,
      input.siteId,
      input.provider,
      input.domain,
      new Date(now.getTime() + DNS_OAUTH_TTL_MS),
    ],
  );
  return { state, operationId };
}

export async function consumeDnsOAuthState(
  state: string,
  userId: string,
  deps: { sql?: Sql; now?: () => Date } = {},
): Promise<DnsOAuthState | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  const sql = deps.sql ?? (await getSql());
  const rows = await sql.query<DnsOAuthRow>(
    `UPDATE citefleet_dns_oauth_states AS oauth
        SET consumed_at = $3
       FROM citefleet_workspace_members AS member,
            citefleet_workspaces AS workspace
      WHERE oauth.state_hash = $1
        AND oauth.user_id = $2
        AND oauth.provider = 'cloudflare'
        AND oauth.consumed_at IS NULL
        AND oauth.expires_at > $3
        AND member.workspace_id = oauth.workspace_id
        AND member.user_id = oauth.user_id
        AND workspace.id = oauth.workspace_id
        AND workspace.archived_at IS NULL
      RETURNING oauth.operation_id, oauth.workspace_id, oauth.user_id,
                oauth.site_id, oauth.provider, oauth.domain`,
    [digest(state), userId, deps.now?.() ?? new Date()],
  );
  if (rows.length !== 1) return null;
  const row = rows[0];
  return {
    operationId: row.operation_id,
    workspaceId: asWorkspaceId(row.workspace_id),
    userId: row.user_id,
    siteId: row.site_id,
    provider: "cloudflare",
    domain: row.domain,
  };
}

export async function createPorkbunAuthorizationState(
  input: {
    workspaceId: WorkspaceId;
    userId: string;
    siteId: string;
    domain: string;
    requestToken: string;
    codeVerifier: string;
  },
  deps: { sql?: Sql; now?: () => Date; randomId?: () => string } = {},
): Promise<{ operationId: string }> {
  if (!/^[a-f0-9]{64}$/.test(input.requestToken)) {
    throw new Error("invalid Porkbun request token");
  }
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) {
    throw new Error("invalid Porkbun PKCE verifier");
  }
  const sql = deps.sql ?? (await getSql());
  const now = deps.now?.() ?? new Date();
  const operationId = `dns-${deps.randomId?.() ?? randomUUID()}`;
  await sql.query("DELETE FROM citefleet_dns_oauth_states WHERE expires_at <= $1", [now]);
  await sql.query(
    `INSERT INTO citefleet_dns_oauth_states
       (state_hash, operation_id, workspace_id, user_id, site_id, provider, domain,
        pkce_verifier, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'porkbun', $6, $7, $8)`,
    [
      digest(input.requestToken),
      operationId,
      input.workspaceId,
      input.userId,
      input.siteId,
      input.domain,
      input.codeVerifier,
      new Date(now.getTime() + PORKBUN_AUTH_TTL_MS),
    ],
  );
  return { operationId };
}

export async function consumePorkbunAuthorizationState(
  requestToken: string,
  userId: string,
  deps: { sql?: Sql; now?: () => Date } = {},
): Promise<PorkbunAuthorizationState | null> {
  if (!/^[a-f0-9]{64}$/.test(requestToken)) return null;
  const sql = deps.sql ?? (await getSql());
  const rows = await sql.query<DnsOAuthRow>(
    `DELETE FROM citefleet_dns_oauth_states AS oauth
      USING citefleet_workspace_members AS member,
            citefleet_workspaces AS workspace
      WHERE oauth.state_hash = $1
        AND oauth.user_id = $2
        AND oauth.provider = 'porkbun'
        AND oauth.consumed_at IS NULL
        AND oauth.expires_at > $3
        AND member.workspace_id = oauth.workspace_id
        AND member.user_id = oauth.user_id
        AND workspace.id = oauth.workspace_id
        AND workspace.archived_at IS NULL
      RETURNING oauth.operation_id, oauth.workspace_id, oauth.user_id,
                oauth.site_id, oauth.provider, oauth.domain, oauth.pkce_verifier`,
    [digest(requestToken), userId, deps.now?.() ?? new Date()],
  );
  const codeVerifier = rows[0]?.pkce_verifier;
  if (rows.length !== 1 || !codeVerifier) return null;
  const row = rows[0];
  return {
    operationId: row.operation_id,
    workspaceId: asWorkspaceId(row.workspace_id),
    userId: row.user_id,
    siteId: row.site_id,
    provider: "porkbun",
    domain: row.domain,
    codeVerifier,
  };
}
