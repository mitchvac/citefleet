import { mkdirSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";

// Signs the operator in once and saves the cookie jar every test starts from.
// E2E_OPERATOR_TOKEN must be the server's CITEFLEET_OPERATOR_TOKEN. The hook
// assertions never rely on this cookie (hooks authenticate by signature).
export const STORAGE_STATE = "tests/e2e/.auth/operator.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || process.env.E2E_URL || "https://citefleet.app";
  const token = process.env.E2E_OPERATOR_TOKEN || "";
  mkdirSync("tests/e2e/.auth", { recursive: true });
  const ctx = await request.newContext({ baseURL });
  if (!token) {
    console.warn("[e2e] E2E_OPERATOR_TOKEN not set — running signed out; gated tests will fail on a gated server");
    await ctx.storageState({ path: STORAGE_STATE });
    await ctx.dispose();
    return;
  }
  const res = await ctx.post("/api/login", { form: { token }, maxRedirects: 0 });
  const location = res.headers()["location"] || "";
  if (res.status() !== 303 || location.includes("error=")) {
    throw new Error(`[e2e] operator sign-in failed: status ${res.status()} location ${location}`);
  }
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
