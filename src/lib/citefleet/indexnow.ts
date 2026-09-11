// Browser-safe. The IndexNow key: what a valid one is, and where one comes from
// when the customer has none.
//
// TWO DEFECTS THIS CLOSES.
//
// 1. NOTHING GENERATED A KEY. The onboard form has an optional "IndexNow key"
//    box, there is no edit path afterwards, and `buildOriginPack` emits the key
//    file only when the field is set — so a customer who left it blank got four
//    files instead of five, and the `indexnow` playbook task could never close
//    (the auditor emits no finding at all when there is no key, so nothing ever
//    marks it done). A key is a PUBLIC verification string, not a secret —
//    `playbook.ts` says so — so there is no reason to make someone invent one.
//
// 2. THE KEY BECAME A WRITE PATH UNCHECKED. It flowed from the form through
//    `fleet-api` (typed `string`, no validation) into `dispatcher` verbatim, and
//    `buildOriginPack` used it as `${prefix}${key}.txt` — a repo path written
//    through the GitHub Contents API. A pasted `../../.github/workflows/x` was a
//    write outside the origin root. It is behind the operator gate, so it was
//    never remotely reachable, but "a value from a form is a path" is exactly
//    what fail-closed forbids.
//
// The shape is IndexNow's own: 8–128 characters of [A-Za-z0-9-].

const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

/**
 * Accept a customer-supplied key, or return "" if it is not one.
 *
 * Mirrors `cleanPrefix` in `topup.ts`: parse, do not sanitize. Stripping the bad
 * characters out of `../../x` would leave `x`, a silently different key that
 * still writes somewhere unintended. An invalid key is refused, not repaired.
 */
export function cleanIndexNowKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return KEY_PATTERN.test(trimmed) ? trimmed : "";
}

export function isIndexNowKey(raw: unknown): boolean {
  return cleanIndexNowKey(raw) !== "";
}

/** A fresh key. 32 hex characters — inside IndexNow's range, and URL-safe by construction. */
export function newIndexNowKey(uuid: () => string = () => crypto.randomUUID()): string {
  return uuid().replace(/-/g, "").slice(0, 32);
}

/**
 * The key a site should have: the one it already has, else the customer's valid
 * paste, else a fresh one.
 *
 * NEVER replaces an existing key. The generated `<key>.txt` file carries no
 * ownership marker, so `classifyOriginFile` can only ever `create` it or find it
 * `identical` — it cannot recognise and update one. Rotate the key and the old
 * file stays on the customer's origin forever, unowned and unremovable by us.
 * Changing a key must therefore be a deliberate act (`setIndexNowKey`), never a
 * side effect of onboarding or of a pack rebuild.
 */
export function resolveIndexNowKey(existing: string | undefined, pasted?: unknown): string {
  const current = cleanIndexNowKey(existing);
  if (current) return current;
  return cleanIndexNowKey(pasted) || newIndexNowKey();
}

/** The message shown when a paste is refused, in the style of `setBillingKey`'s. */
export const INDEXNOW_KEY_HELP =
  "An IndexNow key is 8-128 characters of letters, digits and hyphens - it becomes a file " +
  "at the root of the site, so it cannot contain slashes or dots. Leave it blank and " +
  "CiteFleet generates one.";
