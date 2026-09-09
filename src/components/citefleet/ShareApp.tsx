import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { shareApp, shareTarget, type ShareOutcome } from "@/lib/citefleet/share-app";

/**
 * The header's "Share app" button. Native share sheet where the browser has
 * one, the link on the clipboard where it does not, and a prompt holding the
 * link when the clipboard is blocked too — so the click always ends with the
 * person able to pass CiteFleet on. The payload and the branching live in
 * `share-app.ts`; this file only opens the browser doors.
 */
export function ShareApp() {
  const [state, setState] = useState<"idle" | "busy" | ShareOutcome>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onClick() {
    if (state === "busy") return;
    setState("busy");
    const target = shareTarget(window.location.origin);
    const nav = navigator;
    const outcome = await shareApp(target, {
      share: typeof nav.share === "function" ? (d) => nav.share(d) : null,
      copy:
        nav.clipboard && typeof nav.clipboard.writeText === "function"
          ? (t) => nav.clipboard.writeText(t)
          : null,
    });
    if (outcome === "unavailable") {
      // Insecure context or a denied clipboard: hand the link over in the one
      // dialog every browser still has, pre-selected for a manual copy.
      window.prompt("Copy this link to share CiteFleet", target.url);
      setState("idle");
      return;
    }
    setState(outcome);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  }

  const label = state === "copied" ? "Link copied" : "Share app";
  // The text is the accessible name at every width (sr-only), and it is DRAWN
  // only where the header has room for it. Measured 2026-09-07 against a
  // baseline of zero overflow on every route: with the label always drawn the
  // header ran 9px over at 320px, and 41px over at 1024px, which is exactly
  // where the desktop nav's ten pills appear beside it. From xl (1280px) the
  // row has slack again. Every phone from 360px up (390 measured) has room for
  // it, because below lg only the scrolling nav row sits under the header.
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      title="Share CiteFleet"
      data-testid="share-app"
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 px-3 py-1 text-xs text-[#cfc8e8] hover:bg-white/5"
    >
      <Share2 className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
      <span aria-hidden className="hidden min-[360px]:inline lg:hidden xl:inline">
        {label}
      </span>
    </button>
  );
}
