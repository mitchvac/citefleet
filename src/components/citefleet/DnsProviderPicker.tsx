import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DNS_PROVIDERS } from "@/lib/citefleet/dns-providers";

export function DnsProviderPicker({
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
    Math.max(
      0,
      DNS_PROVIDERS.findIndex((provider) => provider.slug === value),
    ),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = DNS_PROVIDERS.find((provider) => provider.slug === value);

  useEffect(() => {
    const index = DNS_PROVIDERS.findIndex((provider) => provider.slug === value);
    if (index >= 0) setActive(index);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(index: number) {
    onChange(DNS_PROVIDERS[index].slug);
    setActive(index);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + direction + DNS_PROVIDERS.length) % DNS_PROVIDERS.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) pick(active);
      else setOpen(true);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActive(DNS_PROVIDERS.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="relative" data-testid="dns-provider-picker">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => !disabled && setOpen((value) => !value)}
        onKeyDown={onKeyDown}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm hover:border-white/20 focus:border-[#9b7dff] focus:outline-none disabled:opacity-50"
      >
        <span className={current ? "text-[#eee9ff]" : "text-[#9b95b3]"}>
          {current?.name ?? "Choose the account that manages DNS"}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-[#9b95b3]">
          {current
            ? current.marketShare !== null
              ? `${current.marketShare}%`
              : null
            : `${DNS_PROVIDERS.length} providers`}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="DNS provider"
          aria-activedescendant={`${listId}-${DNS_PROVIDERS[active].slug}`}
          className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-lg border border-white/10 p-1 shadow-2xl"
          style={{ background: "rgba(14, 12, 26, 0.98)" }}
        >
          {DNS_PROVIDERS.map((provider, index) => {
            const selected = provider.slug === value;
            return (
              <li
                key={provider.slug}
                id={`${listId}-${provider.slug}`}
                role="option"
                aria-selected={selected}
                data-testid={`dns-provider-option-${provider.slug}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(index)}
                className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
                  active === index ? "bg-white/10" : ""
                } ${selected ? "text-[#4ee0c3]" : "text-[#cfc8e8]"}`}
              >
                <span>{provider.name}</span>
                <span className="flex items-center gap-2 text-xs text-[#9b95b3]">
                  {provider.marketShare !== null ? `${provider.marketShare}%` : null}
                  {selected ? (
                    <Check aria-hidden="true" className="h-4 w-4 text-[#4ee0c3]" />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
