import { expect, test } from "@playwright/test";
import { boardDrawn, exactCard, markCreated, removeIfOurs, RUN_ID } from "./fixtures";
import { typeSlow } from "./typeSlow";

// Production-safe headed smoke test for a real Vercel origin. This deliberately
// stops before any door that needs the domain owner's approval: it does not
// publish a BotCentral card, write DNS, connect GitHub, or alter the Vercel
// project. The temporary CiteFleet property is the only state this test owns.
const SITE = {
  name: `Strawman Vercel E2E ${RUN_ID}`,
  url: "https://www.strawmanapp.com/",
  domain: "www.strawmanapp.com",
  indexNowKey: `strawman-e2e-${RUN_ID}`,
};

test("Strawman: production customer flow detects Vercel and exposes every install artifact", async ({
  page,
}) => {
  test.setTimeout(300_000);

  try {
    const health = await page.request.get("/health");
    expect(health.status()).toBe(200);
    const healthBody = await health.json();
    expect(healthBody).toMatchObject({ ok: true, db: "postgres" });
    expect(healthBody.dnsProviders).toHaveProperty("vercel");

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Onboard a property", exact: true }),
    ).toBeVisible();
    await typeSlow(page.getByLabel("Site name"), SITE.name);
    await typeSlow(page.getByLabel("Origin URL"), SITE.url);
    await typeSlow(page.getByLabel(/IndexNow key/), SITE.indexNowKey);
    await page.getByRole("button", { name: "Assign Grok fleet" }).click();

    try {
      await expect(page.getByRole("heading", { name: SITE.name, exact: true })).toBeVisible({
        timeout: 45_000,
      });
    } catch (cause) {
      // The mutation may have committed even if the navigation response was
      // lost. Claim teardown ownership only after the exact card proves that.
      await boardDrawn(page);
      if ((await exactCard(page, SITE.name).count()) > 0) markCreated(SITE.name);
      throw cause;
    }
    await boardDrawn(page);
    const card = exactCard(page, SITE.name);
    await expect(card).toBeVisible();
    await expect(card).toContainText(SITE.domain);
    markCreated(SITE.name);

    await card.getByRole("button", { name: "Live audit", exact: true }).click();
    await expect(card.getByRole("button", { name: "Live audit", exact: true })).toBeEnabled({
      timeout: 120_000,
    });
    await expect(card.getByTestId("hosting")).toHaveText("Vercel", { timeout: 30_000 });

    await card.getByRole("link", { name: "Open campaign" }).click();
    await expect(page.getByRole("heading", { name: SITE.name, exact: true })).toBeVisible();
    await expect(page.getByTestId("hosting-line")).toContainText("Hosting: Vercel");
    await expect(page.getByTestId("hosting-line")).toContainText("deploys on push");

    const proofRecord = page.getByTestId("proof-record");
    await expect(proofRecord).toBeVisible();
    await expect(proofRecord).toContainText("DNS record CiteFleet will add");
    await expect(proofRecord).toContainText("TXT");
    await expect(proofRecord).toContainText("@");
    await expect(proofRecord).toContainText(/botcentral-verify=\S+/);
    await expect(proofRecord.getByTestId("copy-button")).toHaveCount(3);

    const dns = page.getByTestId("dns-provider-panel");
    await expect(dns.getByRole("heading", { name: "Vercel DNS controls this domain" })).toBeVisible(
      {
        timeout: 45_000,
      },
    );
    await expect(dns.getByTestId("dns-nameservers")).toContainText("ns1.vercel-dns.com");
    await expect(dns.getByTestId("dns-nameservers")).toContainText("ns2.vercel-dns.com");
    if (healthBody.dnsProviders.vercel === "ready") {
      await expect(dns.getByTestId("add-vercel-txt")).toBeVisible();
      await expect(dns).toContainText("removes its temporary Vercel access");
    } else {
      await expect(dns.getByText("Add the record manually")).toBeVisible();
    }

    const verify = page.getByRole("button", { name: "Verify proof" });
    await verify.click();
    await expect(verify).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByTestId("proof-note")).toBeVisible();

    const github = page.locator("section").filter({ hasText: "Origin files → GitHub" }).first();
    await expect(github).toBeVisible();
    await expect(
      github.getByRole("button", { name: "Connect GitHub and install 5 files" }),
    ).toBeDisabled();
    await expect(github).toContainText("No personal access token needs to be copied");

    const pack = page.getByTestId("origin-pack-panel");
    await expect(pack).toContainText(`5 of 5 files for ${SITE.domain}`);
    await pack.getByTestId("origin-pack-toggle").click();
    const rows = pack.getByTestId("origin-pack-file");
    await expect(rows).toHaveCount(5);
    for (const path of [
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/.well-known/botcentral.txt",
      `/${SITE.indexNowKey}.txt`,
    ]) {
      const row = rows.filter({ hasText: path });
      await expect(row).toBeVisible();
      await expect(row.getByTestId("copy-button")).toBeVisible();
      const downloadPromise = page.waitForEvent("download");
      await row.getByRole("button", { name: "Download" }).click();
      const download = await downloadPromise;
      expect(await download.failure()).toBeNull();
    }

    const oauth = await page.request.get("/api/oauth/providers");
    expect(oauth.status()).toBe(200);
    expect(await oauth.json()).toMatchObject({ github: true });

    await page.screenshot({
      path: `test-results/strawman-vercel-${RUN_ID}.png`,
      fullPage: true,
    });
  } finally {
    await removeIfOurs(page, SITE.name);
    await boardDrawn(page);
    await expect(exactCard(page, SITE.name)).toHaveCount(0);
  }
});
