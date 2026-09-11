import { expect, test, type Page } from "@playwright/test";

// Completes the listing of botcentral.org, now that the registry serves its own
// SPEC §4.2 proof at /.well-known/botcentral.txt. Runs against LIVE citefleet.app
// and drives the real publish; the property is left in place, listed.
//
//   E2E_URL=https://citefleet.app E2E_OPERATOR_TOKEN=… E2E_SITE_ID=site-56ae1c79 \
//     E2E_CHANNEL=chrome npx playwright test botcentral-listing-complete
//
// No billing key is set on this property, so `billingPrefixFor(site)` is falsy
// and dispatcher.ts:429 never asserts the `spend` door — the publish is recorded
// unbilled and cannot draw down the balance.

const SITE_ID = process.env.E2E_SITE_ID || "site-56ae1c79";
const DOMAIN = "botcentral.org";

async function settle(page: Page) {
  await page
    .waitForFunction(() => (window as unknown as { __pending: number }).__pending === 0, null, {
      timeout: 45_000,
    })
    .catch(() => {});
  await page.waitForTimeout(2500);
}

async function open(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __pending: number };
    w.__pending = 0;
    const real = window.fetch;
    window.fetch = (...args) => {
      w.__pending++;
      return real(...args).finally(() => {
        w.__pending--;
      });
    };
  });
  await page.goto(`/sites/${SITE_ID}`);
  await settle(page);
  // Guard rail: never act on a page that is not this property.
  await expect(page.locator("body")).toContainText(DOMAIN, { timeout: 45_000 });
}

const errorBanner = (page: Page) => page.locator("div.glass.text-rose-300");

test.describe.configure({ mode: "serial" });

test("the proof the registry now serves is accepted", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Verify proof" }).click();
  await page.waitForTimeout(10000);
  await settle(page);

  const err = (await errorBanner(page).count())
    ? (await errorBanner(page).first().innerText()).replace(/\s+/g, " ").trim()
    : "";
  const panel = (await page.getByTestId("auto-listing").innerText()).replace(/\s+/g, " ").trim();
  console.log("LIST|verify error :", err || "(none)");
  console.log("LIST|verify panel :", panel.slice(0, 240));

  expect(err, "Verify proof reported an error").toBe("");
  // Read the PILL, not the panel text. The panel now always renders the DNS
  // record and the well-known URL as instructions — shown before any check
  // runs — so matching /well-known/ anywhere in it passed no matter what the
  // proof result was. The pill is the result: `proof <method>` when proven,
  // `proof not live` or `proof unchecked` otherwise.
  // Case-insensitive: the Pill renders with `uppercase`, and innerText returns
  // the CSS-transformed text, so the pill reads "PROOF WELL-KNOWN-FILE".
  const pill = (await page.getByTestId("auto-listing").getByText(/^proof /i).innerText()).trim();
  console.log("LIST|verify pill  :", pill);
  expect(/^proof (well-known-file|dns-txt)$/i.test(pill), `proof pill was "${pill}"`).toBe(true);
});

test("List on BotCentral publishes the card", async ({ page }) => {
  await open(page);

  // Precondition: publishing must not be able to spend.
  const billing = (await page.getByTestId("billing-key").innerText()).trim();
  console.log("LIST|billing key  :", billing.slice(0, 80));
  expect(/none/i.test(billing), "a key is on file — publishing would spend").toBe(true);

  const btn = page.getByRole("button", { name: /List on BotCentral|Refresh BotCentral card/ });
  console.log("LIST|button       :", (await btn.first().innerText()).trim());
  await btn.first().click();
  await page.waitForTimeout(15000);
  await settle(page);

  const err = (await errorBanner(page).count())
    ? (await errorBanner(page).first().innerText()).replace(/\s+/g, " ").trim()
    : "";
  const body = (await page.locator("main").innerText()).replace(/\s+/g, " ").trim();
  console.log("LIST|publish error:", err || "(none)");
  console.log("LIST|page says    :", (body.match(/Live on BotCentral[^.]*/i) || ["(not found)"])[0].slice(0, 160));

  expect(err, "publish reported an error").toBe("");
  expect(/Live on BotCentral/i.test(body), "page does not report the card as live").toBe(true);
});

test("the registry's own catalog now serves the card", async ({ request }) => {
  // The authority is BotCentral, not CiteFleet's screen. Poll: the registry
  // verifies the origin itself on publish and may take a moment to settle.
  let last = "";
  for (let i = 0; i < 10; i++) {
    const res = await request.get(`https://botcentral.org/v1/site/${DOMAIN}`);
    last = `${res.status()} ${(await res.text()).slice(0, 400)}`;
    if (res.ok()) break;
    await new Promise((r) => setTimeout(r, 6000));
  }
  console.log("LIST|catalog      :", last.slice(0, 400));
  expect(last.startsWith("200"), `catalog did not serve the card: ${last}`).toBe(true);
});
