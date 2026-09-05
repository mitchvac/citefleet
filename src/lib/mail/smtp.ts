/**
 * Minimal SMTP submission client — Gmail, implicit TLS on :465.
 *
 * Dependency-free on purpose. This sits on the password-reset path, and the
 * repo already hand-rolls where a dependency would be the obvious reach (see
 * `citefleet/qr.ts`, which encodes QR itself rather than take the `qrcode`
 * package). Adding a transitive tree to an auth flow buys SMTP edge cases we do
 * not hit: one server, one auth mechanism, one message shape.
 *
 * Scope, stated plainly so nobody mistakes this for a mail library:
 *   - implicit TLS only (port 465). No STARTTLS negotiation, no cleartext path.
 *   - AUTH PLAIN only. Gmail requires an App Password (2FA on the account);
 *     the plain account password is refused by Google with 535.
 *   - one recipient, plain text, ASCII headers. No attachments, no HTML,
 *     no CC/BCC, no connection pooling, no retry.
 *
 * The protocol half is pure and takes an injected `SmtpIO`, so the whole
 * transcript is testable without opening a socket — the same shape `proof.ts`
 * uses for its fetch. `sendMail` is the only part that touches the network.
 */
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { randomBytes } from "node:crypto";

const HOST = "smtp.gmail.com";
const PORT = 465;
const CRLF = "\r\n";
/** Gmail drops an idle submission connection well before this. */
const TIMEOUT_MS = 20_000;

export interface SmtpReply {
  code: number;
  lines: string[];
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Write a command, read one reply. Injected so the transcript is testable. */
export interface SmtpIO {
  write(data: string): Promise<void>;
  read(): Promise<SmtpReply>;
}

/**
 * A reply is complete only when a line has a SPACE after the code. `250-STARTTLS`
 * is a continuation; `250 OK` ends it. Reading one line and stopping is the
 * classic bug here — EHLO always answers multiline.
 */
export function replyComplete(raw: string): boolean {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const last = lines[lines.length - 1];
  return !!last && /^\d{3} /.test(last);
}

export function parseReply(raw: string): SmtpReply {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (!lines.length) return { code: 0, lines: [] };
  const code = Number.parseInt(lines[lines.length - 1].slice(0, 3), 10);
  return {
    code: Number.isNaN(code) ? 0 : code,
    lines: lines.map((l) => l.slice(4)),
  };
}

/**
 * RFC 5321 §4.5.2: a body line starting with "." would otherwise be read as the
 * end-of-data marker. Double it. Without this, a message whose line begins with
 * a period silently truncates.
 */
export function dotStuff(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join(CRLF);
}

/** AUTH PLAIN is base64 of NUL user NUL password (RFC 4616). */
export function authPlainToken(user: string, password: string): string {
  return Buffer.from(`\0${user}\0${password}`, "utf8").toString("base64");
}

/**
 * Headers are ASCII-only by construction. Anything outside that range would
 * need RFC 2047 encoded-words, and rather than half-implement that, callers get
 * a hard error — a mangled Subject is worse than a refused send.
 */
export function assertHeaderSafe(field: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    // A newline in a header is header injection, not a formatting problem.
    throw new Error(`${field} must not contain a line break`);
  }
  if (/[^\x20-\x7e]/.test(value)) {
    throw new Error(`${field} must be ASCII (no encoded-word support)`);
  }
}

export function buildMessage(
  m: Mail,
  from: string,
  now: Date = new Date(),
  id: string = randomBytes(12).toString("hex"),
): string {
  assertHeaderSafe("from", from);
  assertHeaderSafe("to", m.to);
  assertHeaderSafe("subject", m.subject);
  const domain = from.split("@")[1] || "citefleet.app";
  const headers = [
    `From: CiteFleet <${from}>`,
    `To: <${m.to}>`,
    `Subject: ${m.subject}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "Auto-Submitted: auto-generated",
  ];
  return `${headers.join(CRLF)}${CRLF}${CRLF}${dotStuff(m.text)}`;
}

function expect(reply: SmtpReply, wanted: number, step: string): void {
  if (reply.code !== wanted) {
    // Reply text can echo the envelope but never the credential — AUTH PLAIN's
    // argument is not part of any reply, and we never interpolate it here.
    throw new Error(`SMTP ${step} failed: ${reply.code} ${reply.lines[0] ?? ""}`.trim());
  }
}

/**
 * The full submission transcript against an already-connected, already-TLS
 * channel. Pure with respect to the network: give it a fake `SmtpIO` and the
 * whole conversation is assertable.
 */
export async function runSession(
  io: SmtpIO,
  m: Mail,
  auth: { user: string; password: string },
  from: string,
  ehloName = "citefleet.app",
): Promise<void> {
  expect(await io.read(), 220, "greeting");

  await io.write(`EHLO ${ehloName}${CRLF}`);
  expect(await io.read(), 250, "EHLO");

  await io.write(`AUTH PLAIN ${authPlainToken(auth.user, auth.password)}${CRLF}`);
  const authed = await io.read();
  if (authed.code === 535) {
    // The single most common misconfiguration, worth naming precisely.
    throw new Error(
      "SMTP auth rejected (535). Gmail needs an App Password with 2FA enabled — " +
        "the account password will not work.",
    );
  }
  expect(authed, 235, "AUTH");

  await io.write(`MAIL FROM:<${from}>${CRLF}`);
  expect(await io.read(), 250, "MAIL FROM");

  await io.write(`RCPT TO:<${m.to}>${CRLF}`);
  const rcpt = await io.read();
  // 250 accepted, 251 accepted-and-forwarded. Both are a delivery commitment.
  if (rcpt.code !== 250 && rcpt.code !== 251) {
    expect(rcpt, 250, "RCPT TO");
  }

  await io.write(`DATA${CRLF}`);
  expect(await io.read(), 354, "DATA");

  await io.write(`${buildMessage(m, from)}${CRLF}.${CRLF}`);
  expect(await io.read(), 250, "message body");

  await io.write(`QUIT${CRLF}`);
  // Some servers close before answering QUIT; the message is already accepted,
  // so a missing 221 is not a delivery failure and must not be raised as one.
}

/** Whether the mailer is configured. `/health` and the reset flow both ask. */
export function mailConfigured(): boolean {
  return Boolean(process.env.CITEFLEET_SMTP_USER && process.env.CITEFLEET_SMTP_PASSWORD);
}

function mailFrom(): string {
  return (process.env.CITEFLEET_MAIL_FROM || process.env.CITEFLEET_SMTP_USER || "").trim();
}

/** Buffers socket bytes into complete SMTP replies. */
function reader(socket: TLSSocket) {
  let buffer = "";
  const waiters: Array<(r: SmtpReply) => void> = [];
  const failures: Array<(e: Error) => void> = [];
  let failed: Error | null = null;

  const drain = () => {
    while (waiters.length && replyComplete(buffer)) {
      const raw = buffer;
      buffer = "";
      waiters.shift()!(parseReply(raw));
      failures.shift();
    }
  };
  const fail = (err: Error) => {
    failed = err;
    while (failures.length) {
      waiters.shift();
      failures.shift()!(err);
    }
  };

  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    drain();
  });
  socket.on("error", fail);
  socket.on("close", () => fail(new Error("SMTP connection closed early")));

  return (): Promise<SmtpReply> =>
    new Promise<SmtpReply>((resolve, reject) => {
      if (failed) return reject(failed);
      if (replyComplete(buffer)) {
        const raw = buffer;
        buffer = "";
        return resolve(parseReply(raw));
      }
      waiters.push(resolve);
      failures.push(reject);
    });
}

/**
 * Send one message. Throws on any failure — the caller decides whether a failed
 * send is fatal. Never retries: a duplicated password-reset email is worse than
 * a missing one, because the second link invalidates nothing and confuses.
 */
export async function sendMail(m: Mail): Promise<void> {
  const user = (process.env.CITEFLEET_SMTP_USER || "").trim();
  const password = process.env.CITEFLEET_SMTP_PASSWORD || "";
  const from = mailFrom();
  if (!user || !password || !from) {
    throw new Error("mail is not configured (CITEFLEET_SMTP_USER / _PASSWORD)");
  }

  const socket = tlsConnect({ host: HOST, port: PORT, servername: HOST });
  socket.setTimeout(TIMEOUT_MS);
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("SMTP connect timed out")));
    });
    const read = reader(socket);
    const io: SmtpIO = {
      write: (data) =>
        new Promise<void>((resolve, reject) => {
          socket.write(data, (err) => (err ? reject(err) : resolve()));
        }),
      read,
    };
    await runSession(io, m, { user, password }, from);
  } finally {
    socket.destroy();
  }
}
