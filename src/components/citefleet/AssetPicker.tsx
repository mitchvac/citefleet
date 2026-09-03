import { useEffect, useId, useRef, useState } from "react";
import { TOPUP_ASSETS, type TopupAsset } from "@/lib/citefleet/topup";

/**
 * "Pay with" picker for /topup, in the app's glass theme instead of the OS-native
 * <select> menu (which rendered as a white system list over the dark console).
 *
 * Accessible listbox: the trigger reports aria-expanded / aria-controls, the
 * options carry role="option" + aria-selected, arrows move, Enter/Space pick,
 * Escape closes, clicking outside closes, focus stays on the trigger. A hidden
 * input keeps `name="asset"` on the form so the field still posts natively.
 */
const NETWORK_TONE: Record<TopupAsset, string> = {
  rlusd: "from-[#6d4aff] to-[#4ee0c3]",
  xrp: "from-[#4ee0c3] to-[#6d4aff]",
  xlm: "from-[#9b7dff] to-[#cbb8ff]",
  btc: "from-[#e2c36d] to-[#f4a259]",
  hbar: "from-[#cfc8e8] to-[#9b95b3]",
  xdc: "from-[#4ee0c3] to-[#e2c36d]",
};

function split(label: string): { ticker: string; network: string } {
  const [ticker, network = ""] = label.split(" · ");
  return { ticker, network };
}

export function AssetPicker({
  value,
  onChange,
  name = "asset",
}: {
  value: TopupAsset;
  onChange: (next: TopupAsset) => void;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, TOPUP_ASSETS.findIndex((a) => a.id === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = TOPUP_ASSETS.find((a) => a.id === value) ?? TOPUP_ASSETS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(i: number) {
    onChange(TOPUP_ASSETS[i].id);
    setActive(i);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + dir + TOPUP_ASSETS.length) % TOPUP_ASSETS.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) pick(active);
      else setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActive(TOPUP_ASSETS.length - 1);
    }
  }

  const cur = split(current.label);
  return (
    <div ref={rootRef} className="relative" data-testid="asset-picker">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white hover:border-white/20 focus:border-[#9b7dff] focus:outline-none"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`mono inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-semibold text-[#07060f] ${NETWORK_TONE[current.id]}`}
          >
            {cur.ticker.slice(0, 3)}
          </span>
          <span className="mono">{cur.ticker}</span>
          <span className="text-[#9b95b3]">{cur.network}</span>
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-[#9b95b3] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Pay with"
          aria-activedescendant={`${listId}-${TOPUP_ASSETS[active].id}`}
          className="glass absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-2xl p-1.5"
          // .glass is 72% alpha so page text bleeds through a floating menu; a menu must read as a solid surface.
          // (.glass is an unlayered rule, so a Tailwind bg-* utility would not override it.)
          style={{ background: "rgba(14, 12, 26, 0.97)" }}
        >
          {TOPUP_ASSETS.map((a, i) => {
            const { ticker, network } = split(a.label);
            const selected = a.id === value;
            const highlighted = i === active;
            return (
              <li
                key={a.id}
                id={`${listId}-${a.id}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${
                  highlighted ? "bg-white/8" : ""
                } ${selected ? "text-white" : "text-[#d9d3ee]"}`}
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`mono inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-semibold text-[#07060f] ${NETWORK_TONE[a.id]}`}
                  >
                    {ticker.slice(0, 3)}
                  </span>
                  <span className="mono">{ticker}</span>
                  <span className="text-[#9b95b3]">{network}</span>
                </span>
                {selected && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-[#4ee0c3]" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
