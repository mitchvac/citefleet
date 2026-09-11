// Browser-safe. Putting a value on the clipboard, and saying honestly what
// happened — modelled on `share-app.ts`, which already proved this shape.
//
// Why not PayQr's silent catch: there, a failed copy leaves a payment address
// still visible on screen to read by eye. The values this is used for — a DNS
// record and the contents of five files — are the whole deliverable. A customer
// who cannot copy them cannot finish, so "the clipboard refused" must fall
// through to something rather than leaving a button that quietly did nothing.

export type CopyOutcome =
  /** On the clipboard. */
  | "copied"
  /** No clipboard; handed over in a prompt for a manual copy instead. */
  | "prompted"
  /** Neither door worked. The caller must keep the value visible. */
  | "unavailable";

export type CopyDoors = {
  /** `navigator.clipboard.writeText`, or null where it is missing. */
  write: ((text: string) => Promise<void>) | null;
  /** `window.prompt`, the one dialog every browser still has. */
  prompt: ((message: string, value: string) => string | null) | null;
};

export async function copyText(
  text: string,
  doors: CopyDoors,
  promptMessage = "Copy this value",
): Promise<CopyOutcome> {
  if (doors.write) {
    try {
      await doors.write(text);
      return "copied";
    } catch {
      // Insecure context (http://), a denied permission, or a browser that
      // requires a user gesture we are somehow outside of. Fall through.
    }
  }
  if (doors.prompt) {
    doors.prompt(promptMessage, text);
    return "prompted";
  }
  return "unavailable";
}

/** The real browser doors. Kept here so components never touch `navigator` directly. */
export function browserCopyDoors(): CopyDoors {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    write:
      nav?.clipboard && typeof nav.clipboard.writeText === "function"
        ? (t: string) => nav.clipboard.writeText(t)
        : null,
    prompt:
      typeof window !== "undefined" && typeof window.prompt === "function"
        ? (m: string, v: string) => window.prompt(m, v)
        : null,
  };
}
