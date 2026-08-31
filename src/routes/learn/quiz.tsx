import { createFileRoute } from "@tanstack/react-router";
import { Quiz } from "@/components/citefleet/Quiz";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/learn/quiz")({ component: QuizPage });

function QuizPage() {
  return (
    <Shell eyebrow="Certification check" title="Operator test">
      <p className="-mt-6 mb-8 max-w-2xl text-sm text-[#b7b0cc]">
        Ten questions. Pass is 8/10. Answer every item before you score. Review
        the highlighted explanations if you miss.
      </p>
      <Quiz />
    </Shell>
  );
}
