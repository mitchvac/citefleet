import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { typeSlow } from "./typeSlow";
import { LESSONS, QUIZ } from "../../src/lib/citefleet/course";

// Headed e2e against live citefleet.app for ONE customer origin, in the order
// the Training module teaches (lesson 02 "Get a website listed" and quiz q12):
//   Training → Onboard → Live audit → campaign board → List on BotCentral →
//   confirm listing → Monitor (run monitor + reconcile) → Audit log.
// Never clicks "Push origin files" (commits to the customer
// repo) and never touches the kill switch.
//
// Tests run in file order on one worker (playwright.config.ts) and each starts
// from its own page.goto, so a failed step does not skip the rest; rerun any
// one alone with -g "<name>". The onboard test is skipped when a WflowProcess
// card already exists (E2E_REONBOARD=1 forces another copy); the last test
// removes every card carrying this suite's exact name (marker-only teardown)
// via the campaign's Remove property button, where that build is deployed.

// The customer under test. Any origin works; these env vars pick it:
//   E2E_SITE_NAME  human label (default WflowProcess)
//   E2E_SITE_URL   https origin (default https://wflowprocess.app)
//   E2E_GH_OWNER / E2E_GH_REPO / E2E_GH_ROOT  website repo + web root folder
const SITE_NAME = process.env.E2E_SITE_NAME || "WflowProcess";
const ORIGIN_URL = (process.env.E2E_SITE_URL || "https://wflowprocess.app").replace(/\/$/, "");
const DOMAIN = new URL(ORIGIN_URL).hostname;
const GH_OWNER = process.env.E2E_GH_OWNER || "mitchvac";
const GH_REPO = process.env.E2E_GH_REPO || "wflowprocess";
const GH_ROOT = process.env.E2E_GH_ROOT || "frontend/public"; // web root folder in that repo
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

test.describe("user gate (signed out)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("the console redirects to /login; a wrong password is refused; hooks still answer", async ({ page, baseURL }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/, { timeout: 30000 });
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/login\?error=/, { timeout: 30000 });
    await expect(page.getByTestId("login-error")).toBeVisible();
    const r = await page.request.post(`${baseURL}/api/hooks/github`, { data: "{}", headers: { "content-type": "application/json" } });
    expect(r.status()).toBe(401);
    const health = await page.request.get(`${baseURL}/health`);
    expect(health.status()).toBe(200);
    // Invite-only: an email outside the allow-list cannot create an account (nothing is created).
    const signup = await page.request.post(`${baseURL}/api/signup`, { form: { name: "x", email: "stranger@example.invalid", password: "longenough-123" }, maxRedirects: 0 });
    expect(signup.status()).toBe(303);
    expect(signup.headers()["location"] || "").toMatch(/error=not-allowed/);
  });
});

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

test(`lesson 02 steps 1–3: onboard ${DOMAIN} on Command`, async ({ page }) => {
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
  // The audit names the hosting provider (Vercel / Netlify / GitHub Pages / Self-hosted / Unreachable …).
  await expect(card.getByTestId("hosting")).toBeVisible();
  await expect(card.getByTestId("hosting")).toHaveText(/^(Vercel|Netlify|GitHub Pages|Behind Cloudflare|Self-hosted|Unreachable|Unknown host)$/);
  test.info().annotations.push({ type: "hosting", description: await card.getByTestId("hosting").innerText() });
});

test(`lesson 02 steps 5–6: campaign board, attach ${GH_OWNER}/${GH_REPO}, List on BotCentral`, async ({
  page,
}) => {
  await page.goto("/");
  const card = siteCard(page);
  await card.waitFor({ timeout: 30000 });
  await card.getByRole("link", { name: "Open campaign" }).click();

  // P1 crawl-integrity tasks are on the board (lesson 06 priority order).
  await expect(page.getByRole("heading", { name: SITE_NAME, exact: true })).toBeVisible();
  await expect(page.getByTestId("hosting-line")).toContainText("Hosting:"); // persisted by the audit
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
  await expect.soft(page.getByText("Live on BotCentral").first()).toBeVisible({ timeout: 10000 });
  // The proof line the origin must serve (verify-token.ts); shown once the site has a token.
  const proof = gh.getByText(/botcentral-verify=\S+/);
  await expect.soft(proof, "proof token line in Origin files panel").toBeVisible({ timeout: 10000 });
  if (await proof.count()) {
    const line = (await proof.first().innerText()).match(/botcentral-verify=\S+/)?.[0] ?? "";
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

test("lesson 13: Automatic listing — verify proof, generate the webhook secret, signed deliveries", async ({
  page,
  baseURL,
}) => {
  await page.goto("/");
  const card = siteCard(page);
  await card.waitFor({ timeout: 30000 });
  await card.getByRole("link", { name: "Open campaign" }).click();
  const panel = page.getByTestId("auto-listing");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByTestId("webhook-url")).toHaveText(/\/api\/hooks\/github$/);
  await expect(panel.getByTestId("hosting-hint")).toBeVisible();

  // Verify proof applies BotCentral's rules locally and records the result.
  await panel.getByRole("button", { name: "Verify proof" }).click();
  await expect(panel.getByRole("button", { name: "Verify proof" })).toBeEnabled({ timeout: 60000 });
  await expect(panel.getByTestId("proof-note")).toBeVisible();
  test.info().annotations.push({ type: "proof", description: await panel.getByTestId("proof-note").innerText() });

  // Generate the secret the customer pastes into GitHub.
  await panel.getByRole("button", { name: /Generate webhook secret|Rotate webhook secret/ }).click();
  await expect(panel.getByTestId("webhook-secret")).toHaveText(/^[0-9a-f]{48}$/, { timeout: 30000 });
  const secret = (await panel.getByTestId("webhook-secret").innerText()).trim();
  const hooks = `${baseURL}/api/hooks/github`;
  const sign = (body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const repo = { full_name: `${GH_OWNER}/${GH_REPO}` };

  // Unsigned delivery is refused.
  const bad = JSON.stringify({ ref: "refs/heads/main", repository: repo });
  const unsigned = await page.request.post(hooks, { data: bad, headers: { "content-type": "application/json", "x-github-event": "push" } });
  expect(unsigned.status()).toBe(401);

  // GitHub's ping is answered 200.
  const ping = JSON.stringify({ zen: "Keep it logically awesome.", repository: repo });
  const pinged = await page.request.post(hooks, { data: ping, headers: { "content-type": "application/json", "x-github-event": "ping", "x-github-delivery": "e2e-ping", "x-hub-signature-256": sign(ping) } });
  expect(pinged.status()).toBe(200);

  // A push to another branch is acknowledged and ignored; a push to main queues the check.
  const feature = JSON.stringify({ ref: "refs/heads/feature", repository: repo });
  const ignored = await page.request.post(hooks, { data: feature, headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "e2e-feature", "x-hub-signature-256": sign(feature) } });
  expect(ignored.status()).toBe(202);
  expect((await ignored.json()).action).toBe("ignore");
  const main = JSON.stringify({ ref: "refs/heads/main", repository: repo });
  const accepted = await page.request.post(hooks, { data: main, headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "e2e-main", "x-hub-signature-256": sign(main) } });
  expect(accepted.status()).toBe(202);
  expect((await accepted.json()).action).toBe("check");
  // GitHub redelivery of the same id is acknowledged, not re-run.
  const replay = await page.request.post(hooks, { data: main, headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "e2e-main", "x-hub-signature-256": sign(main) } });
  expect(replay.status()).toBe(202);
  expect((await replay.json()).action).toBe("duplicate");
  // Unknown repository answers exactly like a bad signature.
  const stranger = JSON.stringify({ ref: "refs/heads/main", repository: { full_name: "someone/else" } });
  const unknown = await page.request.post(hooks, { data: stranger, headers: { "content-type": "application/json", "x-github-event": "push", "x-hub-signature-256": sign(stranger) } });
  expect(unknown.status()).toBe(401);

  // Any other CI: the generic deployed hook with the same secret.
  const deployedBody = JSON.stringify({ domain: DOMAIN });
  const deployed = await page.request.post(`${baseURL}/api/hooks/deployed`, { data: deployedBody, headers: { "content-type": "application/json", "x-citefleet-delivery": "e2e-ci", "x-citefleet-signature": sign(deployedBody) } });
  expect(deployed.status()).toBe(202);
  // The push a moment ago may still be checking: one check per site at a time.
  expect(["check", "in-progress"]).toContain((await deployed.json()).action);
  await expect(panel.getByTestId("deployed-url")).toHaveText(/\/api\/hooks\/deployed$/);

  await page.reload();
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByTestId("webhook-last")).toContainText("deploy reported", { timeout: 30000 });
  await page.goto("/activity");
  await expect(page.getByText(`GitHub hook received for ${DOMAIN} (push to main)`).first()).toBeVisible();
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
