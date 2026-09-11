// Browser-safe. The ONE definition of what a hosting-provider install flow is:
// the steps that carry a customer from "logged in to their panel" to "the five
// origin files are in the root directory of their website".
//
// Why a data model and not code per provider: the research in
// `docs/providers/*.md` (25 providers, 919 cited official URLs) established that
// the panels share no structure worth abstracting over. What they share is a
// SHAPE — log in, find the real web root, upload, log out. Holding that shape as
// data means a panel that changes its markup is a data fix, not a release, and
// the same definitions render CiteFleet's provider dropdown without shipping
// Playwright to the browser.
//
// The single most important thing this model refuses to do is assume a web root.
// Fifteen distinct conventions appeared across the 25 providers and several
// hosts decline to name one at all: IONOS has no fixed root (the customer picks
// a destination folder per domain, and the absolute path changed with contract
// age on 2026-07-21), Lolipop!'s root is a folder the customer invents — writing
// to the FTP root publishes to the WRONG domain — Aruba's own FAQ says "/web or
// /htdocs, depending on the configuration", and one.com is `httpd.www` on old
// servers and a hash-named `/webroots/<hex>` on new ones. So `discoverRoot` is a
// required phase with a required output, not a default with an override.

/** Where a step's value comes from. Literals, or something read earlier. */
export type FlowValue =
  | { from: "literal"; value: string }
  /** A value captured by an earlier `readText` step, by its `into` name. */
  | { from: "captured"; name: string };

/**
 * One instruction. Deliberately small and closed: every step a flow can take is
 * listed here, so `installer/` can execute a flow it has never seen and the
 * validator can reason about a flow without running it.
 */
export type FlowStep =
  /** Navigate. `url` may contain `{capture}` placeholders resolved at run time. */
  | { kind: "goto"; url: string; note: string }
  | { kind: "click"; selector: string; note: string }
  | { kind: "fill"; selector: string; value: FlowValue; note: string }
  /** Block until the selector appears. The only sanctioned way to wait. */
  | { kind: "waitFor"; selector: string; note: string }
  /** Read visible text into a named capture — how the web root is discovered. */
  | { kind: "readText"; selector: string; into: string; note: string }
  /** Hand the five origin files to a file input. */
  | { kind: "uploadPack"; selector: string; note: string }
  /** Assert something is true; a failed expect aborts the flow. */
  | { kind: "expect"; selector: string; note: string };

/**
 * The capture name `discoverRoot` MUST produce. The executor refuses to upload
 * without it, which is what stops a flow from silently writing into whatever
 * directory the panel happened to open on.
 */
export const WEB_ROOT_CAPTURE = "webRoot";

/**
 * How honest this flow is about itself.
 *
 * `needs-capture` exists because writing selectors for a panel nobody has opened
 * would be a Rule 17 placeholder wearing a plausible name. A flow says so rather
 * than shipping invented selectors that fail on a customer's machine.
 */
export type FlowStatus =
  /** Steps captured against the live panel and executed end to end. */
  | "ready"
  /** Shape known from the provider docs; selectors not yet captured live. */
  | "needs-capture"
  /**
   * The provider gives the customer NO writable web root, so the installer can
   * never run here and this provider is dropped from the list customers pick
   * from. The entry is kept in the registry rather than deleted, carrying a
   * `rootless` record: "no root" is a fact about the provider's product on a
   * DATE, and these are precisely the platforms that keep adding root-path
   * hooks (Shopify shipped `llms.txt.liquid` on 2026-05-28). Deleting the entry
   * would throw away the research and the re-check trigger with it.
   */
  | "no-root";

/**
 * Why a provider has no web root, kept so the decision can be re-made later
 * without redoing the research. Every field answers a question the next reader
 * will actually have, and `evidence` is pinned verbatim to the provider's file
 * in `docs/providers/` by a test — so if the provider changes its process and
 * the research is updated, the quote stops matching and the build says so.
 * That failing test IS the re-check trigger.
 */
export interface RootlessRecord {
  /** The provider's own words, verbatim from `docs/providers/<slug>.md`. */
  evidence: string;
  /**
   * Root paths the provider DOES serve through its own mechanism, if any.
   * Empty means it serves none of the pack. This is what would otherwise be
   * lost by collapsing a provider to "impossible".
   */
  serves: readonly string[];
  /** What a customer on this provider does instead, today. */
  fallback: string;
  /** The specific product change that would put this provider back in the list. */
  reopenIf: string;
  /** ISO date the research behind this record was last confirmed. */
  checked: string;
}

export interface ProviderFlow {
  /** Matches the `docs/providers/<slug>.md` filename. */
  slug: string;
  name: string;
  /** Market share, W3Techs 2026-09-11 — the dropdown orders by it. */
  share: number;
  /** Where the customer lands to sign in. Opened in the Playwright browser. */
  loginUrl: string;
  /** Present only once the customer is through the login (and any MFA). */
  loggedIn: { selector: string; note: string };
  /** Must end having captured `WEB_ROOT_CAPTURE`. Never assume the root. */
  discoverRoot: FlowStep[];
  upload: FlowStep[];
  logout: FlowStep[];
  status: FlowStatus;
  /** Required when status is not `ready`: what is missing, or why it cannot work. */
  blocked?: string;
  /** Required when status is `no-root`, and forbidden otherwise. */
  rootless?: RootlessRecord;
}

export interface FlowProblem {
  flow: string;
  problem: string;
}

function stepSelector(step: FlowStep): string | null {
  return "selector" in step ? step.selector : null;
}

/** Every capture name a phase produces, in order. */
export function capturesOf(steps: readonly FlowStep[]): string[] {
  return steps.flatMap((s) => (s.kind === "readText" ? [s.into] : []));
}

/**
 * Validate one flow against the invariants the executor depends on.
 *
 * Fail-closed on purpose: a flow that cannot be proven safe is reported here,
 * at build time with a test watching, rather than half-way through a customer's
 * install with their panel open.
 */
export function validateFlow(flow: ProviderFlow): FlowProblem[] {
  const problems: FlowProblem[] = [];
  const fail = (problem: string) => problems.push({ flow: flow.slug, problem });

  if (!flow.slug.trim()) fail("slug is empty");
  if (!flow.name.trim()) fail("name is empty");
  if (!(flow.share > 0)) fail("share must be a positive percentage");

  const allSteps = [...flow.discoverRoot, ...flow.upload, ...flow.logout];

  // A blank selector matches nothing and throws at run time with no useful
  // message; catching it here names the provider and the step instead.
  for (const step of allSteps) {
    const selector = stepSelector(step);
    if (selector !== null && !selector.trim()) fail(`${step.kind} step has an empty selector`);
    if (!step.note.trim()) fail(`${step.kind} step has no note`);
  }

  if (flow.status === "ready") {
    if (!/^https:\/\//.test(flow.loginUrl)) fail("a ready flow needs an https login URL");
    if (!flow.loggedIn.selector.trim()) fail("a ready flow needs a loggedIn selector");
    if (!flow.discoverRoot.length) fail("a ready flow must discover the web root");
    if (!flow.upload.length) fail("a ready flow must have upload steps");
    if (!flow.logout.length) fail("a ready flow must log the customer out");

    // The invariant this whole model exists for.
    if (!capturesOf(flow.discoverRoot).includes(WEB_ROOT_CAPTURE)) {
      fail(`discoverRoot must capture "${WEB_ROOT_CAPTURE}" — the web root is never assumed`);
    }
    if (!flow.upload.some((s) => s.kind === "uploadPack")) {
      fail("a ready flow must contain an uploadPack step");
    }
    if (flow.blocked) fail("a ready flow must not carry a blocked reason");
  } else {
    if (!flow.blocked?.trim()) fail(`status "${flow.status}" requires a blocked reason`);
  }

  if (flow.status === "no-root") {
    // Steps and a login URL would be an invitation to try. There is nothing to
    // drive, so the flow must not look drivable.
    if (allSteps.length) fail("a no-root flow must carry no steps — they would never run");
    if (flow.loginUrl) fail("a no-root flow must not offer a login the installer cannot use");

    const record = flow.rootless;
    if (!record) {
      fail("a no-root flow must carry a rootless record — the research is the point of keeping it");
    } else {
      if (!record.evidence.trim()) fail("rootless.evidence must quote the provider's own words");
      if (!record.fallback.trim()) fail("rootless.fallback must say what the customer does instead");
      if (!record.reopenIf.trim()) fail("rootless.reopenIf must say what would reopen this provider");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.checked)) {
        fail(`rootless.checked must be an ISO date, got "${record.checked}"`);
      }
      for (const path of record.serves) {
        if (!path.startsWith("/")) fail(`rootless.serves entry "${path}" must be a root path`);
      }
    }
  } else if (flow.rootless) {
    fail(`only a no-root flow carries a rootless record, not status "${flow.status}"`);
  }

  // A `captured` value that nothing produced resolves to undefined at run time
  // and fills a form with the empty string, which on a file manager means
  // writing to the wrong directory rather than failing loudly.
  const produced = new Set<string>();
  for (const phase of [flow.discoverRoot, flow.upload, flow.logout]) {
    for (const step of phase) {
      if (step.kind === "fill" && step.value.from === "captured" && !produced.has(step.value.name)) {
        fail(`fill uses capture "${step.value.name}" before anything captured it`);
      }
      if (step.kind === "readText") produced.add(step.into);
    }
  }

  return problems;
}

/** Validate a whole registry, including cross-flow uniqueness. */
export function validateFlows(flows: readonly ProviderFlow[]): FlowProblem[] {
  const problems = flows.flatMap(validateFlow);
  const seen = new Map<string, number>();
  for (const flow of flows) seen.set(flow.slug, (seen.get(flow.slug) ?? 0) + 1);
  for (const [slug, count] of seen) {
    if (count > 1) problems.push({ flow: slug, problem: `slug appears ${count} times` });
  }
  return problems;
}

/**
 * What the customer's dropdown shows. Ordered by share so the providers most
 * customers are on sit at the top, and carrying `status` so a provider CiteFleet
 * cannot yet drive says so on the list instead of failing after the login.
 *
 * `no-root` providers are DROPPED here. A provider with no writable web root is
 * not "not yet" — the installer has nothing to drive on it, and listing it would
 * let someone pick their host and only discover that after logging in. They stay
 * in the registry and come back out of `rootlessProviders` with the reason.
 */
export function flowOptions(flows: readonly ProviderFlow[]) {
  return [...flows]
    .filter((f) => f.status !== "no-root")
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name))
    .map((f) => ({
      slug: f.slug,
      name: f.name,
      share: f.share,
      status: f.status,
      blocked: f.blocked,
      selectable: f.status === "ready",
    }));
}

/**
 * The providers dropped from the list for having no web root, with the reason
 * and the research behind it. Separate from `flowOptions` on purpose: this is
 * not a dropdown, it is the answer to "why isn't my host here?" and the standing
 * list to re-check when a platform changes what it serves at `/`.
 */
export function rootlessProviders(flows: readonly ProviderFlow[]) {
  return flows
    .filter((f) => f.status === "no-root")
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name))
    .map((f) => ({
      slug: f.slug,
      name: f.name,
      share: f.share,
      reason: f.blocked ?? "",
      rootless: f.rootless,
    }));
}
