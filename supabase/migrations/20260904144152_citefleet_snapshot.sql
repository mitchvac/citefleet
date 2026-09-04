-- The workspace store: one row holding the whole CiteFleet workspace as JSONB.
-- Read once per process boot and rewritten on every mutation (see
-- src/lib/citefleet/store.ts, which caches it in memory).

CREATE TABLE IF NOT EXISTS citefleet_snapshot (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
