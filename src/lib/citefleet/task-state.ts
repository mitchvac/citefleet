// Browser-safe. The ONE rule for what a checklist toggle does to a task.
//
// Two defects lived here, both found on 2026-09-09 on a real DONE card:
//
// 1. Promotion was one-way. `patchTask` promoted a task to `done` once every
//    box was ticked, and had no inverse — so unticking an item on a done task
//    left it DONE with an open box and a `completedAt` that no longer described
//    anything, while `recalcScores` (which counts `status === "done"`) kept
//    paying full credit for it.
//
// 2. A tick left no trace. Ticking "Trustpilot business claimed" is a CLAIM
//    that work happened at a third party; nothing recorded who claimed it or
//    when. The card then rendered "Latest evidence: Grok assigned VESPER" —
//    an unrelated dispatch record — directly beneath five ticked boxes and a
//    DONE pill, which reads as though that evidence supported the completion.
//    It never did. The evidence line is written by the caller now; this module
//    decides the state, and the two are kept next to each other on purpose.

export type ChecklistLike = { id: string; done: boolean };

export type TaskTransition = {
  /** Whether the item actually moved. A no-op toggle records nothing. */
  changed: boolean;
  /** The status the task should now hold, or null to leave it alone. */
  status: "done" | "assigned" | null;
  /** true → set completedAt, false → clear it, null → leave it. */
  completed: boolean | null;
};

/**
 * Decide the task's next state from the checklist as it will be AFTER the
 * toggle is applied.
 *
 * `currentStatus` is the status before the toggle. `blocked` and `running` are
 * deliberately not reopened to `assigned` by this rule — only a task that
 * reached `done` can be walked back by unticking, and a blocked task keeps its
 * reason until something else clears it.
 */
export function checklistTransition(
  checklistAfter: readonly ChecklistLike[],
  currentStatus: string,
  changed: boolean,
): TaskTransition {
  if (!changed) return { changed: false, status: null, completed: null };

  const allDone = checklistAfter.length > 0 && checklistAfter.every((c) => c.done);
  if (allDone && currentStatus !== "done") {
    return { changed: true, status: "done", completed: true };
  }
  if (!allDone && currentStatus === "done") {
    return { changed: true, status: "assigned", completed: false };
  }
  return { changed: true, status: null, completed: null };
}

/** The evidence label for a toggle. Says plainly that nothing was checked. */
export function toggleEvidenceLabel(done: boolean): string {
  return done
    ? "Operator marked complete (no automated check)"
    : "Operator reopened this check";
}
