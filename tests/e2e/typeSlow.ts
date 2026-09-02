import { expect, type Locator } from "@playwright/test";

// Clear a controlled input, then type into it keystroke by keystroke so the
// headed run shows the typing. `fill("")` clears through input events React
// sees; the old Meta+A / Control+A / Backspace dance is not portable — on
// macOS Chrome, Control+A moves the caret to line start instead of selecting,
// so text was typed in front of the field's preset value (e.g. "https://").
export async function typeSlow(locator: Locator, text: string) {
  await locator.click();
  await locator.fill("");
  await expect(locator).toHaveValue("");
  await locator.pressSequentially(text, { delay: 120 });
  await expect(locator).toHaveValue(text);
}
