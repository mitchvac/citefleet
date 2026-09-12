import { getSql } from "./db.ts";

const DEFAULT_DATABASE_TIMEOUT_MS = 3_000;

/** A release identity is one complete git commit, never a branch or short SHA. */
export function deploymentRevision(value = process.env.CITEFLEET_REVISION): string | null {
  const revision = value?.trim() ?? "";
  return /^[0-9a-f]{40}$/i.test(revision) ? revision.toLowerCase() : null;
}

async function queryDatabase(): Promise<unknown> {
  const sql = await getSql();
  return sql.query("SELECT 1 AS ok");
}

/** Bound readiness so a stalled pool cannot leave a deployment probe hanging. */
export async function checkDatabase(
  query: () => Promise<unknown> = queryDatabase,
  timeoutMs = DEFAULT_DATABASE_TIMEOUT_MS,
): Promise<boolean> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      query(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("database readiness timed out")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
