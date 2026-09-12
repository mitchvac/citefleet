import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/about", label: "About" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-[#9b95b3] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>CiteFleet indexing operations</p>
        <nav aria-label="Company and legal" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((item) => (
            <Link key={item.to} to={item.to} className="hover:text-white hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
