import { expect, test, type Page } from "@playwright/test";
import { typeSlow } from "./typeSlow";
import { exactCard, markCreated, removeIfOurs } from "./fixtures";

// Two properties may not write their origin pack into one GitHub folder:
// buildOriginPack writes the same four paths for every property, so the second
// push overwrites the first. This drives that rule through the real UI — the
// onboard form, the campaign attach form, and the pill that reports the state.
//
// Runs against a LOCAL dev server, never production: it creates and removes
// properties. Start the server with an in-memory store, then:
//   CITEFLEET_OPERATOR_TOKEN=<32+ chars> CITEFLEET_OPERATOR_EMAILS=e2e@example.com \
//     DATABASE_URL= npm run dev
//   E2E_URL=http://localhost:8080 E2E_OPERATOR_TOKEN=<same> E2E_HEADLESS=1 \
//     npx playwright test origin-repo-guard
//
// Teardown is marker-only: it removes the two cards this file names and nothing
// else. The names carry a suffix no real property would have.

const SUFFIX = "E2E RepoGuard";
const ALPHA = { name: `Alpha ${SUFFIX}`, url: "https://alpha-repoguard.example", domain: "alpha-repoguard.example" };
const BETA = { name: `Beta ${SUFFIX}`, url: "https://beta-repoguard.example", domain: "beta-repoguard.example" };
const OWNER = "repoguard-owner";
const SHARED_REPO = "one-website-repo";
const BETA_REPO = "beta-website-repo";

// A click landing before React hydrates submits the form natively (a silent
// GET) and the test fails for a reason that is not the product. Wait for
// hydration and for in-flight fetches to settle before every click.
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
  await page.waitForFunction(() => (window as unknown as { __pending: number }).__pending === 0, null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(700);
}

// Anchored on the card's own <h2>, exact. A substring filter matches any
// article that merely mentions the name.
const card = exactCard;

async function onboard(page: Page, site: { name: string; url: string }, owner: string, repo: string) {
  await go(page, "/");
  await typeSlow(page.getByLabel("Site name"), site.name);
  await typeSlow(page.getByLabel("Origin URL"), site.url);
  await typeSlow(page.getByLabel("GitHub owner"), owner);
  await typeSlow(page.getByLabel(/GitHub repo/), repo);
  await page.getByRole("button", { name: "Assign Grok fleet" }).click();
  await waitIdle(page);
}

test.describe.configure({ mode: "serial" });

test("a first property may claim a repo folder", async ({ page }) => {
  await onboard(page, ALPHA, OWNER, SHARED_REPO);
  markCreated(ALPHA.name);
  await expect(card(page, ALPHA.name)).toBeVisible();
});

test("a second property onboarding into the same folder is refused, and is not created", async ({ page }) => {
  await onboard(page, BETA, OWNER, SHARED_REPO);
  // The refusal is shown, not swallowed.
  const error = page.locator("div.glass.text-rose-300");
  await expect(error).toContainText("already holds");
  await expect(error).toContainText(ALPHA.domain);
  // And nothing was created: a refused onboard must leave no half-made property.
  await expect(card(page, BETA.name)).toHaveCount(0);
});

test("the same property onboards fine into its own folder", async ({ page }) => {
  await onboard(page, BETA, OWNER, BETA_REPO);
  markCreated(BETA.name);
  await expect(card(page, BETA.name)).toBeVisible();
});

test("the campaign form refuses a folder another property already holds", async ({ page }) => {
  await go(page, "/");
  await card(page, BETA.name).getByRole("link", { name: /campaign/i }).first().click();
  await waitIdle(page);

  const repoField = page.getByLabel("GitHub repo", { exact: true });
  await repoField.fill("");
  await typeSlow(repoField, SHARED_REPO);

  const conflict = page.getByTestId("github-draft-conflict");
  await expect(conflict).toContainText("already holds");
  await expect(conflict).toContainText(ALPHA.domain);
  // The buttons must not offer a push the server would refuse.
  await expect(page.getByRole("button", { name: "Save repo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Push origin files" })).toBeDisabled();
});

test("the campaign form refuses CiteFleet's own repo", async ({ page }) => {
  await go(page, "/");
  await card(page, BETA.name).getByRole("link", { name: /campaign/i }).first().click();
  await waitIdle(page);

  const repoField = page.getByLabel("GitHub repo", { exact: true });
  await repoField.fill("");
  await typeSlow(repoField, "citefleet");

  await expect(page.getByTestId("github-draft-conflict")).toContainText(
    "CiteFleet public/ is only for citefleet.app",
  );
  await expect(page.getByRole("button", { name: "Push origin files" })).toBeDisabled();
});

test("teardown: remove only the properties this file created", async ({ page }) => {
  // `removeIfOurs` refuses anything this run did not onboard, and waits for the
  // board to draw before concluding a property is gone — a count of zero on an
  // undrawn board previously reported a passing teardown while the property was
  // still live.
  for (const site of [ALPHA, BETA]) {
    const outcome = await removeIfOurs(page, site.name);
    expect(["removed", "absent"], `${site.name}: ${outcome}`).toContain(outcome);
  }
  await expect(card(page, ALPHA.name)).toHaveCount(0);
  await expect(card(page, BETA.name)).toHaveCount(0);
});
