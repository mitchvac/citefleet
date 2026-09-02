import { test, type Locator } from "@playwright/test";

async function typeSlow(locator: Locator, text: string) {
  await locator.click();
  await locator.press("Meta+A").catch(() => {});
  await locator.press("Control+A").catch(() => {});
  await locator.press("Backspace").catch(() => {});
  await locator.pressSequentially(text, { delay: 120 });
}

test.describe.configure({ mode: "serial" });

test("fill Command onboard and submit, then campaign GitHub save + refresh listing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Onboard a property").waitFor();
  await page.waitForTimeout(600);

  const form = page.locator("aside").filter({ hasText: "Onboard a property" });
  await form.scrollIntoViewIfNeeded();

  await typeSlow(form.getByPlaceholder("Acme Dating"), "Resonance");
  await typeSlow(form.getByPlaceholder("https://example.com"), "https://resonanse.app");
  await typeSlow(
    form.getByPlaceholder("public verification key"),
    "22406cb37e296b837c68788f5454badc",
  );
  await typeSlow(form.getByPlaceholder("mitchvac"), "mitchvac");
  await typeSlow(form.getByPlaceholder("citefleet"), "resonanse");

  await form.getByRole("button", { name: /Assign Grok fleet/i }).click();

  const card = page.locator("article").filter({ hasText: "resonanse.app" }).first();
  await card.waitFor({ timeout: 30000 });
  await card.getByRole("link", { name: "Open campaign" }).click();

  await page.getByText("Origin files").waitFor({ timeout: 20000 });
  const gh = page.locator("section").filter({ hasText: "Origin files" });
  await gh.scrollIntoViewIfNeeded();
  await typeSlow(gh.getByPlaceholder("mitchvac"), "mitchvac");
  await typeSlow(gh.getByPlaceholder("website-repo"), "resonanse");
  await gh.getByRole("button", { name: /Save repo/i }).click();

  await page
    .getByRole("button", { name: /Refresh BotCentral card|List on BotCentral/i })
    .click();
  await page.waitForTimeout(2500);
});
