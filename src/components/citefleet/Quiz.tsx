import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PASS_SCORE, QUIZ } from "@/lib/citefleet/course";

export function Quiz() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = useMemo(
    () => QUIZ.filter((q) => answers[q.id] === q.answer).length,
    [answers],
  );
  const passed = score >= PASS_SCORE;

  return (
    <div className="space-y-6">
      {QUIZ.map((q, idx) => {
        const picked = answers[q.id];
        const show = submitted;
        return (
          <article key={q.id} className="glass rounded-3xl p-5">
            <p className="mono text-[11px] text-[#e2c36d]">Question {idx + 1}</p>
            <h2 className="mt-2 text-lg font-semibold">{q.prompt}</h2>
            <ul className="mt-4 space-y-2">
              {q.choices.map((choice, i) => {
                const selected = picked === i;
                let cls = "border-white/10 hover:bg-white/5";
                if (show && i === q.answer) cls = "border-emerald-400/40 bg-emerald-400/10";
                else if (show && selected && i !== q.answer)
                  cls = "border-rose-400/40 bg-rose-400/10";
                else if (selected) cls = "border-[#9b7dff]/50 bg-[#9b7dff]/10";
                return (
                  <li key={choice}>
                    <button
                      type="button"
                      disabled={submitted}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: i }))}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm ${cls}`}
                    >
                      {choice}
                    </button>
                  </li>
                );
              })}
            </ul>
            {show && (
              <p className="mt-3 text-sm text-[#b7b0cc]">{q.explain}</p>
            )}
          </article>
        );
      })}

      {!submitted ? (
        <button
          className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#07060f] disabled:opacity-40"
          disabled={Object.keys(answers).length !== QUIZ.length}
          onClick={() => setSubmitted(true)}
        >
          Score test
        </button>
      ) : (
        <div className="glass rounded-3xl p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#9b95b3]">
            Result
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {score}/{QUIZ.length} {passed ? "— passed" : "— review the lessons"}
          </p>
          <p className="mt-2 text-sm text-[#b7b0cc]">
            Pass mark is {PASS_SCORE}/{QUIZ.length}. Wrong answers stay highlighted with
            the explanation underneath.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-sm"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
              }}
            >
              Retry
            </button>
            <Link to="/learn" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f]">
              Back to course
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
