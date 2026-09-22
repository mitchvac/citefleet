import { expect, test } from "@playwright/test";
import { boardDrawn, exactCard, markCreated, removeIfOurs, RUN_ID } from "./fixtures";

// Real application/database test for the unconfigured customer path. This does
// not exercise customer OAuth or publish a Vercel deployment.
test("Vercel install shows actual configuration and refuses unavailable authorization", async ({
  page,
  playwright,
  baseURL,
}) => {
  const name = `Vercel install ${RUN_ID}`;
  try {
    await boardDrawn(page);
    await page.getByLabel("Site name").fill(name);
    await page.getByLabel("Origin URL").fill("https://www.strawmanapp.com/");
    await page.getByRole("button", { name: "Assign Grok fleet" }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await boardDrawn(page);
    const card = exactCard(page, name);
    await expect(card).toBeVisible();
    markCreated(name);
    await card.getByRole("link", { name: "Open campaign" }).click();
    await page.getByTestId("provider-trigger").click();
    await page.getByTestId("provider-option-vercel").click();
    const panel = page.getByTestId("vercel-install");
    await expect(panel).toBeVisible();
    const siteId = new URL(page.url()).pathname.split("/").at(-1)!;
    const status = await page.request.get(`/api/hosting/vercel/status?siteId=${siteId}`);
    expect(status.status()).toBe(200);
    expect(status.headers()["content-type"]).toContain("application/json");
    const result = await status.json();
    expect(result).toMatchObject({ githubConnected: false, job: null });
    if (!result.configured) {
      await expect(panel).toContainText("Vercel connection is not enabled");
      const start = await page.request.post("/api/hosting/vercel/start", {
        form: { siteId },
        maxRedirects: 0,
      });
      expect(start.status()).toBe(503);
    }
    await expect(panel).toContainText("connect GitHub above");
    await expect(
      panel.getByRole("button", { name: "Connect Vercel and install files", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByTestId("provider-panel")).not.toContainText("manual install");
    await page.reload();
    await expect(page.getByTestId("vercel-install")).toContainText("connect GitHub above");
    const anonymous = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const refused = await anonymous.get(`/api/hosting/vercel/status?siteId=${siteId}`);
      expect(refused.status()).toBe(401);
      expect(refused.headers()["content-type"]).toContain("application/json");
    } finally {
      await anonymous.dispose();
    }
  } finally {
    await removeIfOurs(page, name);
  }
});
