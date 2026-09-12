import { randomBytes } from "node:crypto";
import { getSql } from "../db.ts";
import { mailFailureCode, sendMail, type Mail, type MailReceipt, type SmtpError } from "./smtp.ts";

export type MailKind = "password-reset" | "renewal-reminder";

export type MailEvent = {
  id: string;
  startedAt: number;
};

/** Atomically reserve a per-account send window across every app process. */
export async function reserveMailSlot(
  kind: MailKind,
  userId: string,
  cooldownMs: number,
  now = Date.now(),
): Promise<boolean> {
  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) {
    throw new Error("mail cooldown must be positive");
  }
  const sql = await getSql();
  const rows = await sql.query<{ user_id: string }>(
    `INSERT INTO citefleet_mail_limits (kind, user_id, next_allowed_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (kind, user_id) DO UPDATE
       SET next_allowed_at = EXCLUDED.next_allowed_at
       WHERE citefleet_mail_limits.next_allowed_at <= $4
     RETURNING user_id`,
    [kind, userId, new Date(now + cooldownMs).toISOString(), new Date(now).toISOString()],
  );
  return Boolean(rows[0]);
}

export async function beginMailEvent(kind: MailKind, userId: string | null): Promise<MailEvent> {
  const id = randomBytes(16).toString("hex");
  const startedAt = Date.now();
  const sql = await getSql();
  await sql.query(
    `INSERT INTO citefleet_mail_events (id, kind, user_id, status)
     VALUES ($1, $2, $3, 'queued')`,
    [id, kind, userId],
  );
  return { id, startedAt };
}

export async function acceptMailEvent(event: MailEvent, receipt: MailReceipt): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `UPDATE citefleet_mail_events
        SET status = 'accepted', attempts = $2, latency_ms = $3,
            accepted_at = $4, updated_at = now(), failure_code = NULL
      WHERE id = $1`,
    [event.id, receipt.attempts, Math.max(0, Date.now() - event.startedAt), receipt.acceptedAt],
  );
}

export async function failMailEvent(event: MailEvent, error: unknown): Promise<void> {
  const sql = await getSql();
  const attempts =
    error && typeof error === "object" && "attempts" in error
      ? Math.max(1, Number((error as SmtpError).attempts) || 1)
      : 1;
  await sql.query(
    `UPDATE citefleet_mail_events
        SET status = 'failed', attempts = $2, latency_ms = $3,
            failure_code = $4, updated_at = now()
      WHERE id = $1`,
    [event.id, attempts, Math.max(0, Date.now() - event.startedAt), mailFailureCode(error)],
  );
}

export function logMailEvent(input: {
  id: string | null;
  kind: MailKind;
  status: "accepted" | "failed" | "telemetry-failed";
  attempts?: number;
  failureCode?: string;
}): void {
  const line = JSON.stringify({
    event: "mail",
    revision: process.env.CITEFLEET_REVISION || "unknown",
    ...input,
  });
  if (input.status === "accepted") console.info(line);
  else console.error(line);
}

export type MailDeliveryDependencies = {
  begin: typeof beginMailEvent;
  accept: typeof acceptMailEvent;
  fail: typeof failMailEvent;
  log: typeof logMailEvent;
  send: typeof sendMail;
};

const deliveryDependencies: MailDeliveryDependencies = {
  begin: beginMailEvent,
  accept: acceptMailEvent,
  fail: failMailEvent,
  log: logMailEvent,
  send: sendMail,
};

/**
 * Deliver one message and record what the SMTP provider actually established.
 * Telemetry is deliberately best-effort: an unavailable events table must not
 * stop a password reset, while a delivery failure still reaches the caller.
 */
export async function sendTrackedMail(
  kind: MailKind,
  userId: string | null,
  mail: Mail,
  dependencies: MailDeliveryDependencies = deliveryDependencies,
): Promise<MailReceipt> {
  let event: MailEvent | null = null;
  try {
    event = await dependencies.begin(kind, userId);
  } catch {
    dependencies.log({ id: null, kind, status: "telemetry-failed" });
  }

  try {
    const receipt = await dependencies.send(mail);
    if (event) {
      try {
        await dependencies.accept(event, receipt);
      } catch {
        dependencies.log({ id: event.id, kind, status: "telemetry-failed" });
      }
    }
    dependencies.log({
      id: event?.id ?? null,
      kind,
      status: "accepted",
      attempts: receipt.attempts,
    });
    return receipt;
  } catch (error) {
    if (event) {
      try {
        await dependencies.fail(event, error);
      } catch {
        dependencies.log({ id: event.id, kind, status: "telemetry-failed" });
      }
    }
    dependencies.log({
      id: event?.id ?? null,
      kind,
      status: "failed",
      failureCode: mailFailureCode(error),
    });
    throw error;
  }
}
