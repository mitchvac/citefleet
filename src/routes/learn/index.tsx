import { createFileRoute, Link } from "@tanstack/react-router";
import { LESSONS } from "@/lib/citefleet/course";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/learn/")({ component: LearnPage });

function LearnPage() {
  return (
    <Shell eyebrow="Operator academy" title="CiteFleet training">
      <p className="-mt-6 mb-8 max-w-2xl text-sm leading-6 text-[#b7b0cc]">
        Start with the glossary so GSC, SPA, IndexNow, and the bot names are
        not abstract. Each lesson includes a labeled mock of the real screen,
        then the steps.
      </p>
      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          to="/learn/glossary"
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f]"
        >
          Acronyms and terms
        </Link>
        <Link
          to="/learn/quiz"
          className="rounded-full border border-white/10 px-4 py-2 text-sm"
        >
          Take the test
        </Link>
        <Link to="/" className="rounded-full border border-white/10 px-4 py-2 text-sm">
          Open Command
        </Link>
      </div>
      <ol className="space-y-3">
        {LESSONS.map((lesson) => (
          <li key={lesson.slug}>
            <Link
              to="/learn/$slug"
              params={{ slug: lesson.slug }}
              className="glass flex items-start justify-between gap-4 rounded-3xl p-5 hover:border-white/20"
            >
              <div>
                <p className="mono text-[11px] text-[#e2c36d]">
                  Lesson {lesson.number} · {lesson.where}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{lesson.title}</h2>
                <p className="mt-1 text-sm text-[#b7b0cc]">{lesson.summary}</p>
              </div>
              <span className="shrink-0 text-sm text-[#9b95b3]">Open →</span>
            </Link>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
