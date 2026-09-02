import { mkdirSync } from "node:fs";
import { request, type FullConfig } from "@playwright/test";

export const STORAGE_STATE = "tests/e2e/.auth/user.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || process.env.E2E_URL || "https://citefleet.app";
  const email = process.env.E2E_USER_EMAIL || "e2e@citefleet.app";
  const password = process.env.E2E_USER_PASSWORD || "CiteFleetE2E!9";
  mkdirSync("tests/e2e/.auth", { recursive: true });
  const ctx = await request.newContext({ baseURL });
  let res = await ctx.post("/api/signup", {
    form: { name: "CiteFleet E2E", email, password },
    maxRedirects: 0,
  });
  const loc = res.headers()["location"] || "";
  if (res.status() === 303 && loc.includes("error=exists")) {
    res = await ctx.post("/api/login", {
      form: { email, password },
      maxRedirects: 0,
    });
  }
  if (res.status() !== 303 || (res.headers()["location"] || "").includes("error=")) {
    throw new Error(`[e2e] user sign-in failed: status ${res.status()} location ${res.headers()["location"]}`);
  }
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
}
