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

test("a repo that cannot be read is refused, never written blind", async ({ page }) => {
  // The condition that matters is what the WORKSPACE holds, not what this test
  // run was configured with. An earlier version skipped on E2E_GITHUB_TOKEN and
  // so asserted "No GitHub token" against a production workspace that HAS a
  // token — an expired one. Both outcomes are the same guard, so assert the
  // guard rather than one of its two messages.
  await openCampaign(page);
  await page.getByTestId("check-repo").click();
  await waitIdle(page);

  const error = page.locator("div.glass.text-rose-300");
  const plan = page.getByTestId("origin-plan");
  // No token at all: the check refuses before reading, and renders NO table. A
  // guard that shows an empty verdict on a failed read is worse than one that
  // shows nothing, because an empty table reads as "all clear".
  if (await error.filter({ hasText: "No GitHub token" }).count()) {
    await expect(plan).toHaveCount(0);
    return;
  }
  // A token that GitHub rejects, or a repo that does not exist: the read fails,
  // every path lands in `unreadable`, and push offers nothing.
  await expect(plan).toBeVisible();
  await expect(page.getByTestId("origin-plan-unreadable")).toContainText(
    "could not be read",
  );
  await expect(page.getByRole("button", { name: "Push 0 files" })).toBeDisabled();
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
  // The dialog handler is registered ONCE, for the whole page, before any
  // navigation. An earlier version armed `page.once` immediately before the
  // click and the removal silently did not happen — the confirm was never
  // accepted, the property survived, and the run left it behind in the
  // workspace. A persistent handler is the version observed to work.
  page.on("dialog", (d) => void d.accept());

  // `waitIdle`'s 700ms settle is enough locally but NOT against citefleet.app:
  // the fetch counter hits zero before React attaches its handlers, so the
  // click lands on an unhydrated button, nothing happens, no dialog is raised
  // and the property survives the "teardown". Removal is the one step that must
  // not be flaky — a missed one leaves a test property in the live workspace —
  // so it waits generously and then verifies, retrying once.
  // POSITIVE CONTROL, and it is not optional. An earlier version checked for
  // this file's card straight after navigating, found zero because the board
  // had not rendered yet, and reported a PASSING teardown while the property
  // was still live in the workspace. A count of zero proves nothing until the
  // board is known to be showing cards at all, so every check waits for a card
  // that must always exist first.
  async function boardLoaded() {
    await go(page, "/");
    await expect(page.locator("article").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
  }

  await boardLoaded();
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = card(page, SITE.name);
    if ((await target.count()) === 0) break;
    await target.getByRole("link", { name: /campaign/i }).first().click();
    // Long enough for React to attach handlers on a production round trip; a
    // click on an unhydrated button is silently a no-op and leaves the property.
    await page.waitForTimeout(3000);
    const remove = page.getByRole("button", { name: "Remove property" });
    await expect(remove).toBeVisible();
    await remove.click();
    await page.waitForTimeout(5000);
    await boardLoaded();
  }
  await boardLoaded();
  await expect(card(page, SITE.name)).toHaveCount(0);
});
