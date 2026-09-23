import { expect, test } from "@playwright/test";

// Local browser regression only. No external invoice/payment is created.
test("open invoice waits between checks and never exposes operator controls to anonymous visitors", async ({ page }) => {
  const base = process.env.E2E_URL || "http://127.0.0.1:4188";
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw new Error("Billing regression requires a local server");
  const id = `bj_${"a".repeat(32)}`;
  const invoice = {
    id, status: "invoiced", key_prefix: "bc_live_aaaaaaaa", usd: "10.00", jobs: 10,
    asset: "xrp", amount: "5", rate_usd: "2", created: new Date().toISOString(),
    expires: new Date(Date.now() + 600000).toISOString(),
    pay: { via: "direct", network: "xrpl", network_name: "XRP Ledger", ticker: "XRP", amount: "5", address: null, topup: "" },
  };
  const checks: number[] = [];
  await page.route("https://botcentral.org/v1/jobs/**", async (route) => {
    if (route.request().url().endsWith("/verify")) checks.push(Date.now());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...invoice, settles_automatically: true }) });
  });
  await page.goto(`${base}/topup?job=${id}`);
  await expect(page.getByTestId("invoice-key-prefix")).toHaveText(invoice.key_prefix);
  await expect.poll(() => checks.length).toBe(1);
  await page.waitForTimeout(1500);
  expect(checks).toHaveLength(1);
  await expect.poll(() => checks.length, { timeout: 8000 }).toBe(2);
  expect(checks[1] - checks[0]).toBeGreaterThanOrEqual(5900);
  await expect(page.getByRole("button", { name: "Confirm payment" })).toHaveCount(0);
});
