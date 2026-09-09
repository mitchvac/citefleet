import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistTransition, toggleEvidenceLabel } from "./task-state.ts";

const list = (...done: boolean[]) => done.map((d, i) => ({ id: `c${i}`, done: d }));

test("ticking the last open item promotes the task to done", () => {
  const t = checklistTransition(list(true, true, true), "assigned", true);
  assert.deepEqual(t, { changed: true, status: "done", completed: true });
});

test("unticking an item on a DONE task reopens it and clears completedAt", () => {
  // The defect: promotion had no inverse, so a done task kept its DONE pill,
  // its completedAt and full score credit with an open box on screen.
  const t = checklistTransition(list(true, false, true), "done", true);
  assert.deepEqual(t, { changed: true, status: "assigned", completed: false });
});

test("a toggle that changes nothing records nothing and moves nothing", () => {
  const t = checklistTransition(list(true, true), "done", false);
  assert.deepEqual(t, { changed: false, status: null, completed: null });
});

test("ticking a middle item on a partly-open task leaves the status alone", () => {
  const t = checklistTransition(list(true, false), "assigned", true);
  assert.deepEqual(t, { changed: true, status: null, completed: null });
});

test("an already-done task with every box ticked is not re-promoted", () => {
  const t = checklistTransition(list(true, true), "done", true);
  assert.equal(t.status, null);
  assert.equal(t.completed, null);
});

test("a blocked task is not reopened to assigned by this rule", () => {
  // Only a task that reached `done` is walked back here; blocked keeps its
  // reason until something else clears it.
  const t = checklistTransition(list(true, false), "blocked", true);
  assert.equal(t.status, null);
});

test("an empty checklist never counts as done", () => {
  const t = checklistTransition([], "assigned", true);
  assert.equal(t.status, null);
});

test("the evidence label says plainly that nothing was checked", () => {
  // The card showed five ticked boxes above "Latest evidence: Grok assigned
  // VESPER" — a dispatch record, not proof of any third-party claim. The label
  // has to admit what a tick is.
  assert.match(toggleEvidenceLabel(true), /no automated check/i);
  assert.match(toggleEvidenceLabel(false), /reopened/i);
});
