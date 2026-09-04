/**
 * The app's Postgres client — node-postgres (`pg`) over `DATABASE_URL`.
 *
 * `DATABASE_URL` is **required**. There is no embedded fallback: a database the
 * app invents at runtime cannot be migrated by the Supabase CLI, so it would
 * drift from production the moment a migration lands. Local development points
 * at a real Postgres instead:
 *
 *   supabase start                     # boots Postgres 17, same major as prod
 *   supabase status -o env             # prints DB_URL
 *   DATABASE_URL=<that> npm run dev
 *
 * Schema lives in `supabase/migrations/` and is applied by the Supabase CLI
 * (`supabase db reset` locally, `supabase db push` in CI) — never by this
 * process. The app does no DDL.
 */

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset", so it fails loudly instead of connecting to nothing.
const rawDatabaseUrl =
  typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl =
  rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

/** Whether a database is configured. `/health` reports this. */
export const dbConfigured = Boolean(databaseUrl);

/**
 * Minimal SQL surface. Both the tagged-template and `.query()` forms resolve to
 * an array of row objects:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/**
 * Init state lives on globalThis as a promise: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool. A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
};

/**
 * Result-type parity: Postgres sends every value as text plus a type OID, and
 * the JS value is the driver's parsing choice. Normalize `pg`'s defaults so
 * rows are JSON-safe and stable:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string (arbitrary precision).
 */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}

const MISSING_DATABASE_URL =
  "DATABASE_URL is not set. CiteFleet has no embedded database fallback — " +
  "run `supabase start` and export DB_URL from `supabase status -o env`, or " +
  "point DATABASE_URL at the Supabase session pooler for a deployment.";

function createPgSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    if (!databaseUrl) throw new Error(MISSING_DATABASE_URL);
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    // One pool per process. Correct against Supabase's session pooler (5432)
    // and against a direct connection; the transaction pooler (6543) holds no
    // session state and is not supported here.
    const pool = new Pool({ connectionString: databaseUrl });
    return toSql(async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    });
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  return createPgSql();
}

/**
 * Get the shared, **server-only** SQL client. Memoized — safe to call per
 * request. Throws when `DATABASE_URL` is unset.
 *
 * Schema comes from `supabase/migrations/*.sql`, applied by the Supabase CLI —
 * define tables there, never inline in server functions.
 */
export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null; // don't memoize failures — let the next call retry
    throw err;
  });
  return sqlPromise;
}

/**
 * Create the pool before the server handles traffic. `pg` connects lazily, so
 * this validates configuration (a missing `DATABASE_URL` throws here) without
 * requiring the database to be reachable at boot.
 *
 * Vite `configureServer` awaits this at dev startup.
 */
export function ensureDbReady(): Promise<void> {
  return getSql().then(() => undefined);
}
