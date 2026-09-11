import { useEffect, useId, useRef, useState } from "react";
import { flowOptions } from "@/lib/citefleet/provider-flow";
import { PROVIDER_FLOWS } from "@/lib/citefleet/provider-flows";

/**
 * The hosting-provider dropdown, in the app's glass theme rather than the OS
 * <select> (which renders as a white system list over the dark console — the
 * same reason AssetPicker exists on /topup).
 *
 * The list comes from `flowOptions`, which has ALREADY dropped every provider
 * with no web root. That is the point: a provider the installer can never drive
 * must not be offered, because the failure it prevents is someone picking their
 * host, logging in, and only then finding out. The dropped five are explained
 * separately by the panel — never as a disabled row someone can try to click.
 *
 * Accessible listbox, matching AssetPicker's contract: the trigger reports
 * aria-expanded / aria-controls, options carry role="option" + aria-selected,
 * arrows move, Enter/Space pick, Escape closes, clicking outside closes, and
 * focus stays on the trigger.
 */
const OPTIONS = flowOptions(PROVIDER_FLOWS);

export function ProviderPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() =>
    Math.max(0, OPTIONS.findIndex((o) => o.slug === value)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = OPTIONS.find((o) => o.slug === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(slug: string) {
    onChange(slug);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(OPTIONS.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(OPTIONS.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(OPTIONS[active].slug);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-testid="provider-trigger"
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm disabled:opacity-50"
      >
        <span className={current ? "text-[#eee9ff]" : "text-[#9b95b3]"}>
          {current ? current.name : "Choose the host this site runs on"}
        </span>
        <span className="text-xs text-[#9b95b3]">
          {current ? `${current.share}% of the web` : `${OPTIONS.length} providers`}
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Hosting provider"
          data-testid="provider-list"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-[#141126] p-1 shadow-2xl"
        >
          {OPTIONS.map((o, i) => (
            <li
              key={o.slug}
              role="option"
              aria-selected={o.slug === value}
              data-testid={`provider-option-${o.slug}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.slug)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${
                i === active ? "bg-white/10" : ""
              } ${o.slug === value ? "text-[#4ee0c3]" : "text-[#cfc8e8]"}`}
            >
              <span>{o.name}</span>
              <span className="text-xs text-[#9b95b3]">{o.share}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
