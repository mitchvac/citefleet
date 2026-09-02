import { createFileRoute } from "@tanstack/react-router";
import { PLAYBOOK, specLabel } from "@/lib/citefleet/playbook";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/playbook")({ component: PlaybookPage });

function PlaybookPage() {
  return (
    <Shell eyebrow="Versioned runbook" title="Indexing playbook">
      <p className="-mt-6 mb-8 max-w-3xl text-sm leading-6 text-[#b7b0cc]">
        The versioned runbook every property follows. Technical doors first,
        then submissions, then the mention layer that AI assistants actually
        quote. Links resolve to the real origin on each campaign board.
      </p>
      <div className="space-y-4">
        {PLAYBOOK.map((step) => (
          <article key={step.id} className="glass rounded-3xl p-6">
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[#9b95b3]">
              <span className="mono text-[#e2c36d]">{step.botCallsign}</span>
              <span>P{step.priority}</span>
              <span>{step.engines.join(" · ")}</span>
            </div>
            <h2 className="text-xl font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-[#cfc8e8]">{step.description}</p>
            <ul className="mt-4 grid gap-1 text-sm text-[#b7b0cc] md:grid-cols-2">
              {step.checklist.map((item) => {
                const label = specLabel(item);
                const raw = typeof item === "string" ? undefined : item.href;
                // Origin-relative links only make sense on a property's campaign board.
                const href = raw && !/\{origin\}|\{domain\}/.test(raw) ? raw : undefined;
                return (
                  <li key={label}>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#c4b5fd] underline decoration-white/20 underline-offset-2 hover:text-white"
                      >
                        {label} ↗
                      </a>
                    ) : (
                      <>• {label}</>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-[#9b95b3]">{step.operatorHint}</p>
          </article>
        ))}
      </div>
    </Shell>
  );
}
