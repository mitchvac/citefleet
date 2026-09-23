import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "billing-polling.spec.ts", timeout: 30000, workers: 1,
  reporter: "list", outputDir: "../../test-results/billing",
  use: { channel: "chrome", headless: false, screenshot: "only-on-failure" },
});
