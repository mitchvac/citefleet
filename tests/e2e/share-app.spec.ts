import { expect, test, type Page } from "@playwright/test";
import { SHARE_PATH, SHARE_TEXT, SHARE_TITLE } from "../../src/lib/citefleet/share-app";

// The header's "Share app" button, exercised signed OUT: it lives in the Shell,
// so it is on the public pages (/start, /learn, /topup) as well as the console,
// and a person deciding whether to sign up is exactly who passes the app on.
//
// The native share sheet cannot be driven from automation (it is OS chrome), so
// the first test replaces `navigator.share` with a recorder and asserts the
// payload; the second removes it and asserts the clipboard fallback; the third
// pins the 320px header, which the button widened.

test.use({ storageState: { cookies: [], origins: [] } });

// A click before React hydrates lands on dead markup (2026-09-03 harness note).
// The Shell fetches /api/me from an effect, which only runs once hydrated.
async function gotoHydrated(page: Page, path: string) {
  const me = page.waitForResponse((r) => r.url().endsWith("/api/me"));
  await page.goto(path);
  await me;
}

test("native share sheet receives the app link and copy", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: unknown) => {
        (window as unknown as { __shared: unknown[] }).__shared.push(data);
      },
    });
  });
  await gotoHydrated(page, "/learn");
  const button = page.getByRole("button", { name: "Share app" });
  await expect(button).toBeVisible();
  await button.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared))
    .toEqual([{ title: SHARE_TITLE, text: SHARE_TEXT, url: `${new URL(baseURL!).origin}${SHARE_PATH}` }]);
  // The sheet took it: nothing else changes on the page.
  await expect(page.getByRole("button", { name: "Share app" })).toBeVisible();
});

test("without a share sheet the link is copied and the button says so", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });
  await gotoHydrated(page, "/start");
  await page.getByRole("button", { name: "Share app" }).click();
  await expect(page.getByRole("button", { name: "Link copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${new URL(baseURL!).origin}${SHARE_PATH}`,
  );
  // And it returns to its resting label rather than staying "copied" forever.
  await expect(page.getByRole("button", { name: "Share app" })).toBeVisible({ timeout: 5000 });
});

// The two widths the button pinched when its label was always drawn: the
// narrowest phone, and the laptop width where the desktop nav's ten pills
// first sit beside it (Shell.tsx switches navs at lg). Zero overflow was the
// measured baseline on every route before the button existed.
for (const width of [320, 1024]) {
  test(`the header still fits a ${width}px viewport with the button in it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await gotoHydrated(page, "/learn");
    const button = page.getByRole("button", { name: "Share app" });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}
