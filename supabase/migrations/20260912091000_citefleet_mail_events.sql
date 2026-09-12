-- Transactional-mail telemetry without recipient addresses or reset tokens.
-- `accepted` means the SMTP provider returned 250 after DATA; it deliberately
-- does not claim inbox delivery, which Gmail SMTP cannot report by webhook.

CREATE TABLE IF NOT EXISTS citefleet_mail_events (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('password-reset', 'renewal-reminder')),
  user_id        TEXT REFERENCES citefleet_users (id) ON DELETE SET NULL,
  status         TEXT NOT NULL CHECK (status IN ('queued', 'accepted', 'failed')),
  provider       TEXT NOT NULL DEFAULT 'gmail-smtp',
  attempts       INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  latency_ms     INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  failure_code   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS citefleet_mail_events_user_idx
  ON citefleet_mail_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS citefleet_mail_events_status_idx
  ON citefleet_mail_events (status, created_at DESC);

ALTER TABLE citefleet_mail_events OWNER TO citefleet;
ALTER TABLE citefleet_mail_events ENABLE ROW LEVEL SECURITY;

-- A browser timer is not an abuse control. This row is claimed atomically by
-- every app container before another reset token is created or message sent.
CREATE TABLE IF NOT EXISTS citefleet_mail_limits (
  kind            TEXT NOT NULL CHECK (kind IN ('password-reset', 'renewal-reminder')),
  user_id         TEXT NOT NULL REFERENCES citefleet_users (id) ON DELETE CASCADE,
  next_allowed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (kind, user_id)
);

ALTER TABLE citefleet_mail_limits OWNER TO citefleet;
ALTER TABLE citefleet_mail_limits ENABLE ROW LEVEL SECURITY;
