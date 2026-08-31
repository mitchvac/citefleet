import { createFileRoute, Link } from "@tanstack/react-router";
import { GLOSSARY } from "@/lib/citefleet/glossary";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/learn/glossary")({ component: GlossaryPage });

function GlossaryPage() {
  return (
    <Shell eyebrow="Words used in CiteFleet" title="Acronyms and terms">
      <p className="-mt-6 mb-8 max-w-2xl text-sm text-[#b7b0cc]">
        Read this once before the test. Every lesson assumes these definitions.
      </p>
      <div className="mb-6">
        <Link to="/learn" className="text-sm text-[#9b95b3] hover:text-white">
          ← Course home
        </Link>
      </div>
      <dl className="space-y-3">
        {GLOSSARY.map((item) => (
          <div key={item.id} className="glass rounded-3xl p-5">
            <dt className="text-lg font-semibold">
              {item.term}
              {item.standsFor && (
                <span className="ml-2 text-sm font-normal text-[#e2c36d]">
                  {item.standsFor}
                </span>
              )}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-[#cfc8e8]">{item.meaning}</dd>
          </div>
        ))}
      </dl>
    </Shell>
  );
}
