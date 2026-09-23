import { getSql, type Sql } from "../db.ts";
import {
  originDigest,
  originNonce,
  ORIGIN_TTL_SECONDS,
  validOriginNonce,
  type OriginMetadata,
} from "./vercel-origin.server.ts";
import type { WorkspaceId } from "./workspace-id.ts";
export type OriginPending = {
  metadata: OriginMetadata;
  user_id: string | null;
  workspace_id: string | null;
  consumed_at: Date | null;
  site_id: string | null;
};
export async function createOriginPending(metadata: OriginMetadata, sql?: Sql): Promise<string> {
  const db = sql ?? (await getSql());
  const token = originNonce();
  await db.query("DELETE FROM citefleet_vercel_origin_installs WHERE expires_at <= now()");
  await db.query(
    "INSERT INTO citefleet_vercel_origin_installs (token_hash, metadata, expires_at) VALUES ($1, $2::jsonb, now() + $3 * interval '1 second')",
    [originDigest(token), JSON.stringify(metadata), ORIGIN_TTL_SECONDS],
  );
  return token;
}
/** Atomic account binding; a second user cannot adopt a browser's old pending installation. */
export async function bindOriginPending(
  token: string,
  userId: string,
  workspaceId: WorkspaceId,
  sql?: Sql,
): Promise<OriginPending | null> {
  if (!validOriginNonce(token)) return null;
  const db = sql ?? (await getSql());
  const rows = await db.query<OriginPending>(
    `UPDATE citefleet_vercel_origin_installs AS i
    SET user_id = $2, workspace_id = $3
    WHERE token_hash = $1 AND expires_at > now()
      AND (user_id IS NULL OR (user_id = $2 AND workspace_id = $3))
      AND EXISTS (SELECT 1 FROM citefleet_workspace_members m JOIN citefleet_workspaces w ON w.id=m.workspace_id
        WHERE m.user_id=$2 AND m.workspace_id=$3 AND w.archived_at IS NULL)
    RETURNING metadata, user_id, workspace_id, consumed_at, site_id`,
    [originDigest(token), userId, workspaceId],
  );
  return rows[0] ?? null;
}
export async function consumeOriginPending(
  token: string,
  userId: string,
  workspaceId: WorkspaceId,
  sql?: Sql,
): Promise<boolean> {
  if (!validOriginNonce(token)) return false;
  const db = sql ?? (await getSql());
  const rows = await db.query(
    `UPDATE citefleet_vercel_origin_installs SET consumed_at = now()
    WHERE token_hash=$1 AND user_id=$2 AND workspace_id=$3 AND consumed_at IS NULL AND expires_at > now()
      AND EXISTS (SELECT 1 FROM citefleet_workspace_members m JOIN citefleet_workspaces w ON w.id=m.workspace_id
        WHERE m.user_id=$2 AND m.workspace_id=$3 AND w.archived_at IS NULL)
    RETURNING token_hash`,
    [originDigest(token), userId, workspaceId],
  );
  return rows.length === 1;
}
export async function finishOriginPending(
  token: string,
  userId: string,
  workspaceId: WorkspaceId,
  siteId: string,
  sql?: Sql,
): Promise<void> {
  const db = sql ?? (await getSql());
  await db.query(
    "UPDATE citefleet_vercel_origin_installs SET site_id=$4 WHERE token_hash=$1 AND user_id=$2 AND workspace_id=$3 AND consumed_at IS NOT NULL",
    [originDigest(token), userId, workspaceId, siteId],
  );
}
