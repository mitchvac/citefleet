import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { decryptHostingerToken, encryptHostingerToken } from "./hostinger-token.ts";

test("Hostinger job token is authenticated, encrypted, and cannot be opened with another key", () => {
  const key = randomBytes(32);
  const other = randomBytes(32);
  const token = "customer-hostinger-access-token";
  const sealed = encryptHostingerToken(token, key);
  assert.equal(sealed.includes(token), false);
  assert.equal(decryptHostingerToken(sealed, key), token);
  assert.throws(() => decryptHostingerToken(sealed, other));
  const parts = sealed.split(".");
  const bytes = Buffer.from(parts[2], "base64url");
  bytes[0] ^= 1;
  const tampered = `${parts[0]}.${parts[1]}.${bytes.toString("base64url")}`;
  assert.throws(() => decryptHostingerToken(tampered, key));
  assert.throws(() => decryptHostingerToken("malformed", key));
});
