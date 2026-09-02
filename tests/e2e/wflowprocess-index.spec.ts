import { expect, test, type Page } from "@playwright/test";
import { typeSlow } from "./typeSlow";
import { LESSONS, QUIZ } from "../../src/lib/citefleet/course";

// Headed e2e against live citefleet.app, in the order the Training module teaches
// (lesson 02 "Get a website listed" and quiz q12):
//   Training → Onboard → Live audit → campaign board → List on BotCentral →
//   confirm listing → Monitor (run monitor + reconcile) → Audit log.
// Real domain: wflowprocess.app, website repo mitchvac/wflowprocess (web root
// frontend/public). Never clicks "Push origin files" (commits to the customer
// repo) and never touches the kill switch.
//
// Tests run in file order on one worker (playwright.config.ts) and each starts
// from its own page.goto, so a failed step does not skip the rest; rerun any
// one alone with -g "<name>". The onboard test is skipped when a WflowProcess
// card already exists (E2E_REONBOARD=1 forces another copy); the last test
// removes every card carrying this suite's exact name (marker-only teardown)
// via the campaign's Remove property button, where that build is deployed.

const SITE_NAME = "WflowProcess";
const ORIGIN_URL = "https://wflowprocess.app";
const DOMAIN = "wflowprocess.app";
const GH_OWNER = "mitchvac";
const GH_REPO = "wflowprocess";
const GH_ROOT = "frontend/public"; // Next.js app lives in frontend/, so public/ is there
const ORIGIN_FILES_HEADING = "Origin files → GitHub"; // "Push origin files" also contains "Origin files"

// hasText with a string is case-insensitive and would also match a manually added
// "wflowprocess" site; the regex is case-sensitive, so only this suite's name matches.
const SITE_NAME_EXACT = new RegExp(SITE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

function siteCard(page: Page) {
  // Production may hold other wflowprocess.app sites; match the one this suite named.
  return page
    .locator("article")
    .filter({ hasText: DOMAIN })
    .filter({ hasText: SITE_NAME_EXACT })
    .first();
}

test("training: read every lesson, the glossary, and pass the operator test", async ({
  page,
}) => {
  await page.goto("/learn");
  await expect(page.getByRole("heading", { name: "CiteFleet training" })).toBeVisible();
  await page.getByRole("link", { name: "Acronyms and terms" }).click();
  await expect(page.getByRole("heading", { name: "Acronyms and terms" })).toBeVisible();
  await page.waitForTimeout(800);
  await page.goBack();

  await page.getByRole("link", { name: "Start: list a website" }).click();
  const start = LESSONS.findIndex((l) => l.slug === "list-a-site");
  for (let i = start; i < LESSONS.length; i++) {
    const lesson = LESSONS[i];
    await expect(page.getByRole("heading", { name: lesson.title, exact: true })).toBeVisible();
    await expect(page.getByText(`Step ${lesson.steps.length}`)).toBeVisible();
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(700);
    const next = LESSONS[i + 1];
    if (next) {
      await page.getByRole("link", { name: `Next: ${next.title}` }).click();
    }
  }
  await page.getByRole("link", { name: "Take the test" }).click();
  await expect(page.getByRole("heading", { name: "Operator test" })).toBeVisible();

  for (const q of QUIZ) {
    const card = page.locator("article").filter({ hasText: q.prompt }).first();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: q.choices[q.answer], exact: true }).click();
    await page.waitForTimeout(250);
  }
  const score = page.getByRole("button", { name: "Score test" });
  await expect(score).toBeEnabled();
  await score.click();
  await expect(page.getByText(`${QUIZ.length}/${QUIZ.length} — passed`)).toBeVisible();

  // Lesson 07 / 08 pages exist and load.
  await page.goto("/fleet");
  await expect(page.getByRole("heading", { name: "Grok fleet roster" })).toBeVisible();
  await page.goto("/playbook");
  await expect(page.getByRole("heading", { name: "Indexing playbook" })).toBeVisible();
});

test("lesson 02 steps 1–3: onboard wflowprocess.app on Command", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Onboard a property").waitFor();
  await page.waitForTimeout(600);

  const already = (await siteCard(page).count()) > 0;
  test.skip(
    already && !process.env.E2E_REONBOARD,
    `${SITE_NAME} is already onboarded and CiteFleet has no remove-site; set E2E_REONBOARD=1 to add another copy`,
  );

  const form = page.locator("aside").filter({ hasText: "Onboard a property" });
  await form.scrollIntoViewIfNeeded();

  await typeSlow(form.getByPlaceholder("Acme Dating"), SITE_NAME);
  await typeSlow(form.getByPlaceholder("https://example.com"), ORIGIN_URL);
  // IndexNow key left blank: wflowprocess.app does not serve a /{key}.txt yet.
  await typeSlow(form.getByPlaceholder("mitchvac"), GH_OWNER);
  await typeSlow(form.getByPlaceholder("citefleet"), GH_REPO);

  const assign = form.getByRole("button", { name: /Assign Grok fleet/i });
  await expect(assign).toBeEnabled();
  await assign.click();

  const card = siteCard(page);
  await card.waitFor({ timeout: 30000 });
  await expect(card).toContainText(DOMAIN);
  await expect(card.getByRole("link", { name: "Open campaign" })).toBeVisible();
});

test("lesson 02 step 4: Live audit on the property card", async ({ page }) => {
  await page.goto("/");
  const card = siteCard(page);
  await card.waitFor({ timeout: 30000 });
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button", { name: "Live audit", exact: true }).click();
  // Audit fetches the real origin (routes, robots, sitemap, llms); wait for it to land.
  await expect(card.getByRole("button", { name: "Live audit", exact: true })).toBeEnabled({
    timeout: 120000,
  });
  await expect(card).toContainText("last audit", { timeout: 15000 });
  await expect(card).toContainText("playbook tasks complete");
});

test("lesson 02 steps 5–6: campaign board, attach mitchvac/wflowprocess, List on BotCentral", async ({
  page,
}) => {
  await page.goto("/");
  const card = siteCard(page);
  await card.waitFor({ timeout: 30000 });
  await card.getByRole("link", { name: "Open campaign" }).click();

  // P1 crawl-integrity tasks are on the board (lesson 06 priority order).
  await expect(page.getByRole("heading", { name: SITE_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repair SPA fallback 404s" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome AI crawlers in robots.txt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Publish and submit sitemap.xml" })).toBeVisible();

  await page.getByText(ORIGIN_FILES_HEADING).waitFor({ timeout: 20000 });
  const gh = page.locator("section").filter({ hasText: ORIGIN_FILES_HEADING });
  await gh.scrollIntoViewIfNeeded();
  await typeSlow(gh.getByPlaceholder("mitchvac"), GH_OWNER);
  await typeSlow(gh.getByPlaceholder("website-repo"), GH_REPO);
  await typeSlow(gh.getByPlaceholder("main"), "main");
  await typeSlow(gh.getByPlaceholder("public"), GH_ROOT);
  await gh.getByRole("button", { name: /Save repo/i }).click();
  await expect(gh.getByRole("heading", { name: `${GH_OWNER}/${GH_REPO}` })).toBeVisible({
    timeout: 20000,
  });
  await expect(gh.getByText("repo attached")).toBeVisible();
  await expect(gh.getByPlaceholder("public")).toHaveValue(GH_ROOT);

  // Step 6: List on BotCentral (Orion publishes the 1.0 card).
  const listBtn = page.getByRole("button", {
    name: /Refresh BotCentral card|List on BotCentral/i,
  });
  await listBtn.scrollIntoViewIfNeeded();
  await listBtn.click();
  await expect(listBtn).toBeEnabled({ timeout: 60000 });
  await page.waitForTimeout(1000);

  const error = page.locator(".text-rose-300");
  const errorText = (await error.count()) ? (await error.first().innerText()).trim() : "";
  test.info().annotations.push({ type: "botcentral-publish", description: errorText || "ok" });
  await page.screenshot({ path: "test-results/wflowprocess-campaign.png", fullPage: true });
  // Soft so the remaining lessons still run; the suite still reports red if listing failed.
  expect.soft(errorText, "BotCentral publish error banner").toBe("");
  await expect.soft(page.getByText("Live on BotCentral")).toBeVisible({ timeout: 10000 });
  // The proof line the origin must serve (verify-token.ts); shown once the site has a token.
  const proof = gh.getByText(/botcentral-verify=[0-9a-f]{32}/);
  await expect.soft(proof, "proof token line in Origin files panel").toBeVisible({ timeout: 10000 });
  if (await proof.count()) {
    const line = (await proof.first().innerText()).match(/botcentral-verify=[0-9a-f]{32}/)?.[0] ?? "";
    test.info().annotations.push({ type: "proof-line", description: `${DOMAIN}: ${line}` });
    console.log(`PROOF LINE ${DOMAIN}: ${line}`);
  }
});

test("lesson 02 step 7: confirm the listing on Command and at botcentral.org", async ({
  page,
}) => {
  await page.goto("/");
  const card = siteCard(page);
  await card.waitFor({ timeout: 30000 });
  await card.scrollIntoViewIfNeeded();
  await expect.soft(card.getByText("Listed on BotCentral")).toBeVisible({ timeout: 10000 });

  const machine = await page.request.get(`https://botcentral.org/v1/site/${DOMAIN}`);
  test.info().annotations.push({
    type: "botcentral-machine-card",
    description: `HTTP ${machine.status()}`,
  });
  expect.soft(machine.status(), "GET /v1/site/{domain}").toBe(200);
});

test("lesson 12: Monitor — run monitor + reconcile (observe only, no freeze)", async ({
  page,
}) => {
  await page.goto("/ops");
  await expect(page.getByRole("heading", { name: "Monitor · Reconcile · Kill" })).toBeVisible();
  // Never toggle the kill switch from a test.
  await expect(page.getByRole("button", { name: /Freeze all acts|Thaw all acts/ })).toBeVisible();

  const run = page.getByRole("button", { name: "Run monitor + reconcile" });
  await run.scrollIntoViewIfNeeded();
  await run.click();
  await expect(run).toBeEnabled({ timeout: 120000 });

  await expect(page.getByText("Catalog host · botcentral.org")).toBeVisible();
  const snap = page.locator("article").filter({ hasText: DOMAIN }).first();
  await snap.scrollIntoViewIfNeeded();
  await expect(snap).toContainText("probes");
  await expect(snap.getByText(/^(listed|unlisted)$/)).toBeVisible(); // pill, not the "Not listed…" sentence
  await expect(snap.getByText("acts open")).toBeVisible();
  await page.screenshot({ path: "test-results/wflowprocess-monitor.png", fullPage: true });
});

test("lesson 06: Remove property — teardown of the sites this suite created", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Onboard a property").waitFor();
  for (let i = 0; i < 5 && (await siteCard(page).count()) > 0; i++) {
    await siteCard(page).getByRole("link", { name: "Open campaign" }).click();
    // Wait for the campaign to render before deciding whether the button exists.
    await page.getByText(ORIGIN_FILES_HEADING).waitFor({ timeout: 20000 });
    const remove = page.getByRole("button", { name: "Remove property" });
    if ((await remove.count()) === 0) {
      test.skip(true, "Remove property is not deployed on this target yet");
    }
    page.once("dialog", (d) => void d.accept());
    await remove.click();
    await page.waitForURL(/\/$/, { timeout: 30000 });
    await page.getByText("Onboard a property").waitFor();
  }
  await expect(siteCard(page)).toHaveCount(0);
  await page.goto("/activity");
  await expect(page.getByText(`Removed ${DOMAIN} (${SITE_NAME})`).first()).toBeVisible();
});

test("lesson 09: Audit log carries the trail for this property", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByText(`Workspace accepted ${DOMAIN} for indexing campaign.`).first()).toBeVisible();
  await expect(
    page.getByText(`GitHub connected: ${GH_OWNER}/${GH_REPO} (main, root ${GH_ROOT}).`).first(),
  ).toBeVisible();
});
