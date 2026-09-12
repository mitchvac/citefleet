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
 *     no CC/BCC or connection pooling.
 *   - one bounded retry only before submission or after an explicit 4xx. A
 *     connection loss after the body is written is ambiguous and never retried.
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
const RETRY_DELAY_MS = 500;
const MAX_SEND_ATTEMPTS = 2;
export const MAX_SEND_LATENCY_MS = TIMEOUT_MS * MAX_SEND_ATTEMPTS + RETRY_DELAY_MS;

export interface SmtpReply {
  code: number;
  lines: string[];
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  messageId?: string;
}

export type MailReceipt = { attempts: number; acceptedAt: string; messageId: string };

export class SmtpError extends Error {
  attempts = 1;
  readonly stage: string;
  readonly code: number | null;
  readonly safeToRetry: boolean;

  constructor(message: string, stage: string, code: number | null, safeToRetry: boolean) {
    super(message);
    this.name = "SmtpError";
    this.stage = stage;
    this.code = code;
    this.safeToRetry = safeToRetry;
  }
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
  return Buffer.from(`\0${user}\0${normalizeAppPassword(password)}`, "utf8").toString("base64");
}

/**
 * Google prints an App Password in four groups of four ("abcd efgh ijkl mnop")
 * and the spaces are presentation only — the credential is 16 characters. The
 * operator copies what is on screen, `--env-file` passes the spaces through
 * verbatim, and the result is a 535 that looks exactly like a wrong password.
 * Strip whitespace so both forms work. Safe because this client speaks only to
 * Gmail, where an App Password never legitimately contains a space.
 */
export function normalizeAppPassword(password: string): string {
  return password.replace(/\s+/g, "");
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
  id: string = m.messageId ?? randomBytes(12).toString("hex"),
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
    throw new SmtpError(
      `SMTP ${step} failed: ${reply.code} ${reply.lines[0] ?? ""}`.trim(),
      step,
      reply.code || null,
      reply.code >= 400 && reply.code < 500,
    );
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
  const message = buildMessage(m, from);
  let stage = "greeting";
  let bodySubmitted = false;
  try {
    expect(await io.read(), 220, stage);

    stage = "EHLO";
    await io.write(`EHLO ${ehloName}${CRLF}`);
    expect(await io.read(), 250, stage);

    stage = "AUTH";
    await io.write(`AUTH PLAIN ${authPlainToken(auth.user, auth.password)}${CRLF}`);
    const authed = await io.read();
    if (authed.code === 535) {
      throw new SmtpError(
        "SMTP auth rejected (535). Gmail needs an App Password with 2FA enabled — " +
          "the account password will not work.",
        stage,
        535,
        false,
      );
    }
    expect(authed, 235, stage);

    stage = "MAIL FROM";
    await io.write(`MAIL FROM:<${from}>${CRLF}`);
    expect(await io.read(), 250, stage);

    stage = "RCPT TO";
    await io.write(`RCPT TO:<${m.to}>${CRLF}`);
    const rcpt = await io.read();
    if (rcpt.code !== 250 && rcpt.code !== 251) expect(rcpt, 250, stage);

    stage = "DATA";
    await io.write(`DATA${CRLF}`);
    expect(await io.read(), 354, stage);

    stage = "message body";
    bodySubmitted = true;
    await io.write(`${message}${CRLF}.${CRLF}`);
    expect(await io.read(), 250, stage);
  } catch (error) {
    if (error instanceof SmtpError) throw error;
    throw new SmtpError(`SMTP ${stage} transport failed`, stage, null, !bodySubmitted);
  }

  // The provider has accepted the message. QUIT cannot change that result, so
  // a socket close or write error here must not turn success into a retry.
  await io.write(`QUIT${CRLF}`).catch(() => undefined);
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

async function submitOnce(m: Mail): Promise<void> {
  const user = (process.env.CITEFLEET_SMTP_USER || "").trim();
  const password = normalizeAppPassword(process.env.CITEFLEET_SMTP_PASSWORD || "");
  const from = mailFrom();
  if (!user || !password || !from) {
    throw new Error("mail is not configured (CITEFLEET_SMTP_USER / _PASSWORD)");
  }

  const socket = tlsConnect({ host: HOST, port: PORT, servername: HOST });
  socket.setTimeout(TIMEOUT_MS);
  socket.once("timeout", () => socket.destroy(new Error("SMTP socket timed out")));
  const deadline = setTimeout(
    () => socket.destroy(new Error("SMTP attempt timed out")),
    TIMEOUT_MS,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
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
  } catch (error) {
    if (error instanceof SmtpError) throw error;
    throw new SmtpError("SMTP connection failed", "connect", null, true);
  } finally {
    clearTimeout(deadline);
    socket.destroy();
  }
}

export async function sendMailWithRetry(
  mail: Mail,
  submit: (prepared: Mail) => Promise<void>,
  sleep: (delayMs: number) => Promise<void> = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<MailReceipt> {
  const messageId = mail.messageId ?? randomBytes(12).toString("hex");
  const prepared = { ...mail, messageId };
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      await submit(prepared);
      return { attempts: attempt, acceptedAt: new Date().toISOString(), messageId };
    } catch (error) {
      if (error instanceof SmtpError) error.attempts = attempt;
      if (!(error instanceof SmtpError) || !error.safeToRetry || attempt === MAX_SEND_ATTEMPTS) {
        throw error;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error("SMTP retry loop ended unexpectedly");
}

/** Send once, with one safe retry for a transient pre-acceptance failure. */
export function sendMail(m: Mail): Promise<MailReceipt> {
  return sendMailWithRetry(m, submitOnce);
}

/** Stable, recipient-free code suitable for operational telemetry. */
export function mailFailureCode(error: unknown): string {
  if (!(error instanceof SmtpError)) return "smtp:unknown";
  const stage = error.stage.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `smtp:${stage}:${error.code ?? "transport"}`;
}
