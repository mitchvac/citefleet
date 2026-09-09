import { expect, test, type Page } from "@playwright/test";
import { typeSlow } from "./typeSlow";

// CiteFleet may only overwrite an origin file CiteFleet wrote. `buildOriginPack`
// generates all four files from campaign state, and `pushOriginPack` used to PUT
// every one of them without reading the repo — which replaced a site's own
// robots policy with a generic one (measured on mitchvac/Resonanse: 8 Disallow
// lines lost, 5 sitemap URLs lost, 1 invented).
//
// The RULE is covered exhaustively by src/lib/citefleet/origin-ownership.test.ts
// against the real captured file contents. This file covers the WIRING: that the
// panel offers the check, that the verdict reaches the screen, and that a push
// the server would refuse is never offered as available.
//
// Runs against a LOCAL dev server, never production: it creates and removes a
// property. Start the server with an in-memory store, then:
//   CITEFLEET_OPERATOR_TOKEN=<32+ chars> CITEFLEET_OPERATOR_EMAILS=e2e@example.com \
//     DATABASE_URL= npm run dev
//   E2E_URL=http://localhost:8080 E2E_OPERATOR_TOKEN=<same> E2E_HEADLESS=1 \
//     npx playwright test origin-ownership
//
// The repo-reading assertions need a PAT on the workspace and a repo to read.
// Set E2E_GITHUB_TOKEN and E2E_ORIGIN_REPO (as "owner/repo") to run them; they
// skip loudly otherwise rather than passing on an untested path.
//
// Teardown is marker-only: it removes the one card this file names.

const SUFFIX = "E2E Ownership";
const SITE = {
  name: `Owned ${SUFFIX}`,
  url: "https://owned-ownership.example",
  domain: "owned-ownership.example",
};
const OWNER = "ownership-owner";
const REPO = "ownership-website-repo";

const GH_TOKEN = process.env.E2E_GITHUB_TOKEN || "";
const REAL_REPO = process.env.E2E_ORIGIN_REPO || "";

async function go(page: Page, path: string) {
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
  await page.goto(path);
  await waitIdle(page);
}

async function waitIdle(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __pending: number }).__pending === 0,
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(700);
}

function card(page: Page, name: string) {
  return page
    .locator("article")
    .filter({ hasText: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })
    .first();
}

async function openCampaign(page: Page) {
  await go(page, "/");
  await card(page, SITE.name).getByRole("link", { name: /campaign/i }).first().click();
  await waitIdle(page);
}

test.describe.configure({ mode: "serial" });

test("setup: onboard a property with its own repo", async ({ page }) => {
  await go(page, "/");
  await typeSlow(page.getByLabel("Site name"), SITE.name);
  await typeSlow(page.getByLabel("Origin URL"), SITE.url);
  await typeSlow(page.getByLabel("GitHub owner"), OWNER);
  await typeSlow(page.getByLabel(/GitHub repo/), REPO);
  await page.getByRole("button", { name: "Assign Grok fleet" }).click();
  await waitIdle(page);
  await expect(card(page, SITE.name)).toBeVisible();
});

test("the panel offers a read-only check before any write", async ({ page }) => {
  await openCampaign(page);
  const check = page.getByTestId("check-repo");
  await expect(check).toBeVisible();
  await expect(check).toBeEnabled();
  // Nothing is shown until it is asked for — the table must never imply a
  // verdict the operator has not actually fetched.
  await expect(page.getByTestId("origin-plan")).toHaveCount(0);
});

test("a repo the rule already refuses cannot be checked or pushed", async ({ page }) => {
  await openCampaign(page);
  const repoField = page.getByLabel("GitHub repo", { exact: true });
  await repoField.fill("");
  await typeSlow(repoField, "citefleet");

  await expect(page.getByTestId("github-draft-conflict")).toContainText(
    "CiteFleet public/ is only for citefleet.app",
  );
  // All three buttons, not just push: reading a repo this property may not own
  // is a question with no useful answer.
  await expect(page.getByRole("button", { name: "Save repo" })).toBeDisabled();
  await expect(page.getByTestId("check-repo")).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Push/ })).toBeDisabled();
});

test("without a token the check says so plainly instead of reporting a verdict", async ({
  page,
}) => {
  test.skip(Boolean(GH_TOKEN), "a workspace token is configured for this run");
  await openCampaign(page);
  await page.getByTestId("check-repo").click();
  await waitIdle(page);
  // The failure surfaces as an error, and NO plan table appears. A guard that
  // renders an empty verdict on a failed read is worse than one that renders
  // nothing: an empty table reads as "all clear".
  await expect(page.locator("div.glass.text-rose-300")).toContainText("No GitHub token");
  await expect(page.getByTestId("origin-plan")).toHaveCount(0);
});

test("the verdict table reports one state per file, read from the repo", async ({
  page,
}) => {
  test.skip(
    !GH_TOKEN || !REAL_REPO,
    "needs E2E_GITHUB_TOKEN and E2E_ORIGIN_REPO to read a real repo",
  );
  await openCampaign(page);
  const [realOwner, realRepo] = REAL_REPO.split("/");
  const ownerField = page.getByLabel("GitHub owner", { exact: true });
  const repoField = page.getByLabel("GitHub repo", { exact: true });
  await ownerField.fill("");
  await typeSlow(ownerField, realOwner);
  await repoField.fill("");
  await typeSlow(repoField, realRepo);

  await page.getByTestId("check-repo").click();
  await waitIdle(page);

  const plan = page.getByTestId("origin-plan");
  await expect(plan).toBeVisible();
  await expect(plan).toContainText(`${realOwner}/${realRepo}`);
  // Four files in the pack, so four verdicts, each carrying a state.
  const states = plan.locator("[data-testid^='origin-plan-']");
  await expect(states).toHaveCount(4);
  // And the push button now names the count it would actually write, rather
  // than the generic label that implied all four.
  await expect(page.getByRole("button", { name: /^Push \d+ file/ })).toBeVisible();
});

test("teardown: remove only the property this file created", async ({ page }) => {
  await go(page, "/");
  const target = card(page, SITE.name);
  if ((await target.count()) > 0) {
    await target.getByRole("link", { name: /campaign/i }).first().click();
    await waitIdle(page);
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Remove property" }).click();
    await waitIdle(page);
  }
  await go(page, "/");
  await expect(card(page, SITE.name)).toHaveCount(0);
});
