/**
 * The share card carries the CiteFleet logo, and every public page can share.
 *
 * What was wrong. `og:image` pointed at the og.grok.me PLACEHOLDER
 * (`/v1/card.png?host=citefleet.app&title=CiteFleet`), which returns a valid
 * 1200x630 PNG of 187 bytes — a blank near-black rectangle. Every share of a
 * citefleet.app link on Slack, X, LinkedIn or iMessage rendered an empty box
 * with no logo and no words. `grok-pwa-shared.mjs` already prefers
 * `public/og.jpg|png` when one is on disk; nothing was on disk, so the
 * placeholder won by default.
 *
 * And `/login` had no Share app button. It renders standalone rather than
 * through `Shell`, so it never inherited the header's — and it is the FIRST
 * page a signed-out visitor sees, because `/` bounces there. AGENTS.md claimed
 * the button was on "every page, public ones included"; it was on three of
 * four.
 *
 * Sizes below are deliberate: 187 bytes is the blank placeholder this replaced,
 * so a card that ever collapses back to a few hundred bytes fails here.
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ogCardPublicPath, grokOgHeadTags } from "./grok-pwa-shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CARD = join(ROOT, "public/og.png");

/** Width/height straight out of the PNG IHDR. */
function pngSize(bytes) {
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "not a PNG",
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("the repo ships its own OG card", () => {
  assert.ok(existsSync(CARD), "public/og.png is missing — og:image falls back to the blank og.grok.me placeholder");
});

test("the card is a real 1200x630 image, not the 187-byte blank", () => {
  const bytes = readFileSync(CARD);
  const { width, height } = pngSize(bytes);
  assert.equal(width, 1200);
  assert.equal(height, 630);
  // The placeholder was a valid 1200x630 PNG too — only its SIZE gave it away.
  // Dimensions alone would have passed against a blank rectangle.
  assert.ok(
    bytes.length > 10_000,
    `card is ${bytes.length} bytes — the blank placeholder was 187, so this is empty or near-empty`,
  );
});

test("the plugin resolves our card, not the placeholder service", () => {
  assert.equal(ogCardPublicPath(ROOT), "/og.png");

  const tags = grokOgHeadTags({
    host: "citefleet.app",
    appName: "CiteFleet",
    cwd: ROOT,
  }).join("\n");

  assert.match(tags, /property="og:image" content="https:\/\/citefleet\.app\/og\.png"/);
  assert.doesNotMatch(tags, /og\.grok\.me/);
  assert.match(tags, /property="og:image:width" content="1200"/);
  assert.match(tags, /property="og:image:height" content="630"/);
});

test("positive control: without a card on disk the placeholder still wins", () => {
  // Proves the assertion above is reading disk state rather than always
  // passing. A cwd with no public/og.* must fall back to og.grok.me.
  const tags = grokOgHeadTags({
    host: "citefleet.app",
    appName: "CiteFleet",
    cwd: join(ROOT, "src"),
  }).join("\n");
  assert.match(tags, /og\.grok\.me/);
});

test("every public page can share the app, /login included", () => {
  // Source-level: these are TSX routes and this repo's unit runner has no DOM.
  // The e2e suite drives the button; this pins that the login page HAS one.
  const login = readFileSync(join(ROOT, "src/routes/login.tsx"), "utf8");
  assert.match(login, /import \{ ShareApp \}/, "login.tsx does not import ShareApp");
  assert.match(login, /<ShareApp \/>/, "login.tsx does not render ShareApp");

  // Control: the component it is meant to sit beside is really there, so a
  // renamed file cannot make the assertions above vacuously true.
  assert.match(login, /BrandLogo/);
});
