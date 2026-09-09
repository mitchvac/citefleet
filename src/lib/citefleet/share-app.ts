/**
 * The "Share app" control's browser-safe half: WHAT is shared and HOW the
 * outcome is decided. Pure — no DOM, no globals — so `node --test` covers every
 * branch, and the component (`ShareApp.tsx`) only wires the browser doors in.
 *
 * On a phone the native share sheet (Web Share API) is the only route into
 * Messages / WhatsApp / Instagram, which have no public web-intent URL. Where
 * the sheet is absent (most desktop browsers) the link is copied instead, so
 * the button never silently does nothing. A dismissed sheet is left alone: the
 * person closed it on purpose, and copying behind their back would be a
 * surprise, not a fallback.
 */

export const SHARE_TITLE = "CiteFleet";

/** Every claim here is true of the product; keep it that way when editing. */
export const SHARE_TEXT =
  "CiteFleet gets a website indexed by search engines and cited by AI assistants: prove the origin, publish the files bots read, list it on BotCentral.";

/**
 * The public onboarding page, not the console root: `/` is the operator
 * console and bounces everyone else to /login, which is a dead end for a
 * link someone was just sent. `/start` is public on purpose (see start.tsx).
 */
export const SHARE_PATH = "/start";

/** SSR / opened-from-file fallback; the live origin wins whenever there is one. */
export const FALLBACK_ORIGIN = "https://citefleet.app";

export type ShareTarget = { title: string; text: string; url: string };

/** The payload for this origin — a preview host shares itself, not production. */
export function shareTarget(origin: string): ShareTarget {
  const base = (origin || "").trim().replace(/\/+$/, "") || FALLBACK_ORIGIN;
  return { title: SHARE_TITLE, text: SHARE_TEXT, url: `${base}${SHARE_PATH}` };
}

export type ShareOutcome =
  /** The native sheet took the payload. */
  | "shared"
  /** The person closed the native sheet; nothing else happens. */
  | "dismissed"
  /** No sheet (or it failed) and the link is on the clipboard. */
  | "copied"
  /** Neither door worked; the caller must show the link some other way. */
  | "unavailable";

export type ShareDoors = {
  /** `navigator.share`, or null where the browser has none. */
  share: ((data: ShareTarget) => Promise<void>) | null;
  /** `navigator.clipboard.writeText`, or null where it is missing. */
  copy: ((text: string) => Promise<void>) | null;
};

/** The person dismissed the sheet (spec name), as opposed to the sheet failing. */
function isDismissal(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

export async function shareApp(target: ShareTarget, doors: ShareDoors): Promise<ShareOutcome> {
  if (doors.share) {
    try {
      await doors.share(target);
      return "shared";
    } catch (err) {
      if (isDismissal(err)) return "dismissed";
      // The sheet refused (a gesture rule, a data-type rule, a platform with
      // the API but no targets) — fall through to the link rather than stop.
    }
  }
  if (doors.copy) {
    try {
      await doors.copy(target.url);
      return "copied";
    } catch {
      // Clipboard blocked: insecure context or a denied permission.
    }
  }
  return "unavailable";
}
