import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chooseProvider,
  droppedProviderAnswers,
  droppedReason,
  providerGuidance,
} from "./provider-choice.ts";
import { PROVIDER_FLOWS } from "./provider-flows.ts";
import { flowOptions, type ProviderFlow } from "./provider-flow.ts";

const AT = new Date("2026-09-11T12:00:00.000Z");

function flow(over: Partial<ProviderFlow> = {}): ProviderFlow {
  return {
    slug: "example",
    name: "Example Host",
    share: 1.5,
    loginUrl: "https://panel.example.com/login",
    loggedIn: { selector: "#dash", note: "panel home" },
    discoverRoot: [],
    upload: [],
    logout: [],
    status: "needs-capture",
    blocked: "selectors not captured against the live panel yet",
    ...over,
  };
}

test("choosing a listed provider records the slug, the name and when", () => {
  const choice = chooseProvider([flow()], "example", AT);
  assert.deepEqual(choice, {
    slug: "example",
    name: "Example Host",
    chosenAt: "2026-09-11T12:00:00.000Z",
  });
});

test("surrounding whitespace does not make a valid slug unknown", () => {
  assert.equal(chooseProvider([flow()], "  example  ", AT).slug, "example");
});

test("an empty or unknown slug is refused", () => {
  assert.throws(() => chooseProvider([flow()], "   ", AT), /Pick a hosting provider/);
  assert.throws(() => chooseProvider([flow()], "nosuchhost", AT), /No hosting provider "nosuchhost"/);
});

test("a rootless provider is refused with its RECORDED reason, not a generic error", () => {
  // The payoff for keeping the dropped providers: a customer on Squarespace is
  // told what is actually true about Squarespace and what to do instead.
  const squarespace = PROVIDER_FLOWS.find((f) => f.slug === "squarespace")!;
  assert.throws(
    () => chooseProvider(PROVIDER_FLOWS, "squarespace", AT),
    (err: Error) => {
      assert.match(err.message, /no web root/);
      assert.match(err.message, /llms\.txt/, "must name what it CAN still serve");
      assert.match(err.message, /DNS TXT/, "must name the fallback");
      assert.equal(err.message, droppedReason(squarespace));
      return true;
    },
  );
});

test("every dropped provider is refused, and every listed one is accepted", () => {
  // Positive control on both sides: the loop below proves 5 refusals AND 20
  // acceptances, so neither branch can pass by being unreachable.
  let refused = 0;
  let accepted = 0;
  for (const f of PROVIDER_FLOWS) {
    if (f.status === "no-root") {
      assert.throws(() => chooseProvider(PROVIDER_FLOWS, f.slug, AT), /no web root/, f.slug);
      refused += 1;
    } else {
      assert.equal(chooseProvider(PROVIDER_FLOWS, f.slug, AT).slug, f.slug);
      accepted += 1;
    }
  }
  assert.equal(refused, 5);
  assert.equal(accepted, 20);
});

test("the server refuses exactly what the dropdown declines to offer", () => {
  // The invariant that keeps the two doors agreeing: anything the panel lists
  // must be choosable, and anything choosable must be listed.
  const listed = flowOptions(PROVIDER_FLOWS).map((o) => o.slug);
  for (const slug of listed) assert.ok(chooseProvider(PROVIDER_FLOWS, slug, AT));
  const choosable = PROVIDER_FLOWS.filter((f) => {
    try {
      chooseProvider(PROVIDER_FLOWS, f.slug, AT);
      return true;
    } catch {
      return false;
    }
  }).map((f) => f.slug);
  assert.deepEqual(choosable.sort(), [...listed].sort());
});

test("a tilda customer is told it serves none of the five, not that it serves some", () => {
  const tilda = PROVIDER_FLOWS.find((f) => f.slug === "tilda")!;
  assert.match(droppedReason(tilda), /serves none of the five files/);
});

test("guidance with nothing chosen asks for a provider", () => {
  const g = providerGuidance(PROVIDER_FLOWS, undefined);
  assert.equal(g.tone, "warn");
  assert.match(g.headline, /No hosting provider set/);
});

test("guidance for a needs-capture provider carries that provider's own blocker", () => {
  const hostinger = PROVIDER_FLOWS.find((f) => f.slug === "hostinger")!;
  const g = providerGuidance(PROVIDER_FLOWS, {
    slug: "hostinger",
    name: "Hostinger",
    chosenAt: AT.toISOString(),
  });
  assert.equal(g.tone, "warn");
  assert.match(g.headline, /install by hand/);
  assert.equal(g.detail, hostinger.blocked);
  assert.match(g.detail, /65002/, "the real SFTP port is the useful part");
});

test("guidance reads the CURRENT registry, so a captured flow starts saying so", () => {
  // The stored choice never changes; the answer does.
  const choice = { slug: "example", name: "Example Host", chosenAt: AT.toISOString() };
  const before = providerGuidance([flow()], choice);
  const after = providerGuidance(
    [flow({ status: "ready", blocked: undefined })],
    choice,
  );
  assert.equal(before.tone, "warn");
  assert.equal(after.tone, "good");
  assert.match(after.headline, /can install on Example Host/);
});

test("a choice for a provider that left the registry says so instead of throwing", () => {
  const g = providerGuidance([], { slug: "gone", name: "Gone Host", chosenAt: AT.toISOString() });
  assert.equal(g.tone, "warn");
  assert.match(g.headline, /no longer in the list/);
});

test("a choice stored before its provider was dropped now explains the drop", () => {
  const g = providerGuidance(PROVIDER_FLOWS, {
    slug: "wix",
    name: "Wix",
    chosenAt: AT.toISOString(),
  });
  assert.equal(g.tone, "warn");
  assert.match(g.headline, /Wix has no web root/);
  assert.match(g.detail, /IndexNow/);
});

test("the 'host not listed' answer covers all five, ordered by share", () => {
  const answers = droppedProviderAnswers(PROVIDER_FLOWS);
  assert.deepEqual(answers.map((a) => a.slug), [
    "shopify",
    "wix",
    "squarespace",
    "tilda",
    "webflow",
  ]);
  for (const a of answers) assert.ok(a.reason.length > 80, `${a.slug} reason too thin`);
  assert.deepEqual(answers.find((a) => a.slug === "tilda")!.serves, []);
  assert.deepEqual(answers.find((a) => a.slug === "webflow")!.serves, [
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
    "/.well-known/",
  ]);
});
