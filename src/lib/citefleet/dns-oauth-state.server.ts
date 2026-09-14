import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db.ts";
import { asWorkspaceId, type WorkspaceId } from "./workspace-id.ts";

export const DNS_OAUTH_TTL_MS = 10 * 60 * 1000;

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
  provider: "cloudflare";
  domain: string;
};

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
    provider: row.provider,
    domain: row.domain,
  };
}
