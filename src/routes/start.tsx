import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/start")({ component: StartPage });

/**
 * What a new customer sees first: the three things that have to happen, in the
 * order they have to happen, with the door for each one.
 *
 * Public on purpose. Someone deciding whether to sign up needs to see what the
 * work actually is before they have an account, and steps 1 and 2 happen off
 * this site anyway.
 */
const STEPS = [
  {
    n: 1,
    title: "Get an API key from BotCentral",
    body: "BotCentral is the bot-search catalog your site gets listed in. The key is what lets CiteFleet publish your listing and read back whether it is still proven.",
    action: { label: "Open botcentral.org", href: "https://botcentral.org", external: true },
    note: "Keys start with bc_live_. Keep it somewhere you can paste from — the next step needs it.",
  },
  {
    n: 2,
    title: "Add credit to the key",
    body: "The key holds a balance and each catalog call draws it down. Adding credit here brings you straight back to CiteFleet with the key in the link, so there is nothing to copy twice.",
    action: { label: "Add credit", to: "/topup" as const },
    note: "Minimum top-up is $5. Payment is on-chain; most rails confirm on their own, and the page tells you which need a person.",
  },
  {
    n: 3,
    title: "Work the training module to get listed",
    body: "Training walks the same order the real campaign runs in: prove you own the origin, publish the files bots read, then list on BotCentral. Follow it once and the site is indexed.",
    action: { label: "Open Training", to: "/learn" as const },
    note: "Ends with a short quiz. Nothing in it is theoretical — every step is a button you will press for real.",
  },
] as const;

function StartPage() {
  return (
    <Shell eyebrow="Getting started" title="Three steps to get your site indexed by bots">
      <p className="mb-6 max-w-2xl text-[#b7b0cc]">
        Search engines and AI assistants only cite what they can find and verify.
        These three steps take a site from invisible to listed, proven, and
        citable. Do them in order — each one needs the one before it.
      </p>

      {/* What BotCentral is, in the customer's words rather than the spec's.
          Step 1 sends them there, so it has to mean something first. */}
      <section className="glass mb-8 rounded-3xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Find the web before you crawl it.</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#b7b0cc]">
          BotCentral is an owner-proven discovery registry for AI agents. Search
          verified websites, understand retrieval/training/action consent, and
          discover machine-readable resources before crawling the open web.
        </p>
        <p className="mt-3 max-w-2xl text-xs text-[#9b95b3]">
          CiteFleet is the publisher side: it proves you own the origin and
          publishes your card. BotCentral is the neutral registry bots query. The
          card format is specified in{" "}
          <a
            href="https://datatracker.ietf.org/doc/draft-mitchell-botcentral-card/"
            target="_blank"
            rel="noreferrer"
            className="mono underline"
          >
            draft-mitchell-botcentral-card-00
          </a>
          , an active IETF Internet-Draft.
        </p>
      </section>

      <ol className="space-y-4">
        {STEPS.map((step) => (
          <li key={step.n} className="glass rounded-3xl p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6d4aff] to-[#4ee0c3] text-base font-semibold text-[#07060f]"
              >
                {step.n}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-white">
                  <span className="sr-only">Step {step.n}: </span>
                  {step.title}
                </h2>
                <p className="mt-2 text-sm text-[#b7b0cc]">{step.body}</p>
                <p className="mt-2 text-xs text-[#9b95b3]">{step.note}</p>
                <div className="mt-4">
                  {"to" in step.action ? (
                    <Link
                      to={step.action.to}
                      className="inline-block rounded-full bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2 text-sm font-semibold text-[#07060f] no-underline"
                    >
                      {step.action.label}
                    </Link>
                  ) : (
                    <a
                      href={step.action.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block rounded-full border border-[#4ee0c3]/40 px-4 py-2 text-sm font-semibold text-[#4ee0c3] no-underline hover:bg-[#4ee0c3]/10"
                    >
                      {step.action.label} ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="glass mt-6 rounded-3xl p-5 sm:p-6">
        <h2 className="text-sm font-semibold">Already have a key?</h2>
        <p className="mt-2 text-sm text-[#9b95b3]">
          Skip to the command center and onboard the property directly.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-[#cfc8e8] no-underline hover:bg-white/5"
          >
            Command center
          </Link>
          <Link
            to="/login"
            className="rounded-full border border-white/10 px-4 py-2 text-sm text-[#cfc8e8] no-underline hover:bg-white/5"
          >
            Sign in
          </Link>
        </div>
      </div>
    </Shell>
  );
}
