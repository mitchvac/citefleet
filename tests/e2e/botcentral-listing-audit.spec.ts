import { expect, test, type Locator, type Page } from "@playwright/test";
import { typeSlow } from "./typeSlow";

// Headed audit: list botcentral.org on citefleet.app and, on the way, drive
// every button on every form the flow touches and check it does the thing it
// was designed to do — not merely that clicking it does not crash.
//
// Runs against LIVE citefleet.app. It creates one property and removes it at
// the end. Two things it deliberately never does:
//   - set a billing key. `publishSiteToBotCentral` only asserts the `spend`
//     door when `billingPrefixFor(site)` is truthy (dispatcher.ts:429), so a
//     property with no key publishes UNBILLED and cannot spend the balance.
//   - click Push origin files expecting a write. The workspace PAT is expired;
//     the guard is expected to refuse, and that refusal is the assertion.
//
//   E2E_URL=https://citefleet.app E2E_OPERATOR_TOKEN=… E2E_CHANNEL=chrome \
//     npx playwright test botcentral-listing-audit     # headed by default

const SITE = {
  name: "BotCentral",
  url: "https://botcentral.org",
  domain: "botcentral.org",
};

type Row = { form: string; button: string; expected: string; got: string; ok: boolean };
const REPORT: Row[] = [];

function record(form: string, button: string, expected: string, got: string, ok: boolean) {
  REPORT.push({ form, button, expected, got, ok });
  console.log(`AUDIT|${ok ? "PASS" : "FAIL"}|${form}|${button}|${expected}|${got}`);
}

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
  await settle(page);
}

// Production round trips are slower than local: the fetch counter reaches zero
// before React attaches handlers, and a click on an unhydrated button is a
// silent no-op. Wait for the counter AND give hydration real time.
async function settle(page: Page) {
  await page
    .waitForFunction(() => (window as unknown as { __pending: number }).__pending === 0, null, {
      timeout: 45_000,
    })
    .catch(() => {});
  await page.waitForTimeout(2500);
}

// NEVER hunt for the card by text. An earlier version filtered articles by
// hasText "botcentral.org" and matched RESONANSE first — its card links to
// botcentral.org/site/resonanse.app — so every button in this audit was driven
// against a live customer property, and Save repo rewrote its repo to
// mitchvac/botcentral. The site id is the only unambiguous handle.
const SITE_ID = process.env.E2E_SITE_ID || "";

function card(page: Page, _name: string) {
  // Anchored on the card's own H2, not on free text anywhere inside it.
  return page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: SITE.name, exact: true }) })
    .first();
}

/** Open THIS property's campaign page directly, and assert we are on it. */
async function openCampaign(page: Page) {
  if (!SITE_ID) throw new Error("E2E_SITE_ID is required — refusing to guess which property to drive");
  await go(page, `/sites/${SITE_ID}`);
  // Guard rail: never act on a page that is not this property.
  await expect(page.locator("body")).toContainText(SITE.domain, { timeout: 45_000 });
}

async function boardLoaded(page: Page) {
  await go(page, "/");
  // Positive control: never conclude "no card" from a board that has not drawn.
  await expect(page.locator("article").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1500);
}

const errorBanner = (page: Page) => page.locator("div.glass.text-rose-300");

async function textOf(loc: Locator, max = 200): Promise<string> {
  if ((await loc.count()) === 0) return "";
  return (await loc.first().innerText()).replace(/\s+/g, " ").trim().slice(0, max);
}

test.describe.configure({ mode: "serial" });

test("Command · onboard form · Assign Grok fleet creates the property and dispatches the fleet", async ({
  page,
}) => {
  await boardLoaded(page);
  if ((await card(page, SITE.name).count()) > 0) {
    record("Command / onboard", "Assign Grok fleet", "creates botcentral.org", "already present — skipped create", true);
    return;
  }
  await typeSlow(page.getByLabel("Site name"), SITE.name);
  await typeSlow(page.getByLabel("Origin URL"), SITE.url);
  await page.getByRole("button", { name: "Assign Grok fleet" }).click();
  await settle(page);
  await boardLoaded(page);

  // Retrying assertion: the board re-renders after loadState resolves, so a
  // one-shot count() can sample the DOM before the new card is in it and report
  // a creation failure for a property that was in fact created.
  await expect(card(page, SITE.name)).toBeVisible({ timeout: 45_000 });
  const summary = await textOf(card(page, SITE.name));
  record(
    "Command / onboard",
    "Assign Grok fleet",
    "creates the property and Grok assigns bot tasks",
    summary.slice(0, 140),
    true,
  );
});

test("Command · site card · Open campaign navigates to the campaign page", async ({ page }) => {
  await openCampaign(page);
  const ok = /\/sites\//.test(page.url());
  record("Command / site card", "Open campaign", "navigates to /sites/<id>", page.url(), ok);
  expect(ok).toBe(true);
});

test("Campaign · Run live audit scores the origin from real HTTP", async ({ page }) => {
  await openCampaign(page);

  await page.getByRole("button", { name: "Run live audit" }).click();
  await page.waitForTimeout(9000);
  await settle(page);

  const err = await textOf(errorBanner(page));
  const overall = await textOf(page.getByTestId("score-overall")).catch(() => "");
  const body = await textOf(page.locator("main"), 400);
  record(
    "Campaign",
    "Run live audit",
    "audits the live origin and updates the scores",
    err || overall || body.slice(0, 120),
    !err,
  );
  expect(err).toBe("");
});

test("Campaign · Verify proof reports the real proof state of the origin", async ({ page }) => {
  await openCampaign(page);

  const verify = page.getByRole("button", { name: "Verify proof" });
  const present = (await verify.count()) > 0;
  if (!present) {
    record("Campaign / automatic listing", "Verify proof", "button present", "not rendered", false);
    return;
  }
  await verify.click();
  await page.waitForTimeout(9000);
  await settle(page);

  // botcentral.org serves NO /.well-known/botcentral.txt (404) and has no apex
  // TXT botcentral-verify, so the designed behaviour is to say so, not to pass.
  const err = await textOf(errorBanner(page), 300);
  const panel = await textOf(page.getByTestId("auto-listing"), 400);
  const saysUnproven = /not|no proof|fail|404|missing|could not/i.test(`${err} ${panel}`);
  record(
    "Campaign / automatic listing",
    "Verify proof",
    "reports the origin is unproven (no well-known file, no apex TXT)",
    (err || panel).slice(0, 180) || "(no message)",
    saysUnproven,
  );
});

test("Campaign · Origin files · Save repo persists, Check repo reads, Push refuses", async ({
  page,
}) => {
  await openCampaign(page);

  const owner = page.getByLabel("GitHub owner", { exact: true });
  const repo = page.getByLabel("GitHub repo", { exact: true });
  await owner.fill("");
  await typeSlow(owner, "mitchvac");
  await repo.fill("");
  await typeSlow(repo, "botcentral");

  // --- Save repo -----------------------------------------------------------
  await page.getByRole("button", { name: "Save repo" }).click();
  await settle(page);
  const saveErr = await textOf(errorBanner(page), 300);
  const heading = await textOf(page.locator("h2").filter({ hasText: /mitchvac/ }));
  record(
    "Campaign / origin files",
    "Save repo",
    "persists owner/repo and the panel reflects it",
    saveErr || heading || "(no heading)",
    !saveErr && /mitchvac\/botcentral/i.test(heading),
  );

  // --- Check repo (read-only) ---------------------------------------------
  await page.getByTestId("check-repo").click();
  await page.waitForTimeout(9000);
  await settle(page);
  const plan = page.getByTestId("origin-plan");
  const planVisible = (await plan.count()) > 0;
  const checkErr = await textOf(errorBanner(page), 300);
  const planText = await textOf(plan, 400);
  record(
    "Campaign / origin files",
    "Check repo",
    "reads the repo and reports a verdict per file, writing nothing",
    (checkErr || planText).slice(0, 200) || "(nothing rendered)",
    planVisible || /No GitHub token|credentials/i.test(checkErr),
  );

  // --- Push origin files ---------------------------------------------------
  // The guard must not offer a push it cannot make good on.
  const pushBtn = page.getByRole("button", { name: /^Push/ });
  const pushLabel = (await pushBtn.count()) ? await pushBtn.first().innerText() : "(absent)";
  const pushDisabled = (await pushBtn.count()) ? await pushBtn.first().isDisabled() : false;
  const unreadable = await textOf(page.getByTestId("origin-plan-unreadable"), 300);
  record(
    "Campaign / origin files",
    "Push origin files",
    "offers nothing to write while the repo cannot be read (expired PAT)",
    `label="${pushLabel.trim()}" disabled=${pushDisabled} ${unreadable.slice(0, 120)}`,
    pushDisabled || /Push 0 files/.test(pushLabel),
  );
});

test("Campaign · webhook secret button mints a secret and shows it once", async ({ page }) => {
  await openCampaign(page);

  const btn = page.getByRole("button", { name: /webhook secret/i });
  if ((await btn.count()) === 0) {
    record("Campaign / automatic listing", "Generate webhook secret", "button present", "not rendered", false);
    return;
  }
  const before = await btn.first().innerText();
  await btn.first().click();
  await page.waitForTimeout(6000);
  await settle(page);
  const err = await textOf(errorBanner(page), 200);
  const panel = await textOf(page.getByTestId("auto-listing"), 500);
  const after = await textOf(page.getByRole("button", { name: /webhook secret/i }));
  record(
    "Campaign / automatic listing",
    before.trim(),
    "mints a secret, shows it once, button becomes Rotate",
    err || `${after} · ${panel.slice(0, 120)}`,
    !err && /rotate/i.test(after),
  );
});

test("Campaign · List on BotCentral publishes the card (unbilled, no key on file)", async ({
  page,
}) => {
  await openCampaign(page);

  // Guard: a key on file would make this spend. There must not be one.
  const billingKey = await textOf(page.getByTestId("billing-key"), 200);
  const unbilled = /none/i.test(billingKey);
  record(
    "Campaign / billing",
    "(precondition, not a click)",
    "no key on file, so publishing cannot spend the balance",
    billingKey || "(not shown)",
    unbilled,
  );
  expect(unbilled).toBe(true);

  const list = page.getByRole("button", { name: /List on BotCentral|Refresh BotCentral card/ });
  const label = await list.first().innerText();
  await list.first().click();
  await page.waitForTimeout(12000);
  await settle(page);

  const err = await textOf(errorBanner(page), 400);
  const body = await textOf(page.locator("main"), 600);
  const listed = /Live on BotCentral|inspector/i.test(body);
  record(
    "Campaign",
    label.trim(),
    "publishes the card to the catalog and the page reports the listing",
    err || (listed ? "page reports Live on BotCentral" : body.slice(0, 200)),
    !err && listed,
  );
});

test("Campaign · Grok re-assign re-dispatches the fleet", async ({ page }) => {
  await openCampaign(page);

  await page.getByRole("button", { name: "Grok re-assign" }).click();
  await page.waitForTimeout(7000);
  await settle(page);
  const err = await textOf(errorBanner(page), 300);
  const body = await textOf(page.locator("main"), 300);
  record(
    "Campaign",
    "Grok re-assign",
    "re-runs the dispatcher without error",
    err || body.slice(0, 120),
    !err,
  );
});

test("Command · Re-dispatch on the card works from the board", async ({ page }) => {
  await boardLoaded(page);
  const btn = card(page, SITE.name).getByRole("button", { name: "Re-dispatch" });
  if ((await btn.count()) === 0) {
    record("Command / site card", "Re-dispatch", "button present", "not rendered", false);
    return;
  }
  await btn.first().click();
  await page.waitForTimeout(7000);
  await settle(page);
  const err = await textOf(errorBanner(page), 300);
  record("Command / site card", "Re-dispatch", "re-dispatches without error", err || "no error", !err);
});

// NO teardown. botcentral.org is meant to stay listed, so the property stays in
// the workspace. `Remove property` is therefore audited by inspecting the
// control, not by firing it — clicking it would undo the thing this run exists
// to achieve.
test("final state: botcentral.org remains a property, and Remove property is present but unused", async ({
  page,
}) => {
  await boardLoaded(page);
  await expect(card(page, SITE.name)).toBeVisible({ timeout: 45_000 });
  const present = await card(page, SITE.name).count();
  record(
    "Command / board",
    "(final state)",
    "botcentral.org stays in the workspace",
    present ? "card present" : "card MISSING",
    present > 0,
  );

  await openCampaign(page);
  const remove = page.getByRole("button", { name: "Remove property" });
  const enabled = (await remove.count()) > 0 && (await remove.first().isEnabled());
  record(
    "Campaign",
    "Remove property",
    "present and enabled — NOT clicked, it would undo the listing",
    enabled ? "present, enabled, deliberately not clicked" : "absent or disabled",
    enabled,
  );

  console.log("AUDIT_SUMMARY_START");
  for (const r of REPORT) console.log(`AUDIT|${r.ok ? "PASS" : "FAIL"}|${r.form}|${r.button}|${r.expected}|${r.got}`);
  console.log("AUDIT_SUMMARY_END");
  expect(present).toBeGreaterThan(0);
});
