import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_URL || "https://citefleet.app",
    storageState: "tests/e2e/.auth/user.json",
    headless: process.env.E2E_HEADLESS === "1",
    channel: process.env.E2E_CHANNEL || undefined,
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO || 400) },
    viewport: { width: 1440, height: 900 },
    video: "on",
    screenshot: "on",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
});
