import { expect, type Page } from "@playwright/test";

// Who owns a property, and how a spec is allowed to remove one.
//
// THE INCIDENT THIS EXISTS FOR. Running the suite with
// `E2E_SITE_NAME=wflowprocess` deleted a genuine production property and its 12
// tasks. Two things combined:
//
//   1. `siteCard` matched with `.filter({ hasText: SITE_NAME_EXACT })`, and
//      despite the name, `SITE_NAME_EXACT` is an UNANCHORED substring regex.
//      The card renders its own domain (`wflowprocess.app`) inside the article,
//      so /wflowprocess/ matched the domain text of a card whose name was
//      something else entirely.
//   2. The teardown removed every card the locator matched, in a loop, whether
//      or not this run had created any of them. Creation is skippable — removal
//      was not conditional on it.
//
// So the rule here is ownership, not cleverer matching: a spec may remove a
// property only if THIS RUN created it. `markCreated` is the only way in, and it
// is called after the onboard is confirmed, never before.
//
// `exactCard` is the second half: it anchors on the card's own <h2> with
// `exact: true` rather than on free text anywhere inside the article. That is
// the pattern `botcentral-listing-audit.spec.ts` already adopted after its own
// near-miss, where a `hasText: "botcentral.org"` filter selected a CUSTOMER's
// card because that card linked to botcentral.org.

/** Unique per `playwright test` process. Names a run in logs and in fixture names. */
export const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Property names this run onboarded and is therefore allowed to remove. */
const createdHere = new Set<string>();

/** Record a property as created by this run. Call it only after the card appears. */
export function markCreated(name: string): void {
  createdHere.add(name);
}

export function wasCreatedHere(name: string): boolean {
  return createdHere.has(name);
}

/** Every property this run created, for a teardown that sweeps its own leftovers. */
export function createdNames(): string[] {
  return [...createdHere];
}

/**
 * The card for exactly this property.
 *
 * Anchored on the article's own heading with `exact: true`, so it cannot match a
 * neighbour whose body merely mentions the same string — a domain, a BotCentral
 * link, or another property's name that happens to contain this one.
 */
export function exactCard(page: Page, name: string) {
  return page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) })
    .first();
}

/**
 * Wait until the board has actually drawn.
 *
 * A positive control, and not optional: `count() === 0` on a board that has not
 * rendered is indistinguishable from "the property is gone", and an earlier
 * teardown reported success on exactly that basis while the property was still
 * live. Never conclude absence from a board that has drawn nothing.
 */
export async function boardDrawn(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("article").first()).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1500);
}

/**
 * Remove a property, but ONLY if this run created it.
 *
 * Returns "removed", "not-ours" (present but this run did not create it), or
 * "absent". It never throws for "not-ours": a suite run against a workspace that
 * already holds a same-named property should report and move on, not delete
 * somebody's work and not fail the run for the existence of unrelated data.
 */
export async function removeIfOurs(
  page: Page,
  name: string,
): Promise<"removed" | "not-ours" | "absent"> {
  if (!wasCreatedHere(name)) return "not-ours";
  await boardDrawn(page);
  const target = exactCard(page, name);
  if ((await target.count()) === 0) return "absent";

  // A persistent handler, registered before the click: an earlier version armed
  // `page.once` immediately before clicking and the confirm was never accepted,
  // so the property silently survived a "passing" teardown.
  page.on("dialog", (d) => void d.accept());
  await target.getByRole("link", { name: /campaign/i }).first().click();
  // Long enough for React to attach handlers on a production round trip; a click
  // on an unhydrated button is silently a no-op and leaves the property behind.
  await page.waitForTimeout(3000);
  const remove = page.getByRole("button", { name: "Remove property" });
  await expect(remove).toBeVisible();
  await remove.click();
  await page.waitForTimeout(5000);
  await boardDrawn(page);
  return "removed";
}
