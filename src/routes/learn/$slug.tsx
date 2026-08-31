import { createFileRoute, Link } from "@tanstack/react-router";
import { LESSONS } from "@/lib/citefleet/course";
import { Shell } from "@/components/citefleet/Shell";
import { LessonMock } from "@/components/citefleet/training/Mocks";

export const Route = createFileRoute("/learn/$slug")({ component: LessonPage });

function LessonPage() {
  const { slug } = Route.useParams();
  const index = LESSONS.findIndex((l) => l.slug === slug);
  const lesson = LESSONS[index];
  if (!lesson) {
    return (
      <Shell title="Lesson not found">
        <Link to="/learn" className="text-sm text-[#9b95b3]">
          ← Course home
        </Link>
      </Shell>
    );
  }
  const prev = LESSONS[index - 1];
  const next = LESSONS[index + 1];

  return (
    <Shell eyebrow={`Lesson ${lesson.number} · ${lesson.where}`} title={lesson.title}>
      <p className="-mt-6 mb-8 max-w-2xl text-sm text-[#b7b0cc]">{lesson.summary}</p>
      <div className="mb-8">
        <LessonMock slug={lesson.slug} />
      </div>
      <div className="space-y-4">
        {lesson.steps.map((step, i) => (
          <article key={step.title} className="glass rounded-3xl p-6">
            <p className="mono text-[11px] text-[#e2c36d]">Step {i + 1}</p>
            <h2 className="mt-2 text-xl font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#cfc8e8]">{step.body}</p>
          </article>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        {prev ? (
          <Link
            to="/learn/$slug"
            params={{ slug: prev.slug }}
            className="text-sm text-[#9b95b3] hover:text-white"
          >
            ← {prev.title}
          </Link>
        ) : (
          <Link to="/learn" className="text-sm text-[#9b95b3] hover:text-white">
            ← Course home
          </Link>
        )}
        {next ? (
          <Link
            to="/learn/$slug"
            params={{ slug: next.slug }}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f]"
          >
            Next: {next.title}
          </Link>
        ) : (
          <Link
            to="/learn/quiz"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f]"
          >
            Take the test
          </Link>
        )}
      </div>
    </Shell>
  );
}
