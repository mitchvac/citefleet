// Server-only. Who is allowed into which workspace, and the ONLY place a
// `WorkspaceHandle` is produced.
//
// Every resolution here fails closed. There is no "if we cannot tell, use the
// first one" branch and no default tenant, because both of those resolve an
// ambiguous request by picking somebody's data — and the request that gets
// picked wrong is a customer reading another customer's workspace.
//
// Isolation is enforced HERE and in the handle, not by row-level security. The
// app connects as `citefleet`, which OWNS every table, and a table owner
// bypasses RLS unless FORCE ROW LEVEL SECURITY is set (it is not; local dev and
// the VPS fallback connect as superuser and would bypass even that). RLS is
// enabled on these tables as posture and for the CI lint. It is not the wall.

import { getSql, withTransaction, type Sql } from "../db.ts";
import { saveSnapshot } from "./persist.ts";
import { seedStore } from "./seed.ts";
import { handleFor, type WorkspaceHandle } from "./workspace-handle.ts";
import { asWorkspaceId, newWorkspaceId, type WorkspaceId } from "./workspace-id.ts";
import type { Principal } from "../auth/operator.server.ts";

/** Raised when a caller is signed in but no workspace can be resolved for them. */
export class NoWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoWorkspaceError";
  }
}

/**
 * The workspace the break-glass token may act on, if the operator has named one.
 *
 * Read per call rather than cached at import: an env var read once at module
 * load is a different value from the one the operator set, in the one situation
 * where they are reaching for a break-glass credential.
 */
function breakGlassWorkspace(env = process.env): WorkspaceId | null {
  const raw = env.CITEFLEET_BREAK_GLASS_WORKSPACE?.trim();
  return raw ? asWorkspaceId(raw) : null;
}

/**
 * Resolve the workspace a signed-in caller acts in.
 *
 * Order, and why: exactly one membership is unambiguous. More than one needs the
 * member's default, which the database guarantees is unique per user (a partial
 * unique index, not a code convention). Anything else throws.
 */
export async function workspaceForPrincipal(principal: Principal): Promise<WorkspaceHandle> {
  if (principal.kind === "break-glass") {
    const pinned = breakGlassWorkspace();
    if (!pinned) {
      throw new NoWorkspaceError(
        "This is the shared operator token, which has no account and therefore no workspace. " +
          "Sign in with an account, or set CITEFLEET_BREAK_GLASS_WORKSPACE to the one workspace " +
          "it may act on.",
      );
    }
    return handleFor(pinned);
  }

  const sql = await getSql();
  const rows = await sql.query<{ workspace_id: string; is_default: boolean }>(
    `SELECT m.workspace_id, m.is_default
       FROM citefleet_workspace_members m
       JOIN citefleet_workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 AND w.archived_at IS NULL
      ORDER BY m.is_default DESC, m.created_at ASC`,
    [principal.userId],
  );

  if (rows.length === 0) {
    throw new NoWorkspaceError(
      `${principal.email} is signed in but belongs to no workspace. An account is added to a ` +
        "workspace when it is created or invited; this one has neither.",
    );
  }
  if (rows.length > 1 && !rows[0].is_default) {
    // Ordered default-first, so a non-default head means no default exists.
    throw new NoWorkspaceError(
      `${principal.email} belongs to ${rows.length} workspaces and none is marked default. ` +
        "Refusing to guess which one this request meant.",
    );
  }
  return handleFor(asWorkspaceId(rows[0].workspace_id));
}

/**
 * Create a workspace and make `userId` its owner, atomically.
 *
 * All three writes are one transaction on purpose: a workspace with no member is
 * unreachable by anyone, and a membership pointing at a workspace with no
 * snapshot resolves to a handle whose first read seeds an empty store over the
 * missing row. Both are silent, and both are only possible if these can
 * half-apply.
 */
export async function createWorkspace(
  userId: string,
  name = "CiteFleet",
  id: WorkspaceId = newWorkspaceId(),
): Promise<WorkspaceHandle> {
  await withTransaction(async (tx) => {
    // `plan` and `region` are written explicitly rather than left to the column
    // defaults, because `seedStore` puts its own values in the JSONB document.
    // Letting the column default to 'starter' while the document says
    // 'enterprise' gives one workspace two answers about what it is.
    const seeded = seedStore(id, name);
    await tx.query(
      `INSERT INTO citefleet_workspaces (id, slug, name, plan, region) VALUES ($1, $2, $3, $4, $5)`,
      [id, id.replace(/^ws-/, ""), name, seeded.workspace.plan, seeded.workspace.region],
    );
    await tx.query(
      `INSERT INTO citefleet_workspace_members (workspace_id, user_id, role, is_default)
       VALUES ($1, $2, 'owner', NOT EXISTS (
         SELECT 1 FROM citefleet_workspace_members WHERE user_id = $2 AND is_default
       ))`,
      [id, userId],
    );
    // `expected: null` — this row must not exist yet. A workspace id collision
    // fails the whole transaction rather than overwriting somebody's workspace.
    await saveSnapshot(id, seeded, null, tx);
  });
  return handleFor(id);
}

/**
 * Which workspace holds the property serving `domain`, if any.
 *
 * A webhook arrives with no session — it is authenticated by a signature over
 * the body, and the secret that verifies it lives on the site. So the tenant has
 * to be found from the payload, and it must be found by SEARCHING, never by
 * defaulting: answering "the root workspace" would hand one customer's deploy
 * hook to another customer's property the moment a second workspace exists.
 *
 * This reads the snapshots directly rather than a routing table. It is O(number
 * of workspaces) and the index that makes it O(1) — `citefleet_domains`, with
 * the domain as primary key so two tenants cannot both claim one — is the
 * follow-up. That index is a PERFORMANCE fix; this is already correct.
 */
export async function workspaceForDomain(domain: string): Promise<WorkspaceHandle | null> {
  const bare = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!bare) return null;
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `SELECT s.id
       FROM citefleet_snapshot s
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.payload->'sites') AS site
         WHERE regexp_replace(lower(site->>'domain'), '^www\\.', '') = $1
      )
      LIMIT 2`,
    [bare],
  );
  // Two tenants claiming one domain is not a routing question to resolve by
  // picking one — at most one of them controls the origin. Refuse and say so.
  if (rows.length !== 1) return null;
  return handleFor(asWorkspaceId(rows[0].id));
}

/** The same, for a GitHub webhook, keyed by `owner/repo`. */
export async function workspaceForRepo(fullName: string): Promise<WorkspaceHandle | null> {
  const slug = fullName.trim().toLowerCase();
  // Both halves must be present. `"/"` and `"owner/"` used to reach the query,
  // where `concat()` coalesces a missing owner/repo to "" and built the very
  // same `"/"` — so an unauthenticated hook naming `"/"` resolved to any tenant
  // holding a site with no GitHub attachment.
  const [owner, repo, ...rest] = slug.split("/");
  if (!owner || !repo || rest.length) return null;
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    `SELECT s.id
       FROM citefleet_snapshot s
      WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.payload->'sites') AS site
         WHERE site->'github'->>'owner' IS NOT NULL
           AND site->'github'->>'repo' IS NOT NULL
           AND lower(site->'github'->>'owner') = $1
           AND lower(site->'github'->>'repo') = $2
      )
      LIMIT 2`,
    [owner, repo],
  );
  if (rows.length !== 1) return null;
  return handleFor(asWorkspaceId(rows[0].id));
}

/**
 * Give an account a workspace if it has none. Idempotent.
 *
 * Called on every sign-in path that can CREATE an account (sign-up, and OAuth,
 * where a first sign-in is also a registration). Without it a new account
 * resolves to no workspace and signs in to a console that can load nothing,
 * because `workspaceForPrincipal` refuses to guess a tenant.
 */
export async function ensureWorkspaceFor(userId: string, name: string): Promise<WorkspaceHandle> {
  const sql = await getSql();
  const rows = await sql.query<{ workspace_id: string }>(
    `SELECT m.workspace_id
       FROM citefleet_workspace_members m
       JOIN citefleet_workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 AND w.archived_at IS NULL
      ORDER BY m.is_default DESC, m.created_at ASC
      LIMIT 1`,
    [userId],
  );
  if (rows.length) return handleFor(asWorkspaceId(rows[0].workspace_id));
  return createWorkspace(userId, name);
}

/** Add an existing account to an existing workspace. */
export async function addMember(
  workspaceId: WorkspaceId,
  userId: string,
  role: "owner" | "admin" | "member" = "member",
  sql?: Sql,
): Promise<void> {
  const db = sql ?? (await getSql());
  await db.query(
    `INSERT INTO citefleet_workspace_members (workspace_id, user_id, role, is_default)
     VALUES ($1, $2, $3, NOT EXISTS (
       SELECT 1 FROM citefleet_workspace_members WHERE user_id = $2 AND is_default
     ))
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspaceId, userId, role],
  );
}

/** Every workspace an account can act in, for a future switcher and for support. */
export async function membershipsOf(
  userId: string,
): Promise<Array<{ id: WorkspaceId; name: string; role: string; isDefault: boolean }>> {
  const sql = await getSql();
  const rows = await sql.query<{
    id: string;
    name: string;
    role: string;
    is_default: boolean;
  }>(
    `SELECT w.id, w.name, m.role, m.is_default
       FROM citefleet_workspace_members m
       JOIN citefleet_workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = $1 AND w.archived_at IS NULL
      ORDER BY m.is_default DESC, w.created_at ASC`,
    [userId],
  );
  return rows.map((r) => ({
    id: asWorkspaceId(r.id),
    name: r.name,
    role: r.role,
    isDefault: r.is_default,
  }));
}
