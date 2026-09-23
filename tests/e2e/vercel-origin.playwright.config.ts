import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "vercel-origin.spec.ts",
  timeout: 45000,
  workers: 1,
  reporter: "list",
  outputDir: "../../test-results/vercel-origin",
  use: { channel: "chrome", headless: false, screenshot: "only-on-failure" },
});
