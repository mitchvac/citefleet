import { mkdirSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";

// Signs a user in once and saves the cookie jar every test starts from.
// E2E_USER_EMAIL / E2E_USER_PASSWORD create or sign in via Better Auth.
// Hook tests never rely on this cookie (hooks authenticate by signature).
export const STORAGE_STATE = "tests/e2e/.auth/user.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || process.env.E2E_URL || "https://citefleet.app";
  const email = process.env.E2E_USER_EMAIL || "e2e@citefleet.app";
  const password = process.env.E2E_USER_PASSWORD || "CiteFleetE2E!9";
  mkdirSync("tests/e2e/.auth", { recursive: true });
  const ctx = await request.newContext({ baseURL });

  const signIn = () =>
    ctx.post("/api/auth/sign-in/email", {
      data: { email, password, callbackURL: "/" },
      headers: { "Content-Type": "application/json" },
    });

  let res = await ctx.post("/api/auth/sign-up/email", {
    data: { name: "CiteFleet E2E", email, password, callbackURL: "/" },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    res = await signIn();
  }
  if (!res.ok()) {
    throw new Error(`[e2e] user sign-in failed: status ${res.status()} ${await res.text()}`);
  }
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
