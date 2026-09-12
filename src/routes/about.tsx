import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About CiteFleet | CiteFleet" },
      {
        name: "description",
        content:
          "Learn how CiteFleet audits websites, prepares origin files, publishes BotCentral listings, and monitors indexing readiness.",
      },
      { property: "og:title", content: "About CiteFleet" },
      {
        property: "og:description",
        content: "An indexing operations workspace for website owners and operators.",
      },
    ],
    links: [{ rel: "canonical", href: "https://citefleet.app/about" }],
  }),
  component: AboutPage,
});

const WORKFLOW = [
  {
    title: "Audit the public origin",
    body: "CiteFleet checks crawl access, discoverable routes, origin files, proof, and search-engine readiness against the live website.",
  },
  {
    title: "Prepare and publish",
    body: "The workspace builds the files and proof needed at the web root, then helps an authorized operator publish them through GitHub or their host.",
  },
  {
    title: "Monitor the result",
    body: "Tasks, audit history, listing state, and coverage stay together so the next action is visible after a deployment or site change.",
  },
] as const;

function AboutPage() {
  return (
    <Shell eyebrow="Company" title="About CiteFleet">
      <article className="max-w-5xl">
        <p className="max-w-3xl text-xl leading-8 text-[#d9d3ee]">
          CiteFleet is an indexing operations workspace for people responsible for a website. It
          turns a crawl, index, proof, and publishing playbook into one traceable workflow.
        </p>

        <section className="mt-12 border-t border-white/10 pt-8" aria-labelledby="workflow-title">
          <h2 id="workflow-title" className="text-2xl font-semibold text-white">
            From website to verifiable listing
          </h2>
          <div className="mt-7 grid gap-8 md:grid-cols-3">
            {WORKFLOW.map((step, index) => (
              <div key={step.title} className="border-t border-white/10 pt-5">
                <p className="mono text-xs text-[#4ee0c3]">0{index + 1}</p>
                <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#b7b0cc]">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-8 border-t border-white/10 pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <h2 className="text-2xl font-semibold text-white">CiteFleet and BotCentral</h2>
          <div className="space-y-4 text-sm leading-6 text-[#b7b0cc]">
            <p>
              CiteFleet prepares and submits a site card when an authorized user chooses to publish.
              BotCentral hosts the public bot-search listing, verifies origin proof, and manages API
              credit used for that service.
            </p>
            <p>
              Grok specialists can help draft and evaluate work inside a campaign when they are
              invoked. The operator remains in control of repository writes, publishing, and payment
              actions.
            </p>
          </div>
        </section>

        <section className="mt-12 grid gap-8 border-t border-white/10 pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <h2 className="text-2xl font-semibold text-white">What the service can promise</h2>
          <div className="space-y-4 text-sm leading-6 text-[#b7b0cc]">
            <p className="flex gap-3">
              <CheckCircle2 aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#4ee0c3]" />
              <span>
                Clear checks, generated origin files, recorded evidence, and visible task state.
              </span>
            </p>
            <p>
              Search engines and answer engines make their own crawl, indexing, ranking, and
              citation decisions. CiteFleet improves readiness and records the work; it cannot
              guarantee those independent outcomes.
            </p>
          </div>
        </section>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-8 sm:flex-row">
          <Link
            to="/start"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#4ee0c3] px-4 py-2.5 text-sm font-semibold text-[#07060f] hover:bg-[#79ead3]"
          >
            Get started
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/5"
          >
            Sign in or create an account
          </Link>
        </div>
      </article>
    </Shell>
  );
}
