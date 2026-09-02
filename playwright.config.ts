import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_URL || "https://citefleet.app",
    headless: false,
    // E2E_CHANNEL=chrome launches the installed Google Chrome (needed on macOS 13,
    // which Playwright's bundled Chromium no longer supports).
    channel: process.env.E2E_CHANNEL || undefined,
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO || 400) },
    viewport: { width: 1440, height: 900 },
    video: "on",
    screenshot: "on",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
});
