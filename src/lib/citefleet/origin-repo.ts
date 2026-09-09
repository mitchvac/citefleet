// Browser-safe. The ONE definition of which place on GitHub a property's origin
// pack writes into, and whether that place is already spoken for.
//
// Why this exists: `buildOriginPack` writes the same four paths for every
// property — robots.txt, sitemap.xml, llms.txt, .well-known/botcentral.txt —
// under the configured root. Two properties pointed at the same owner/repo/root
// therefore do not "share" a repo; the second push silently overwrites the
// first property's four files with another domain's name, canonical, sitemap
// and llms text. That happened once already: wflowprocess.app was attached to
// mitchvac/citefleet and clobbered citefleet.app's own public/ (restored in
// c6aebe2, which added a hardcoded check for the single repo name "citefleet").
//
// A name-specific check only catches the collision that already happened. The
// real invariant is positional: a root inside a repo may hold exactly one
// property's origin pack. `originRepoConflict` is that invariant, and both the
// server (attach, onboard, push) and the campaign UI read it from here so the
// screen cannot show "repo attached" for a repo the server will refuse.

/** Where a property's origin pack is written. `branch` never affects identity. */
export type RepoRef = { owner: string; repo: string; root?: string };

type SiteLike = {
  id: string;
  domain: string;
  github?: { owner: string; repo: string; root?: string };
};

/** CiteFleet's own repository. Its public/ deploys citefleet.app and nothing else. */
export const CITEFLEET_REPO = "citefleet";
export const CITEFLEET_DOMAIN = "citefleet.app";

export function normalizeOwner(owner: string): string {
  return owner.trim().replace(/^@/, "");
}

export function normalizeRepo(repo: string): string {
  return repo.trim().replace(/\.git$/, "");
}

/** Matches what `attachGithub` persists: no leading or trailing slash, default `public`. */
export function normalizeRoot(root: string | undefined): string {
  return (root ?? "public").trim().replace(/^\/+|\/+$/g, "");
}

/**
 * Identity of the folder the origin pack overwrites.
 *
 * GitHub owner and repository names are case-insensitive — `mitchvac/Citefleet`
 * and `mitchvac/citefleet` are one repository — so they are folded to lower
 * case. Paths inside a repository are case-sensitive, so the root is compared
 * exactly as written.
 */
export function repoSlot(ref: RepoRef): string {
  const owner = normalizeOwner(ref.owner).toLowerCase();
  const repo = normalizeRepo(ref.repo).toLowerCase();
  return `${owner}/${repo}:${normalizeRoot(ref.root)}`;
}

/**
 * True when this property's stored repo is one it may not have under the
 * citefleet-repo rule. A squatter is ignored when deciding whether a slot is
 * taken: citefleet.app must still be able to claim its own repository while
 * wflowprocess.app is sitting in it, or a bad row would deadlock the fix.
 */
function squatsCitefleetRepo(s: SiteLike): boolean {
  if (!s.github?.repo) return false;
  return (
    normalizeRepo(s.github.repo).toLowerCase() === CITEFLEET_REPO &&
    s.domain !== CITEFLEET_DOMAIN
  );
}

export type RepoConflict = {
  /** `citefleet-repo`: CiteFleet's own repo, claimed by something that is not citefleet.app. */
  reason: "citefleet-repo" | "claimed-by-other-site";
  /** Operator-facing sentence. Names the property that already owns the slot. */
  message: string;
  /** The property already writing into this slot, when there is one. */
  otherDomain?: string;
};

/**
 * Returns the reason this property may not write its origin pack into `ref`, or
 * null when the slot is free. An empty owner or repo is "not configured yet",
 * not a conflict — the caller reports that separately.
 */
export function originRepoConflict(
  site: { id: string; domain: string; url: string },
  ref: RepoRef,
  allSites: readonly SiteLike[],
): RepoConflict | null {
  const owner = normalizeOwner(ref.owner);
  const repo = normalizeRepo(ref.repo);
  if (!owner || !repo) return null;

  if (repo.toLowerCase() === CITEFLEET_REPO && site.domain !== CITEFLEET_DOMAIN) {
    return {
      reason: "citefleet-repo",
      message:
        `Wrong repo. ${site.domain} files must go in the website repo that deploys to ` +
        `${site.url}, not mitchvac/citefleet. CiteFleet public/ is only for citefleet.app.`,
    };
  }

  const slot = repoSlot({ owner, repo, root: ref.root });
  const other = allSites.find(
    (s) =>
      s.id !== site.id &&
      Boolean(s.github?.owner && s.github.repo) &&
      !squatsCitefleetRepo(s) &&
      repoSlot(s.github!) === slot,
  );
  if (other) {
    const folder = normalizeRoot(ref.root);
    return {
      reason: "claimed-by-other-site",
      otherDomain: other.domain,
      message:
        `Wrong repo. ${owner}/${repo} ${folder ? `${folder}/` : "(repo root)"} already holds ` +
        `${other.domain}'s origin files — pushing ${site.domain} there would overwrite them. ` +
        `Point ${site.domain} at the repo that deploys to ${site.url}.`,
    };
  }

  return null;
}
