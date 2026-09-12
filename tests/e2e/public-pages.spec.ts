import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

const PAGES = [
  { path: "/about", heading: "About CiteFleet", title: "About CiteFleet | CiteFleet" },
  { path: "/privacy", heading: "Privacy Notice", title: "Privacy Notice | CiteFleet" },
  { path: "/terms", heading: "Terms of Service", title: "Terms of Service | CiteFleet" },
] as const;

for (const entry of PAGES) {
  test(`${entry.path} is a complete signed-out public page`, async ({ page }) => {
    const response = await page.goto(entry.path);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(entry.title);
    await expect(page.getByRole("heading", { level: 1, name: entry.heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://citefleet.app${entry.path}`,
    );

    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "About" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Privacy" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Terms" })).toBeVisible();
  });
}

test("public pages and auth footer fit a 320px viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });

  for (const path of ["/about", "/privacy", "/terms", "/login", "/reset"]) {
    await page.goto(path);
    await expect(page.getByRole("contentinfo")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(0);
  }

  await page.goto("/privacy");
  await page.screenshot({ path: testInfo.outputPath("privacy-mobile.png"), fullPage: true });
});

test("account creation exposes the terms and privacy notice", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();

  const agreement = page.getByTestId("signup-agreement");
  await expect(agreement.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(agreement.getByRole("link", { name: "Privacy Notice" })).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test("public sitemap contains public content and omits workspace screens", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/xml");

  const body = await response.text();
  for (const path of [
    "/start",
    "/about",
    "/playbook",
    "/learn",
    "/learn/glossary",
    "/privacy",
    "/terms",
  ]) {
    expect(body).toContain(`<loc>https://citefleet.app${path}</loc>`);
  }
  for (const path of ["/ops", "/fleet", "/activity", "/login", "/reset"]) {
    expect(body).not.toContain(`<loc>https://citefleet.app${path}</loc>`);
  }
});

test("about page has a stable desktop composition", async ({ page }, testInfo) => {
  await page.goto("/about");
  await expect(
    page.getByRole("heading", { name: "From website to verifiable listing" }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("about-desktop.png"), fullPage: true });
});
