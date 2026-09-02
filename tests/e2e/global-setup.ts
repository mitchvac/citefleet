import { mkdirSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";

// Signs in once and saves the cookie jar every test starts from.
//   E2E_OPERATOR_TOKEN                       → server token on /api/login (ops path), or
//   E2E_USER_EMAIL + E2E_USER_PASSWORD       → sign up (allow-listed email) or sign in.
// No default credentials: a published password would be a way in for anyone.
export const STORAGE_STATE = "tests/e2e/.auth/user.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || process.env.E2E_URL || "https://citefleet.app";
  const token = process.env.E2E_OPERATOR_TOKEN || "";
  const email = process.env.E2E_USER_EMAIL || "";
  const password = process.env.E2E_USER_PASSWORD || "";
  mkdirSync("tests/e2e/.auth", { recursive: true });
  const ctx = await request.newContext({ baseURL });
  let res;
  if (token) {
    res = await ctx.post("/api/login", { form: { token }, maxRedirects: 0 });
  } else if (email && password) {
    res = await ctx.post("/api/signup", { form: { name: "CiteFleet E2E", email, password }, maxRedirects: 0 });
    if (res.status() === 303 && (res.headers()["location"] || "").includes("error=exists")) {
      res = await ctx.post("/api/login", { form: { email, password }, maxRedirects: 0 });
    }
  } else {
    await ctx.dispose();
    throw new Error("[e2e] set E2E_OPERATOR_TOKEN, or E2E_USER_EMAIL + E2E_USER_PASSWORD (an allow-listed email)");
  }
  const loc = res.headers()["location"] || "";
  if (res.status() !== 303 || loc.includes("error=")) {
    await ctx.dispose();
    throw new Error(`[e2e] sign-in failed: status ${res.status()} location ${loc}`);
  }
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
