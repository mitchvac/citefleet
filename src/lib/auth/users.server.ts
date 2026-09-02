import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getSql } from "@/lib/db";

const scrypt = promisify(scryptCb);
const KEYLEN = 32;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(password, salt, KEYLEN)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export type CiteFleetUser = { id: string; email: string; name: string };

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ ok: true; user: CiteFleetUser } | { ok: false; reason: "exists" | "invalid" }> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const name = input.name.trim() || email.split("@")[0] || "CiteFleet user";
  if (!email.includes("@") || password.length < 8) return { ok: false, reason: "invalid" };
  const sql = await getSql();
  const existing = await sql.query<{ id: string }>(
    "SELECT id FROM citefleet_users WHERE email = $1",
    [email],
  );
  if (existing[0]) return { ok: false, reason: "exists" };
  const id = randomBytes(16).toString("hex");
  const password_hash = await hashPassword(password);
  await sql.query(
    "INSERT INTO citefleet_users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)",
    [id, email, name, password_hash],
  );
  return { ok: true, user: { id, email, name } };
}

export async function verifyUser(
  emailRaw: string,
  password: string,
): Promise<CiteFleetUser | null> {
  const email = normalizeEmail(emailRaw);
  if (!email || !password) return null;
  const sql = await getSql();
  const rows = await sql.query<{ id: string; email: string; name: string; password_hash: string | null }>(
    "SELECT id, email, name, password_hash FROM citefleet_users WHERE email = $1",
    [email],
  );
  const row = rows[0];
  if (!row?.password_hash) return null;
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export async function upsertOAuthUser(input: {
  provider: "google" | "github";
  providerId: string;
  email: string;
  name: string;
  githubToken?: string;
}): Promise<CiteFleetUser> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim() || email.split("@")[0] || "CiteFleet user";
  const sql = await getSql();
  const byProvider = await sql.query<{ id: string; email: string; name: string }>(
    "SELECT id, email, name FROM citefleet_users WHERE provider = $1 AND provider_id = $2",
    [input.provider, input.providerId],
  );
  if (byProvider[0]) {
    if (input.githubToken) {
      await sql.query("UPDATE citefleet_users SET github_token = $1, name = $2 WHERE id = $3", [
        input.githubToken,
        name,
        byProvider[0].id,
      ]);
    }
    return byProvider[0];
  }
  const byEmail = await sql.query<{ id: string; email: string; name: string }>(
    "SELECT id, email, name FROM citefleet_users WHERE email = $1",
    [email],
  );
  if (byEmail[0]) {
    await sql.query(
      "UPDATE citefleet_users SET provider = $1, provider_id = $2, name = $3, github_token = COALESCE($4, github_token) WHERE id = $5",
      [input.provider, input.providerId, name, input.githubToken || null, byEmail[0].id],
    );
    return { id: byEmail[0].id, email, name };
  }
  const id = randomBytes(16).toString("hex");
  await sql.query(
    "INSERT INTO citefleet_users (id, email, name, password_hash, provider, provider_id, github_token) VALUES ($1, $2, $3, NULL, $4, $5, $6)",
    [id, email, name, input.provider, input.providerId, input.githubToken || null],
  );
  return { id, email, name };
}
