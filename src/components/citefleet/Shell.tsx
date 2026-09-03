import { Link } from "@tanstack/react-router";
import { BrandLogo } from "./BrandLogo";

const NAV = [
  { to: "/", label: "Command" },
  { to: "/ops", label: "Monitor" },
  { to: "/fleet", label: "Grok Fleet" },
  { to: "/playbook", label: "Playbook" },
  { to: "/activity", label: "Audit log" },
  { to: "/learn", label: "Training" },
  // Public page: BotCentral's Top up buttons link here, and operators need it to
  // confirm a payment without hunting for the customer's invoice link.
  { to: "/topup", label: "Add credit" },
] as const;

export function Shell({
  children,
  title,
  eyebrow,
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07060f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <BrandLogo size={36} className="h-9 w-9" />
            <span>
              <span className="block text-sm font-semibold tracking-wide">CiteFleet</span>
              <span className="block text-[11px] uppercase tracking-[0.18em] text-[#9b95b3]">
                Enterprise indexing ops
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-full px-3 py-1.5 text-sm text-[#cfc8e8] hover:bg-white/5 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
            <a
              href="https://botcentral.org"
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-3 py-1.5 text-sm text-[#4ee0c3] hover:bg-white/5"
            >
              BotCentral
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <form method="post" action="/api/logout">
              <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#cfc8e8] hover:bg-white/5">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl flex-wrap gap-1 px-6 pb-3 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-full px-3 py-1.5 text-sm text-[#cfc8e8] hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://botcentral.org"
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-3 py-1.5 text-sm text-[#4ee0c3]"
          >
            BotCentral
          </a>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        {(eyebrow || title) && (
          <div className="mb-8">
            {eyebrow && (
              <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[#e2c36d]">
                {eyebrow}
              </p>
            )}
            {title && (
              <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                {title}
              </h1>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "gold" | "violet";
}) {
  const map = {
    neutral: "bg-white/8 text-[#d9d3ee]",
    good: "bg-emerald-400/15 text-emerald-300",
    warn: "bg-amber-400/15 text-amber-200",
    bad: "bg-rose-400/15 text-rose-300",
    gold: "bg-[#e2c36d]/15 text-[#e2c36d]",
    violet: "bg-[#9b7dff]/15 text-[#cbb8ff]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${map[tone]}`}
    >
      {children}
    </span>
  );
}

export function Score({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-[#9b95b3]">
        <span>{label}</span>
        <span className="mono text-white">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3]"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
