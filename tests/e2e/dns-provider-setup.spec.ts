import { expect, test, type Page } from "@playwright/test";
import { dnsProviderBySlug } from "../../src/lib/citefleet/dns-providers";
import { exactCard, markCreated, removeIfOurs, RUN_ID, wasCreatedHere } from "./fixtures";
import { typeSlow } from "./typeSlow";

// Local-only wiring test for the DNS provider handoff. It reads discord.com's
// live authoritative NS records, but never opens Entri, signs in to a provider,
// or changes DNS. The uniquely named property is removed in `finally`, and only
// after `markCreated` confirms this run owns it.

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

test("detects, explains, and safely hands off a DNS provider", async ({ page }, testInfo) => {
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
    await go(page, "/");
    await typeSlow(page.getByLabel("Site name"), SITE.name);
    await typeSlow(page.getByLabel("Origin URL"), SITE.url);
    await page.getByRole("button", { name: "Assign Grok fleet" }).click();
    await waitIdle(page);
    await expect(exactCard(page, SITE.name)).toBeVisible();
    markCreated(SITE.name);

    await exactCard(page, SITE.name)
      .getByRole("link", { name: /campaign/i })
      .first()
      .click();
    await waitIdle(page);

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

    const godaddy = dnsProviderBySlug("godaddy");
    expect(godaddy).toBeTruthy();
    await pickerButton.click();
    await page.getByTestId("dns-provider-option-godaddy").click();
    await expect(pickerButton).toContainText("GoDaddy");
    await expect(panel.getByRole("link", { name: "Official TXT guide" })).toHaveAttribute(
      "href",
      godaddy!.guideUrl,
    );
    await expect(panel.getByRole("link", { name: "API docs" })).toHaveAttribute(
      "href",
      godaddy!.api.docsUrl!,
    );

    const cloudflare = dnsProviderBySlug("cloudflare");
    expect(cloudflare).toBeTruthy();
    await pickerButton.click();
    await page.getByTestId("dns-provider-option-cloudflare").click();
    await expect(panel.getByRole("link", { name: "MCP docs" })).toHaveAttribute(
      "href",
      cloudflare!.mcp.docsUrl!,
    );

    await expect(panel.getByRole("link", { name: "Open Cloudflare" })).toHaveAttribute(
      "href",
      cloudflare!.accountUrl!,
    );
    const guided = panel.getByRole("button", { name: "Create secure link" });
    if (await guided.count()) await expect(guided).toBeEnabled();

    await page.screenshot({
      path: testInfo.outputPath("dns-provider-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await expect(panel).toBeVisible();
    await expect(pickerButton).toContainText("Cloudflare");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "campaign page should not overflow at 320px").toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("dns-provider-mobile.png"), fullPage: true });
  } finally {
    const ours = wasCreatedHere(SITE.name);
    const outcome = await removeIfOurs(page, SITE.name);
    if (ours) expect(["removed", "absent"]).toContain(outcome);
    else expect(outcome).toBe("not-ours");
  }
});
