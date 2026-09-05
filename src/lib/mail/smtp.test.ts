import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertHeaderSafe,
  authPlainToken,
  normalizeAppPassword,
  buildMessage,
  dotStuff,
  parseReply,
  replyComplete,
  runSession,
  type SmtpIO,
  type SmtpReply,
} from "./smtp.ts";

// The transcript is driven through an injected SmtpIO, so every branch below is
// exercised without a socket. Replies are the real ones Gmail sends.

function fakeIo(replies: string[]) {
  const written: string[] = [];
  let i = 0;
  const io: SmtpIO = {
    write: async (data) => {
      written.push(data);
    },
    read: async (): Promise<SmtpReply> => {
      const raw = replies[i++];
      if (raw === undefined) throw new Error("transcript ran out of replies");
      return parseReply(raw);
    },
  };
  return { io, written };
}

const HAPPY = [
  "220 smtp.gmail.com ESMTP ready\r\n",
  "250-smtp.gmail.com at your service\r\n250-SIZE 35882577\r\n250-AUTH LOGIN PLAIN\r\n250 SMTPUTF8\r\n",
  "235 2.7.0 Accepted\r\n",
  "250 2.1.0 OK\r\n",
  "250 2.1.5 OK\r\n",
  "354 Go ahead\r\n",
  "250 2.0.0 OK 1757000000 abc123\r\n",
];

test("a multiline EHLO reply is not treated as finished early", () => {
  // The classic bug: reading one line and moving on. 250- is a continuation.
  assert.equal(replyComplete("250-smtp.gmail.com\r\n250-SIZE 35882577\r\n"), false);
  assert.equal(replyComplete("250-smtp.gmail.com\r\n250 SMTPUTF8\r\n"), true);
  const reply = parseReply("250-one\r\n250-two\r\n250 three\r\n");
  assert.equal(reply.code, 250);
  assert.deepEqual(reply.lines, ["one", "two", "three"]);
});

test("a reply split across TCP chunks only completes on the final line", () => {
  let buf = "220 ";
  assert.equal(replyComplete(buf), true, "a bare '220 ' already ends with code+space");
  buf = "250-a\r\n250";
  assert.equal(replyComplete(buf), false, "partial trailing line is not complete");
});

test("dot-stuffing protects a body line that starts with a period", () => {
  // Without this the message truncates at that line — silently.
  assert.equal(dotStuff("hello\n.\nworld"), "hello\r\n..\r\nworld");
  assert.equal(dotStuff(".leading"), "..leading");
  assert.equal(dotStuff("no dots here"), "no dots here");
  // A period mid-line is not the terminator and must be left alone.
  assert.equal(dotStuff("visit citefleet.app now"), "visit citefleet.app now");
});

test("AUTH PLAIN is NUL-delimited base64 (RFC 4616)", () => {
  const token = authPlainToken("me@gmail.com", "apppass");
  assert.equal(Buffer.from(token, "base64").toString("utf8"), "\0me@gmail.com\0apppass");
});

test("a Google App Password works whether or not the operator keeps the spaces", () => {
  // Google shows "abcd efgh ijkl mnop"; the credential is the 16 characters.
  // --env-file passes the spaces through verbatim, so without this the copied
  // value fails with a 535 that is indistinguishable from a wrong password.
  const spaced = authPlainToken("me@gmail.com", "abcd efgh ijkl mnop");
  const bare = authPlainToken("me@gmail.com", "abcdefghijklmnop");
  assert.equal(spaced, bare);
  assert.equal(
    Buffer.from(spaced, "base64").toString("utf8"),
    "\0me@gmail.com\0abcdefghijklmnop",
  );
  assert.equal(normalizeAppPassword("  abcd efgh\tijkl mnop \n"), "abcdefghijklmnop");
});

test("headers refuse injection and non-ASCII rather than mangling them", () => {
  assert.throws(() => assertHeaderSafe("subject", "hi\r\nBcc: attacker@evil.test"), /line break/);
  assert.throws(() => assertHeaderSafe("subject", "hi\nX-Injected: 1"), /line break/);
  assert.throws(() => assertHeaderSafe("subject", "café"), /ASCII/);
  assert.doesNotThrow(() => assertHeaderSafe("subject", "Reset your CiteFleet password"));
});

test("a message carries the headers Gmail expects, with a stable id", () => {
  const msg = buildMessage(
    { to: "u@example.test", subject: "Reset your CiteFleet password", text: "link" },
    "ops@citefleet.app",
    new Date("2026-09-05T12:00:00Z"),
    "deadbeef",
  );
  assert.match(msg, /^From: CiteFleet <ops@citefleet\.app>\r\n/);
  assert.match(msg, /\r\nTo: <u@example\.test>\r\n/);
  assert.match(msg, /\r\nMessage-ID: <deadbeef@citefleet\.app>\r\n/);
  assert.match(msg, /\r\nAuto-Submitted: auto-generated\r\n/);
  // Headers and body separated by exactly one blank line.
  assert.match(msg, /\r\n\r\nlink$/);
});

test("the happy path issues the commands in order and sends the body", async () => {
  const { io, written } = fakeIo(HAPPY);
  await runSession(
    io,
    { to: "u@example.test", subject: "Reset your CiteFleet password", text: "link" },
    { user: "ops@citefleet.app", password: "app pass" },
    "ops@citefleet.app",
  );
  const verbs = written.map((w) => w.split(/[ \r]/)[0]);
  assert.deepEqual(verbs, ["EHLO", "AUTH", "MAIL", "RCPT", "DATA", "From:", "QUIT"]);
  assert.match(written[3], /^RCPT TO:<u@example\.test>\r\n$/);
  // The body terminates with the lone-dot marker on its own line.
  assert.match(written[5], /\r\n\.\r\n$/);
});

test("the credential never appears in a raised error", async () => {
  const { io } = fakeIo([...HAPPY.slice(0, 2), "535-5.7.8 Username and Password not accepted\r\n535 5.7.8 https://support.google.com\r\n"]);
  await assert.rejects(
    runSession(
      io,
      { to: "u@example.test", subject: "s", text: "t" },
      { user: "ops@citefleet.app", password: "hunter2-secret" },
      "ops@citefleet.app",
    ),
    (err: Error) => {
      assert.match(err.message, /App Password/, "535 must name the actual cause");
      assert.ok(!err.message.includes("hunter2-secret"), "credential leaked into the error");
      return true;
    },
  );
});

test("a rejected recipient fails the send rather than reporting success", async () => {
  const { io } = fakeIo([...HAPPY.slice(0, 4), "550 5.1.1 No such user\r\n"]);
  await assert.rejects(
    runSession(
      io,
      { to: "nobody@example.test", subject: "s", text: "t" },
      { user: "ops@citefleet.app", password: "p" },
      "ops@citefleet.app",
    ),
    /RCPT TO failed: 550/,
  );
});

test("251 (accepted and forwarded) is a success, not a failure", async () => {
  const { io } = fakeIo([
    ...HAPPY.slice(0, 4),
    "251 User not local; will forward\r\n",
    ...HAPPY.slice(5),
  ]);
  await assert.doesNotReject(
    runSession(
      io,
      { to: "u@example.test", subject: "s", text: "t" },
      { user: "ops@citefleet.app", password: "p" },
      "ops@citefleet.app",
    ),
  );
});

test("a body the server refuses is surfaced, not swallowed", async () => {
  const { io } = fakeIo([...HAPPY.slice(0, 6), "552 5.2.3 Message too large\r\n"]);
  await assert.rejects(
    runSession(
      io,
      { to: "u@example.test", subject: "s", text: "t" },
      { user: "ops@citefleet.app", password: "p" },
      "ops@citefleet.app",
    ),
    /message body failed: 552/,
  );
});

test("a missing 221 after QUIT is not a delivery failure", async () => {
  // Gmail sometimes closes without answering QUIT. The message was already
  // accepted at that point; raising here would report a false failure and
  // trigger a second reset email.
  const { io } = fakeIo(HAPPY);
  await assert.doesNotReject(
    runSession(
      io,
      { to: "u@example.test", subject: "s", text: "t" },
      { user: "ops@citefleet.app", password: "p" },
      "ops@citefleet.app",
    ),
  );
});
