import { expect, test, type Page } from "@playwright/test";
import { dnsProviderBySlug } from "../../src/lib/citefleet/dns-providers";
import { markCreated, removeIfOurs, RUN_ID, wasCreatedHere } from "./fixtures";
import { typeSlow } from "./typeSlow";

// Customer-path wiring test for the DNS provider handoff. It starts where a
// customer starts, reads discord.com's live authoritative NS records, but never
// opens an OAuth provider or changes DNS. The uniquely named property is removed
// in `finally`, and only after `markCreated` confirms this run owns it.

const SITE = {
  name: `DNS provider E2E ${RUN_ID}`,
  url: "https://discord.com",
};

async function waitIdle(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __pending: number }).__pending === 0,
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(700);
}

async function go(page: Page, path: string) {
  await page.goto(path);
  await waitIdle(page);
}

test("detects a DNS provider and exposes the real automated TXT action", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const state = window as unknown as { __pending: number };
    state.__pending = 0;
    const realFetch = window.fetch;
    window.fetch = (...args) => {
      state.__pending += 1;
      return realFetch(...args).finally(() => {
        state.__pending -= 1;
      });
    };
  });

  try {
    await go(page, "/start");
    await typeSlow(page.getByLabel("Property name (optional)"), SITE.name);
    await typeSlow(page.getByLabel("Website domain"), SITE.url);
    await page.getByRole("button", { name: "Add property and connect DNS" }).click();
    await waitIdle(page);
    await expect(page).toHaveURL(/\/sites\/site-[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { name: SITE.name, exact: true })).toBeVisible();
    markCreated(SITE.name);

    const panel = page.getByTestId("dns-provider-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("dns-detection-note")).toHaveText(
      "All authoritative nameservers match Cloudflare.",
      { timeout: 30_000 },
    );
    const nameservers = panel.getByTestId("dns-nameservers");
    const authoritative = (await nameservers.innerText()).trim().split(/\s+/);
    expect(authoritative.length).toBeGreaterThanOrEqual(2);
    for (const nameserver of authoritative) {
      expect(nameserver).toMatch(/^[a-z0-9-]+\.ns\.cloudflare\.com$/);
    }

    const picker = panel.getByTestId("dns-provider-picker");
    const pickerButton = picker.getByRole("button");
    await expect(pickerButton).toContainText("Cloudflare");
    await expect(page.getByTestId("proof-record")).toHaveClass(/border-sky-400/);

    const godaddy = dnsProviderBySlug("godaddy");
    expect(godaddy).toBeTruthy();
    await pickerButton.click();
    await page.getByTestId("dns-provider-option-godaddy").click();
    await expect(pickerButton).toContainText("GoDaddy");
    await panel.getByText("Add the record manually").click();
    await expect(panel.getByRole("link", { name: "Official TXT instructions" })).toHaveAttribute(
      "href",
      godaddy!.guideUrl,
    );

    const porkbun = dnsProviderBySlug("porkbun");
    expect(porkbun).toBeTruthy();
    await pickerButton.click();
    await page.getByTestId("dns-provider-option-porkbun").click();
    await expect(pickerButton).toContainText("Porkbun");
    await expect(pickerButton).not.toContainText("null%");
    await expect(pickerButton).not.toContainText("30 providers");
    const addRecord = panel.getByRole("link", { name: "Add TXT record with Porkbun" });
    await expect(addRecord).toBeVisible();
    await expect(addRecord).toHaveAttribute("href", /\/api\/dns\/porkbun\/start\?siteId=site-/);
    await expect(panel).toContainText("sign in and approve CiteFleet");
    await expect(panel).toContainText("CiteFleet uses the generated key once and does not save it");
    const prerequisite = panel.getByTestId("porkbun-api-prerequisite");
    await expect(prerequisite).toContainText("turn on API Access for this domain");
    await expect(prerequisite.getByRole("link", { name: /Enable API access for/ })).toHaveAttribute(
      "href",
      "https://porkbun.com/account",
    );

    await page.screenshot({
      path: testInfo.outputPath("porkbun-automation-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(panel).toBeVisible();
    await expect(pickerButton).toContainText("Porkbun");
    await expect(addRecord).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "campaign page should not overflow at 320px").toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath("porkbun-automation-mobile.png"),
      fullPage: true,
    });
  } finally {
    const ours = wasCreatedHere(SITE.name);
    const outcome = await removeIfOurs(page, SITE.name);
    if (ours) expect(["removed", "absent"]).toContain(outcome);
    else expect(outcome).toBe("not-ours");
  }
});
