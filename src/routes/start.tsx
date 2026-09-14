import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Shell } from "@/components/citefleet/Shell";
import { onboardProperty } from "@/lib/citefleet/fleet-api";

export const Route = createFileRoute("/start")({ component: StartPage });

/**
 * What a new customer sees first: the things that have to happen, in the
 * order they have to happen, with the door for each one.
 *
 * Public on purpose. Someone deciding whether to sign up needs to see what the
 * work actually is before they have an account. Submitting the first step is
 * authenticated and lands directly on the property's DNS connection panel.
 */
const STEPS = [
  {
    n: 2,
    title: "Create a BotCentral API key",
    body: "BotCentral is the bot-search catalog your site gets listed in. The key is what lets CiteFleet publish your listing and read back whether it is still proven.",
    action: { label: "Open BotCentral Keys", href: "https://botcentral.org/keys", external: true },
    note: "Keys start with bc_live_. Keep it somewhere you can paste from — the next step needs it.",
  },
  {
    n: 3,
    title: "Add credit to the key",
    body: "Use Top up beside the key on BotCentral. That link carries the exact key prefix into CiteFleet, and the invoice records the key before showing payment instructions.",
    action: { label: "Choose a key", href: "https://botcentral.org/keys", external: true },
    note: "Minimum top-up is $5. Payment is on-chain; most rails confirm on their own, and the page tells you which need a person.",
  },
  {
    n: 4,
    title: "Work the training module to get listed",
    body: "Training walks the same order the real campaign runs in: prove you own the origin, publish the files bots read, then list on BotCentral. Follow it once and the site is indexed.",
    action: { label: "Open Training", to: "/learn" as const },
    note: "Ends with a short quiz. Nothing in it is theoretical — every step is a button you will press for real.",
  },
] as const;

function StartPage() {
  const navigate = useNavigate({ from: "/start" });
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onboard(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const raw = domain.trim();
      const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname)
        throw new Error("Enter a website domain.");
      const result = await onboardProperty({
        data: { name: name.trim() || parsed.hostname, url: parsed.origin },
      });
      await navigate({ to: "/sites/$id", params: { id: result.id } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not add this property.";
      if (message.startsWith("Unauthorized")) {
        window.location.assign("/login");
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell eyebrow="Getting started" title="Get your site indexed by bots">
      <p className="mb-6 max-w-2xl text-[#b7b0cc]">
        Search engines and AI assistants only cite what they can find and verify. Add the property,
        connect its DNS, then these three steps take the site from invisible to listed and citable.
        Do them in order; each one needs the one before it.
      </p>

      <section className="glass mb-8 rounded-3xl p-5 sm:p-6" data-testid="start-onboard-form">
        <h2 className="text-lg font-semibold text-white">1. Add your property and connect DNS</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#b7b0cc]">
          Enter the customer&apos;s domain. CiteFleet creates its unique proof record, detects the
          authoritative DNS provider, and opens the connection screen.
        </p>
        <form
          onSubmit={onboard}
          className="mt-5 grid max-w-3xl gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto] sm:items-end"
        >
          <label className="min-w-0 text-sm text-[#cfc8e8]">
            Property name (optional)
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Customer website"
              autoComplete="organization"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#9b7dff]"
            />
          </label>
          <label className="min-w-0 flex-1 text-sm text-[#cfc8e8]">
            Website domain
            <input
              name="domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="example.com"
              required
              inputMode="url"
              autoComplete="url"
              className="mono mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#9b7dff]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !domain.trim()}
            className="btn-light min-h-11 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Adding property…" : "Add property and connect DNS"}
          </button>
        </form>
        {error ? (
          <p className="mt-3 text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {/* What BotCentral is, in the customer's words rather than the spec's.
          Step 1 sends them there, so it has to mean something first. */}
      <section className="glass mb-8 rounded-3xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Find the web before you crawl it.</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#b7b0cc]">
          BotCentral is an owner-proven discovery registry for AI agents. Search verified websites,
          understand retrieval/training/action consent, and discover machine-readable resources
          before crawling the open web.
        </p>
        <p className="mt-3 max-w-2xl text-xs text-[#9b95b3]">
          CiteFleet is the publisher side: it proves you own the origin and publishes your card.
          BotCentral is the neutral registry bots query. The card format is specified in{" "}
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
