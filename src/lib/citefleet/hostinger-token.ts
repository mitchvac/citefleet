import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptHostingerToken(token: string, key: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [nonce, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptHostingerToken(value: string, key: Buffer): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Hostinger token ciphertext is invalid.");
  const [nonce, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  if (nonce.length !== 12 || tag.length !== 16 || !ciphertext.length)
    throw new Error("Hostinger token ciphertext is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
