import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PROVIDER_FLOWS } from "./provider-flows.ts";
import { flowOptions, rootlessProviders, validateFlows } from "./provider-flow.ts";

const docsDir = fileURLToPath(new URL("../../../docs/providers/", import.meta.url));

function docSlugs(): string[] {
  return readdirSync(docsDir)
    .filter((f) => f.endsWith(".md") && f !== "README.md" && f !== "TEMPLATE.md")
    .map((f) => f.replace(/\.md$/, ""))
    .sort();
}

test("every flow in the registry satisfies the schema", () => {
  assert.deepEqual(validateFlows(PROVIDER_FLOWS), []);
});

test("the registry and docs/providers/ are the same 25 providers", () => {
  // The coupling that matters: a flow whose research file was deleted, or a
  // researched provider nobody added a flow for, is drift that would surface as
  // a missing dropdown entry in front of a customer.
  const docs = docSlugs();
  const flows = PROVIDER_FLOWS.map((f) => f.slug).sort();

  // Positive control: the fixture directory really does contain files. An empty
  // read would make both sides trivially equal and prove nothing (Rule 20).
  assert.ok(docs.length >= 25, `expected 25+ provider docs, found ${docs.length}`);

  assert.deepEqual(flows, docs, "registry slugs must match docs/providers/*.md exactly");
});

test("no flow claims ready while its selectors are uncaptured", () => {
  // Every entry is needs-capture or no-root today. The moment one flips to
  // ready, validateFlow already forces it to carry a webRoot capture, an
  // uploadPack step and a logout — so this test is about honesty, not shape.
  const ready = PROVIDER_FLOWS.filter((f) => f.status === "ready");
  assert.deepEqual(
    ready.map((f) => f.slug),
    [],
    "a flow marked ready must have been executed against the live panel first",
  );
});

test("every non-ready flow explains itself", () => {
  for (const flow of PROVIDER_FLOWS) {
    assert.ok(
      (flow.blocked ?? "").length > 40,
      `${flow.slug} needs a real reason, got: ${JSON.stringify(flow.blocked)}`,
    );
  }
});

test("the five providers with no web root are the five dropped", () => {
  // The rule: a provider is dropped when the customer gets no writable web root.
  // That is every SaaS builder in the set and nothing else. Vercel is NOT here —
  // its root is public/ in the connected git repo, which CiteFleet already
  // writes, and docs/providers/vercel.md calls public/.well-known/botcentral.txt
  // "the only file-based option". AWS, Azure, Google Cloud and DigitalOcean keep
  // real filesystems on their compute products.
  const dropped = PROVIDER_FLOWS.filter((f) => f.status === "no-root").map((f) => f.slug);
  assert.deepEqual(dropped.sort(), ["shopify", "squarespace", "tilda", "webflow", "wix"]);
});

test("a dropped provider is kept in the registry, not deleted", () => {
  // Keeping them is the requirement: the research stays, and so does the answer
  // to "why isn't my host here?". 13.6% of the web sits behind these five.
  const dropped = rootlessProviders(PROVIDER_FLOWS);
  assert.equal(dropped.length, 5);
  const share = dropped.reduce((n, d) => n + d.share, 0);
  assert.ok(Math.abs(share - 13.6) < 0.01, `dropped share should be 13.6%, got ${share}`);
  for (const d of dropped) {
    assert.ok(d.reason.length > 40, `${d.slug} needs a real reason`);
    assert.ok(d.rootless, `${d.slug} must keep its research`);
  }
  // Ordered by share, so the most costly drop is read first.
  assert.deepEqual(dropped.map((d) => d.slug), ["shopify", "wix", "squarespace", "tilda", "webflow"]);
});

test("no dropped provider reaches the customer's list", () => {
  const listed = new Set(flowOptions(PROVIDER_FLOWS).map((o) => o.slug));
  for (const d of rootlessProviders(PROVIDER_FLOWS)) {
    assert.ok(!listed.has(d.slug), `${d.slug} has no web root and must not be offered`);
  }
  assert.equal(listed.size, PROVIDER_FLOWS.length - 5);
});

test("each drop quotes its own research file verbatim — this is the re-check trigger", () => {
  // The coupling that makes "keep it for when they change their process" real:
  // the reason is pinned to the provider's own words in docs/providers/. Update
  // the file because the provider changed, and this test fails and sends the
  // next reader back to the decision instead of letting it quietly go stale.
  const dropped = rootlessProviders(PROVIDER_FLOWS);
  assert.equal(dropped.length, 5, "positive control: there are drops to check");
  for (const d of dropped) {
    const doc = readFileSync(`${docsDir}${d.slug}.md`, "utf8");
    const quote = d.rootless?.evidence ?? "";
    assert.ok(quote.length > 20, `${d.slug} evidence is too short to pin anything`);
    assert.ok(
      doc.includes(quote),
      `${d.slug}: evidence no longer appears in docs/providers/${d.slug}.md — re-check whether ` +
        `this provider still has no web root:\n  ${quote}`,
    );
  }
});

test("a negative control proves the quote check can fail", () => {
  // Rule 20: a passing check that cannot fail has told nobody anything.
  const doc = readFileSync(`${docsDir}shopify.md`, "utf8");
  assert.ok(!doc.includes("Shopify hands every merchant a writable public_html"));
});

test("a dropped provider carries no login URL to click", () => {
  for (const flow of PROVIDER_FLOWS.filter((f) => f.status === "no-root")) {
    assert.equal(flow.loginUrl, "", `${flow.slug} must not offer a login the script cannot use`);
  }
});

test("every actionable flow has an https login URL for the dropdown to open", () => {
  for (const flow of PROVIDER_FLOWS.filter((f) => f.status !== "no-root")) {
    assert.match(flow.loginUrl, /^https:\/\//, `${flow.slug} login URL`);
  }
});

test("the dropdown is ordered by share — Hostinger leads now Shopify is dropped", () => {
  // Shopify (5.4%) used to lead the list while being unable to serve 3 of the 5
  // files. With the rootless providers dropped, the top of the list is the
  // largest provider that actually has a filesystem — which is also the first
  // capture target.
  const actionable = flowOptions(PROVIDER_FLOWS).filter((o) => o.status === "needs-capture");
  assert.deepEqual(
    actionable.slice(0, 2).map((o) => [o.slug, o.share]),
    [
      ["hostinger", 5.2],
      ["amazon-aws", 4.5],
    ],
  );
});

test("Hostinger is declared the first capture target", () => {
  const hostinger = PROVIDER_FLOWS.find((f) => f.slug === "hostinger");
  assert.ok(hostinger, "hostinger flow must exist");
  assert.match(hostinger.blocked ?? "", /FIRST TARGET/);
  assert.equal(hostinger.status, "needs-capture");
});

test("the dropdown offers nothing selectable until a flow is captured", () => {
  // Guards the customer-facing failure this whole model exists to prevent:
  // letting someone pick a provider, log in, and only then discover CiteFleet
  // cannot drive it.
  assert.deepEqual(
    flowOptions(PROVIDER_FLOWS).filter((o) => o.selectable),
    [],
  );
});

test("shares are plausible and the registry covers a real slice of the market", () => {
  const total = PROVIDER_FLOWS.reduce((n, f) => n + f.share, 0);
  assert.ok(total > 50 && total < 56, `top-25 share should total ~52.7%, got ${total.toFixed(1)}`);
  for (const f of PROVIDER_FLOWS) assert.ok(f.share > 0 && f.share < 10, `${f.slug} share ${f.share}`);
});
