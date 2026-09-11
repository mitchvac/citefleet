// Browser-safe. The identity of a tenant, and the one place a value of that
// type can be made.
//
// Why a branded type and not `string`: every id in this codebase is a string —
// `siteId`, `taskId`, `botId`, `user.id`. A function taking `workspaceId: string`
// accepts all of them and compiles, so the mistake that reads ANOTHER TENANT'S
// DATA is a mistake the type system would wave through. Branding makes
// `WorkspaceId` unforgeable: the only way to obtain one is `asWorkspaceId`, which
// validates, or `toWorkspaceId`, which returns null instead of guessing.
//
// The brand exists only at compile time. It costs nothing at run time and the
// value is an ordinary string in JSON and in Postgres.

declare const workspaceBrand: unique symbol;

/** A validated tenant key. Not constructible by a cast outside this file. */
export type WorkspaceId = string & { readonly [workspaceBrand]: "WorkspaceId" };

/**
 * The shape of a workspace key: `ws-` then lower-case letters, digits or
 * hyphens. Deliberately narrow — it is a primary key, it appears in log lines
 * and it is compared for equality, so anything with surrounding whitespace or a
 * different case would be a second identity for the same tenant.
 */
export const WORKSPACE_ID_PATTERN = /^ws-[a-z0-9][a-z0-9-]{2,59}$/;

/** The tenant every pre-tenancy row belongs to, and the one the backfill creates. */
export const ROOT_WORKSPACE_ID = "ws-citefleet" as WorkspaceId;

export function isWorkspaceId(raw: unknown): raw is WorkspaceId {
  return typeof raw === "string" && WORKSPACE_ID_PATTERN.test(raw);
}

/**
 * Validate a string as a workspace key, or throw.
 *
 * Throws rather than returning a default, because there is no safe default: a
 * fallback tenant is how one customer's request ends up writing to another's
 * workspace. Fail closed.
 */
export function asWorkspaceId(raw: string): WorkspaceId {
  if (!isWorkspaceId(raw)) {
    throw new Error(
      `"${raw}" is not a workspace id — expected ws-<lower-case letters, digits or hyphens>.`,
    );
  }
  return raw;
}

/** The non-throwing form, for parsing untrusted input (a cookie, a query row). */
export function toWorkspaceId(raw: unknown): WorkspaceId | null {
  return isWorkspaceId(raw) ? raw : null;
}

/** Mint a new workspace key. Random, not sequential — it appears in URLs and logs. */
export function newWorkspaceId(): WorkspaceId {
  return `ws-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}` as WorkspaceId;
}
