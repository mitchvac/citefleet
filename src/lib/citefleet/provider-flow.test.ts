import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WEB_ROOT_CAPTURE,
  capturesOf,
  flowOptions,
  rootlessProviders,
  validateFlow,
  validateFlows,
  type FlowStep,
  type ProviderFlow,
  type RootlessRecord,
} from "./provider-flow.ts";

// A minimal flow that passes every invariant. Each test below breaks exactly one
// thing about it, so a failure names the invariant rather than the fixture.
const discover: FlowStep[] = [
  { kind: "waitFor", selector: "#files", note: "file manager loaded" },
  { kind: "readText", selector: "#path", into: WEB_ROOT_CAPTURE, note: "the real root" },
];

function ready(over: Partial<ProviderFlow> = {}): ProviderFlow {
  return {
    slug: "example",
    name: "Example Host",
    share: 1.5,
    loginUrl: "https://panel.example.com/login",
    loggedIn: { selector: "#dashboard", note: "panel home" },
    discoverRoot: discover,
    upload: [{ kind: "uploadPack", selector: "input[type=file]", note: "the five files" }],
    logout: [{ kind: "click", selector: "#logout", note: "sign out" }],
    status: "ready",
    ...over,
  };
}

const record: RootlessRecord = {
  evidence: "There is no web root.",
  serves: ["/robots.txt"],
  fallback: "Apex DNS TXT proves ownership instead.",
  reopenIf: "The platform serves a customer file at the root.",
  checked: "2026-09-11",
};

/** A provider dropped for having no web root: no steps, no login, full record. */
function noRoot(over: Partial<ProviderFlow> = {}): ProviderFlow {
  return ready({
    status: "no-root",
    blocked: "the merchant never gets a directory",
    loginUrl: "",
    discoverRoot: [],
    upload: [],
    logout: [],
    rootless: record,
    ...over,
  });
}

const problems = (f: ProviderFlow) => validateFlow(f).map((p) => p.problem);

test("a complete ready flow has no problems", () => {
  assert.deepEqual(validateFlow(ready()), []);
});

test("a ready flow that never discovers the web root is refused", () => {
  // The invariant the whole model exists for. Fifteen root conventions across 25
  // providers, and hosts like IONOS and Lolipop! have no fixed root at all — a
  // flow that skips discovery writes into whatever directory the panel opened on.
  const found = problems(ready({ discoverRoot: [{ kind: "waitFor", selector: "#f", note: "n" }] }));
  assert.ok(
    found.some((p) => p.includes(WEB_ROOT_CAPTURE)),
    `expected a webRoot problem, got ${JSON.stringify(found)}`,
  );
});

test("a ready flow with no uploadPack step is refused", () => {
  assert.ok(problems(ready({ upload: [] })).some((p) => p.includes("uploadPack")));
});

test("a ready flow that never logs the customer out is refused", () => {
  assert.ok(problems(ready({ logout: [] })).some((p) => p.includes("log the customer out")));
});

test("an empty selector is caught here, not at run time on the customer's panel", () => {
  const found = problems(ready({ logout: [{ kind: "click", selector: "  ", note: "sign out" }] }));
  assert.ok(found.some((p) => p.includes("empty selector")), JSON.stringify(found));
});

test("a step with no note is refused — an unexplained selector cannot be maintained", () => {
  const found = problems(ready({ logout: [{ kind: "click", selector: "#out", note: "" }] }));
  assert.ok(found.some((p) => p.includes("no note")), JSON.stringify(found));
});

test("a fill that reads a capture nothing produced is refused", () => {
  // Unresolved captures become the empty string at run time, which on a file
  // manager means writing to the wrong directory instead of failing loudly.
  const found = problems(
    ready({
      upload: [
        { kind: "fill", selector: "#path", value: { from: "captured", name: "nope" }, note: "n" },
        { kind: "uploadPack", selector: "input", note: "n" },
      ],
    }),
  );
  assert.ok(found.some((p) => p.includes('capture "nope"')), JSON.stringify(found));
});

test("a fill reading a capture produced earlier in the SAME phase is allowed", () => {
  const found = problems(
    ready({
      upload: [
        { kind: "readText", selector: "#p", into: "dir", note: "n" },
        { kind: "fill", selector: "#path", value: { from: "captured", name: "dir" }, note: "n" },
        { kind: "uploadPack", selector: "input", note: "n" },
      ],
    }),
  );
  assert.deepEqual(found, []);
});

test("a non-https login URL is refused on a ready flow", () => {
  assert.ok(problems(ready({ loginUrl: "http://panel.example.com" })).some((p) => p.includes("https")));
});

test("needs-capture requires a reason and does NOT require steps", () => {
  // This is how a provider whose panel nobody has opened is represented, instead
  // of shipping invented selectors that fail on a customer's machine.
  const flow = ready({ status: "needs-capture", discoverRoot: [], upload: [], logout: [] });
  assert.deepEqual(problems({ ...flow, blocked: "selectors not captured yet" }), []);
  assert.ok(problems(flow).some((p) => p.includes("requires a blocked reason")));
});

test("a complete no-root flow has no problems", () => {
  assert.deepEqual(validateFlow(noRoot()), []);
});

test("a no-root flow must carry no steps and no login URL", () => {
  // Both would invite the installer to try a provider that has nothing to drive.
  assert.ok(problems(noRoot({ logout: [{ kind: "click", selector: "#o", note: "n" }] }))
    .some((p) => p.includes("no steps")));
  assert.ok(problems(noRoot({ loginUrl: "https://panel.example.com/login" }))
    .some((p) => p.includes("must not offer a login")));
});

test("a no-root flow without a rootless record is refused", () => {
  // Keeping the entry is the whole point of not deleting it; an entry with no
  // research attached is a deletion that kept its name.
  const found = problems(noRoot({ rootless: undefined }));
  assert.ok(found.some((p) => p.includes("rootless record")), JSON.stringify(found));
});

test("a rootless record must answer every question the next reader has", () => {
  const missing = (over: Partial<RootlessRecord>, needle: string) => {
    const found = problems(noRoot({ rootless: { ...record, ...over } }));
    assert.ok(found.some((p) => p.includes(needle)), `${needle}: ${JSON.stringify(found)}`);
  };
  missing({ evidence: "  " }, "evidence");
  missing({ fallback: "" }, "fallback");
  missing({ reopenIf: "" }, "reopenIf");
  // A record with no date cannot be re-checked, which is what it exists for.
  missing({ checked: "Sept 2026" }, "ISO date");
  missing({ serves: ["robots.txt"] }, "must be a root path");
});

test("only a no-root flow may carry a rootless record", () => {
  const found = problems(ready({ rootless: record }));
  assert.ok(found.some((p) => p.includes("only a no-root flow")), JSON.stringify(found));
});

test("a ready flow carrying a blocked reason is contradictory and refused", () => {
  assert.ok(problems(ready({ blocked: "why" })).some((p) => p.includes("must not carry")));
});

test("duplicate slugs are caught across the registry", () => {
  const found = validateFlows([ready(), ready()]).map((p) => p.problem);
  assert.ok(found.some((p) => p.includes("appears 2 times")), JSON.stringify(found));
});

test("capturesOf lists readText targets in order", () => {
  assert.deepEqual(capturesOf(discover), [WEB_ROOT_CAPTURE]);
  assert.deepEqual(capturesOf([]), []);
});

test("the dropdown sorts by share and marks unselectable providers", () => {
  const options = flowOptions([
    ready({ slug: "small", name: "Small", share: 0.8 }),
    ready({ slug: "big", name: "Big", share: 5.2 }),
    ready({ slug: "soon", name: "Soon", share: 2.0, status: "needs-capture", blocked: "selectors not captured yet", discoverRoot: [], upload: [], logout: [] }),
  ]);
  assert.deepEqual(
    options.map((o) => o.slug),
    ["big", "soon", "small"],
  );
  assert.deepEqual(
    options.map((o) => o.selectable),
    [true, false, true],
  );
  assert.equal(options[1].blocked, "selectors not captured yet");
});

test("a no-root provider is dropped from the dropdown even at the top share", () => {
  // The failure this prevents: someone picks their host from the list, logs in,
  // and only then learns the installer was never going to work there.
  const flows = [
    ready({ slug: "small", name: "Small", share: 0.8 }),
    noRoot({ slug: "huge", name: "Huge", share: 9.9 }),
  ];
  assert.deepEqual(
    flowOptions(flows).map((o) => o.slug),
    ["small"],
    "a rootless provider must not reach the customer's list",
  );
});

test("a dropped provider keeps its reason and research, ordered by share", () => {
  // Dropped from the list, NOT from the registry — this is the answer to
  // "why isn't my host here?" and the standing re-check list.
  const flows = [
    ready({ slug: "small", name: "Small", share: 0.8 }),
    noRoot({ slug: "big", name: "Big", share: 5.4 }),
    noRoot({ slug: "tiny", name: "Tiny", share: 0.4, blocked: "no directory of any kind" }),
  ];
  const dropped = rootlessProviders(flows);
  assert.deepEqual(dropped.map((d) => d.slug), ["big", "tiny"]);
  assert.equal(dropped[1].reason, "no directory of any kind");
  assert.equal(dropped[0].rootless?.reopenIf, record.reopenIf);
  assert.equal(dropped[0].rootless?.checked, "2026-09-11");
});
