import assert from "node:assert/strict";
import { test } from "node:test";
import { sendTrackedMail, type MailDeliveryDependencies, type MailEvent } from "./events.server.ts";
import { SmtpError, type MailReceipt } from "./smtp.ts";

const EVENT: MailEvent = { id: "event-1", startedAt: 1_000 };
const RECEIPT: MailReceipt = {
  attempts: 2,
  acceptedAt: "2026-09-12T12:00:00.000Z",
  messageId: "message-1",
};

function dependencies(overrides: Partial<MailDeliveryDependencies> = {}): MailDeliveryDependencies {
  return {
    begin: async () => EVENT,
    accept: async () => undefined,
    fail: async () => undefined,
    log: () => undefined,
    send: async () => RECEIPT,
    ...overrides,
  };
}

test("tracked mail records provider acceptance without putting the recipient in logs", async () => {
  const accepted: Array<[MailEvent, MailReceipt]> = [];
  const logs: Parameters<MailDeliveryDependencies["log"]>[0][] = [];
  const receipt = await sendTrackedMail(
    "password-reset",
    "user-1",
    { to: "private@example.test", subject: "Reset", text: "body" },
    dependencies({
      accept: async (...args) => {
        accepted.push(args);
      },
      log: (record) => logs.push(record),
    }),
  );

  assert.deepEqual(receipt, RECEIPT);
  assert.deepEqual(accepted, [[EVENT, RECEIPT]]);
  assert.deepEqual(logs, [
    {
      id: EVENT.id,
      kind: "password-reset",
      status: "accepted",
      attempts: 2,
    },
  ]);
  assert.equal(JSON.stringify(logs).includes("private@example.test"), false);
});

test("telemetry outages never suppress an otherwise accepted message", async () => {
  const logs: Parameters<MailDeliveryDependencies["log"]>[0][] = [];
  await assert.doesNotReject(
    sendTrackedMail(
      "renewal-reminder",
      null,
      { to: "ops@example.test", subject: "Renew", text: "body" },
      dependencies({
        begin: async () => {
          throw new Error("database unavailable");
        },
        log: (record) => logs.push(record),
      }),
    ),
  );
  assert.deepEqual(
    logs.map((record) => record.status),
    ["telemetry-failed", "accepted"],
  );
});

test("a delivery failure is recorded and still reaches the caller", async () => {
  const failure = new SmtpError("temporary", "EHLO", 421, true);
  failure.attempts = 2;
  const failed: unknown[] = [];
  const logs: Parameters<MailDeliveryDependencies["log"]>[0][] = [];

  await assert.rejects(
    sendTrackedMail(
      "password-reset",
      "user-1",
      { to: "private@example.test", subject: "Reset", text: "body" },
      dependencies({
        send: async () => {
          throw failure;
        },
        fail: async (_event, error) => {
          failed.push(error);
        },
        log: (record) => logs.push(record),
      }),
    ),
    failure,
  );

  assert.deepEqual(failed, [failure]);
  assert.deepEqual(logs, [
    {
      id: EVENT.id,
      kind: "password-reset",
      status: "failed",
      failureCode: "smtp:ehlo:421",
    },
  ]);
});
