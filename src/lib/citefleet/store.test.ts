import assert from "node:assert/strict";
import { test } from "node:test";
import { recalcScores } from "./store.ts";
import { PLAYBOOK, SCORED_PLAYBOOK_IDS, scoredTasks } from "./playbook.ts";
import type { PlaybookId, Site, StoreShape, Task, TaskStatus } from "./types.ts";

// Regression cases for the 2026-09-05 scoring audit (CF-1, CF-2, CF-4).
// Each `assert` below failed against the code as it stood before that change.

const site = (): Site =>
  ({
    id: "s1",
    workspaceId: "w1",
    name: "WflowProcess",
    domain: "wflowprocess.app",
    url: "https://wflowprocess.app/",
    summary: "",
    status: "campaign",
    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
    routes: ["/"],
    engines: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  }) as unknown as Site;

const task = (playbookId: PlaybookId, status: TaskStatus): Task => ({
  id: `t-${playbookId}`,
  siteId: "s1",
  playbookId,
  title: playbookId,
  description: "",
  status,
  priority: 3,
  checklist: [],
  evidence: [],
  updatedAt: "2026-09-01T00:00:00Z",
});

const storeWith = (tasks: Task[]): StoreShape =>
  ({ sites: [site()], tasks, bots: [], activity: [] }) as unknown as StoreShape;

const scoreOf = (tasks: Task[]) => {
  const store = storeWith(tasks);
  recalcScores(store, "s1");
  return store.sites[0];
};

const TECHNICAL: PlaybookId[] = ["spa_fallback", "robots_ai", "sitemap", "app_health"];
const SUBMISSIONS: PlaybookId[] = [
  "gsc_submit",
  "bing_webmaster",
  "indexnow",
  "botcentral_list",
];
const MENTIONS: PlaybookId[] = ["x_mentions", "directories", "press"];

test("CF-1: blocked work earns no credit — it is stalled, not in flight", () => {
  // The reported defect: three blocked mention tasks and zero done reported 45.
  const blocked = scoreOf(MENTIONS.map((id) => task(id, "blocked")));
  assert.equal(blocked.scores.mentions, 0);

  // Positive control — the identical shape with a status that IS in flight must
  // still pay 45, or this test would pass for the wrong reason.
  const running = scoreOf(MENTIONS.map((id) => task(id, "running")));
  assert.equal(running.scores.mentions, 45);

  // ...and completed work still pays in full.
  const done = scoreOf(MENTIONS.map((id) => task(id, "done")));
  assert.equal(done.scores.mentions, 100);
});

test("CF-1: a mix of done and blocked counts only the done half", () => {
  const s = scoreOf([
    task("x_mentions", "done"),
    task("directories", "blocked"),
    task("press", "blocked"),
  ]);
  assert.equal(s.scores.mentions, 33);
});

test("CF-2: every playbook id is either scored or deliberately excluded", () => {
  const ids = PLAYBOOK.map((p) => p.id);
  assert.equal(ids.length, 12);
  // `monitor` is the recurring watch: scored by nothing, and so excluded from
  // the completion denominator too. If a new playbook id lands, this fails until
  // someone decides which side it belongs on.
  const unscored = ids.filter((id) => !SCORED_PLAYBOOK_IDS.includes(id));
  assert.deepEqual(unscored, ["monitor"]);
  assert.equal(SCORED_PLAYBOOK_IDS.length, 11);
});

test("CF-2: the card denominator counts exactly what the scores average", () => {
  const all = PLAYBOOK.map((p) => task(p.id, "done"));
  assert.equal(all.length, 12);
  // The denominator the card renders...
  assert.equal(scoredTasks(all).length, 11);
  // ...and the tasks the three scores actually read.
  const scoredIds = new Set(scoredTasks(all).map((t) => t.playbookId));
  for (const id of [...TECHNICAL, ...SUBMISSIONS, ...MENTIONS]) {
    assert.ok(scoredIds.has(id), `${id} feeds a score but is not in the total`);
  }
  assert.ok(!scoredIds.has("monitor"));
});

test("CF-2: finishing monitor moves no score (it is not in a bucket)", () => {
  const base = [...TECHNICAL, ...SUBMISSIONS, ...MENTIONS].map((id) =>
    task(id, "queued"),
  );
  const without = scoreOf([...base, task("monitor", "queued")]).scores;
  const with_ = scoreOf([...base, task("monitor", "done")]).scores;
  assert.deepEqual(with_, without);
});

test("CF-4: 'waiting' is no longer reachable on blocked credit", () => {
  // The exact shape that promoted a site to `waiting` before CF-1: five tasks
  // done, six blocked. It scored technical 86 / submissions 73 and read as
  // "done bar the wait" while six things needed a person.
  const s = scoreOf([
    task("spa_fallback", "done"),
    task("robots_ai", "done"),
    task("sitemap", "done"),
    task("app_health", "blocked"),
    task("gsc_submit", "done"),
    task("bing_webmaster", "done"),
    task("indexnow", "blocked"),
    task("botcentral_list", "blocked"),
    ...MENTIONS.map((id) => task(id, "blocked")),
    task("monitor", "queued"),
  ]);
  assert.equal(s.scores.technical, 75);
  assert.equal(s.scores.submissions, 50);
  assert.equal(s.status, "campaign");
});

test("CF-4: no amount of in-flight work alone reaches the waiting thresholds", () => {
  // Partial credit caps at 45, below both gates (technical 80, submissions 70),
  // so `waiting` now requires tasks to have actually finished.
  const s = scoreOf(
    [...TECHNICAL, ...SUBMISSIONS].map((id) => task(id, "running")),
  );
  assert.equal(s.scores.technical, 45);
  assert.equal(s.scores.submissions, 45);
  assert.equal(s.status, "campaign");
});

test("waiting is still reachable when the work is genuinely done", () => {
  // Positive control for the two CF-4 cases above: the threshold still works.
  const s = scoreOf([
    ...TECHNICAL.map((id) => task(id, "done")),
    task("gsc_submit", "done"),
    task("bing_webmaster", "done"),
    task("indexnow", "done"),
    task("botcentral_list", "blocked"),
    ...MENTIONS.map((id) => task(id, "queued")),
    task("monitor", "queued"),
  ]);
  assert.equal(s.scores.technical, 100);
  assert.equal(s.scores.submissions, 75);
  assert.equal(s.status, "waiting");
});
