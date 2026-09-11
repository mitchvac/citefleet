import { useState } from "react";
import { browserCopyDoors, copyText } from "@/lib/citefleet/clipboard";

/**
 * "Here is a value, copy it" — the pattern that started in PayQr for a payment
 * address and now also carries the DNS proof record and the contents of the five
 * origin files.
 *
 * Lifted out of PayQr.tsx unchanged in appearance, with one behavioural fix: a
 * blocked clipboard used to leave the button reading "Copy" and do nothing at
 * all. For a payment address still legible on screen that was survivable; for a
 * file's contents it is the difference between finishing and being stuck. It now
 * falls through to a prompt (`copyText`), which every browser still has.
 */
export function Copy({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "prompted">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        const outcome = await copyText(value, browserCopyDoors(), `Copy ${label}`);
        if (outcome === "unavailable") return;
        setState(outcome === "copied" ? "copied" : "prompted");
        setTimeout(() => setState("idle"), 1800);
      }}
      className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#cfc8e8] hover:bg-white/5"
      aria-label={`Copy ${label}`}
      data-testid="copy-button"
    >
      {state === "copied" ? "Copied" : state === "prompted" ? "Copy it" : "Copy"}
    </button>
  );
}

export function Row({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 py-2 first:border-t-0">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`${mono ? "mono" : ""} min-w-0 truncate text-sm text-white`} title={value}>
          {value}
        </span>
        <Copy label={label} value={value} />
      </span>
    </div>
  );
}
