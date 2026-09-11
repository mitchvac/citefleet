// Browser-safe. What it MEANS for a customer to pick their hosting provider,
// kept apart from `provider-flow.ts` (which defines what a flow IS) and from the
// panel that renders it.
//
// The reason this is a module and not three lines inside the component: the
// dropdown is not the only door. A server fn writes the same choice, and the two
// must agree about what a valid choice is — otherwise the panel offers something
// the server refuses, which is the exact failure `flowOptions` exists to prevent.
//
// The one rule worth stating plainly: a provider with no web root is refused
// HERE, with the recorded reason, not with a generic error. The research in
// `docs/providers/` was kept for precisely this moment — a customer on Squarespace
// should be told that Squarespace shares one uneditable robots.txt across every
// site and that an apex DNS TXT record is their route, not "invalid provider".

import { rootlessProviders, type ProviderFlow } from "./provider-flow.ts";

export interface ProviderChoice {
  /** Matches a `ProviderFlow.slug`, which is the `docs/providers/<slug>.md` name. */
  slug: string;
  /**
   * Copied rather than looked up, so a stored choice still reads as something
   * when a provider is renamed — "Bluehost / HostGator / Network Solutions" has
   * changed shape once already.
   */
  name: string;
  chosenAt: string;
}

/** The sentence a customer on a rootless provider gets, built from its record. */
export function droppedReason(flow: ProviderFlow): string {
  const record = flow.rootless;
  if (!record) return `${flow.name} cannot serve the origin pack.`;
  const serves = record.serves.length
    ? `It does serve ${record.serves.join(", ")} through its own settings.`
    : "It serves none of the five files.";
  return `${flow.name} gives a site no web root, so there is nowhere to install the origin pack. ${serves} ${record.fallback}`;
}

/**
 * Validate a slug against the registry and record the choice.
 *
 * Throws rather than returning a result union because every caller — panel and
 * server fn — treats a bad choice as an error to show, and a silent fallback to
 * "some provider" would be worse than stopping.
 */
export function chooseProvider(
  flows: readonly ProviderFlow[],
  slug: string,
  now: Date = new Date(),
): ProviderChoice {
  const clean = slug.trim();
  if (!clean) throw new Error("Pick a hosting provider first.");
  const flow = flows.find((f) => f.slug === clean);
  if (!flow) {
    throw new Error(
      `No hosting provider "${clean}". The list is the researched set in docs/providers/.`,
    );
  }
  if (flow.status === "no-root") throw new Error(droppedReason(flow));
  return { slug: flow.slug, name: flow.name, chosenAt: now.toISOString() };
}

export interface ProviderGuidance {
  tone: "good" | "warn";
  headline: string;
  detail: string;
}

/**
 * What the panel says once a provider is stored. Reads the CURRENT registry, not
 * the stored choice, so a provider that gains a captured flow starts saying so
 * without anyone rewriting the site's record.
 */
export function providerGuidance(
  flows: readonly ProviderFlow[],
  choice: ProviderChoice | undefined,
): ProviderGuidance {
  if (!choice) {
    return {
      tone: "warn",
      headline: "No hosting provider set",
      detail:
        "Pick the host this site runs on and CiteFleet can say exactly where its web root is, which port its SFTP answers on, and what breaks verification there.",
    };
  }
  const flow = flows.find((f) => f.slug === choice.slug);
  if (!flow) {
    return {
      tone: "warn",
      headline: `${choice.name} is no longer in the list`,
      detail:
        "The provider was removed from the researched set since this was chosen. Pick again to get current install steps.",
    };
  }
  if (flow.status === "no-root") {
    // Reachable only for a choice stored before the provider was dropped.
    return { tone: "warn", headline: `${flow.name} has no web root`, detail: droppedReason(flow) };
  }
  if (flow.status === "ready") {
    return {
      tone: "good",
      headline: `CiteFleet can install on ${flow.name}`,
      detail: "Run the install and the five origin files are written to this site's real web root.",
    };
  }
  return {
    tone: "warn",
    headline: `${flow.name} — install by hand for now`,
    detail: flow.blocked ?? "Steps for this panel have not been captured yet.",
  };
}

/**
 * The "my host isn't in the list" answer, for every dropped provider at once.
 * This is what keeping the rootless records buys: a real explanation instead of
 * a customer concluding CiteFleet does not support them and leaving.
 */
export function droppedProviderAnswers(flows: readonly ProviderFlow[]) {
  return rootlessProviders(flows).map((d) => {
    const flow = flows.find((f) => f.slug === d.slug)!;
    return {
      slug: d.slug,
      name: d.name,
      share: d.share,
      serves: flow.rootless?.serves ?? [],
      reason: droppedReason(flow),
    };
  });
}
