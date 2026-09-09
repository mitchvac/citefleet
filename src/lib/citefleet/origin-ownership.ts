// Browser-safe. The ONE rule for whether CiteFleet may WRITE a given origin
// file, as opposed to `origin-repo.ts`, which decides WHERE it may write.
//
// Why this exists: `buildOriginPack` generates all four origin files from
// CiteFleet's own campaign state — `site.name`, `site.url`, `site.summary` and
// `site.routes` — and `pushOriginPack` used to PUT every one of them
// unconditionally, with no read of what was already there. On a property whose
// files were written by somebody who knows the property, every push was a
// downgrade. Measured against the live mitchvac/Resonanse on 2026-09-09:
//
//   robots.txt   8 Disallow lines lost — /discover /matches /likes /chat
//                /wallet /profile /onboarding /profile-setup, i.e. every
//                session-gated surface of a dating product, opened to Googlebot
//   sitemap.xml  5 real URLs lost, 1 invented (/about, which does not exist)
//   llms.txt     the description AI crawlers read replaced by the campaign
//                status line "Technical foundation complete. Campaign is in
//                crawl → index → cite."
//
// None of that is a bad value in a field; it is the generator having no field
// to hold the truth. Until it does (private routes, a real route list, a
// publisher description that is not the ops status), the safe rule is that
// CiteFleet only overwrites what CiteFleet wrote.
//
// Fail-closed by construction: anything this module cannot positively identify
// as CiteFleet's own is refused, never written. A refusal costs the operator a
// look at a diff; a wrong write costs a live robots policy.

/**
 * The ownership marker every generated file carries. Detection is a plain
 * substring test, so the comment syntax around it may differ per format
 * (`#` in robots.txt, `<!-- -->` in sitemap.xml and llms.txt) without the
 * rule needing to know which format it is looking at.
 */
export const OWNER_MARKER = "Written by CiteFleet";

/**
 * Signatures that identify a CiteFleet file written BEFORE `OWNER_MARKER` was
 * carried by that path's generator. Keyed by path suffix.
 *
 * `.well-known/botcentral.txt` is the only one that needs this: it has always
 * been generated with `publisher: citefleet`, is already deployed on live
 * properties, and is a machine-read proof file whose whole content is
 * CiteFleet's format. robots.txt needs no entry — it has shipped the
 * `# Written by CiteFleet.` line since the generator was written, so the main
 * marker already matches it.
 *
 * sitemap.xml and llms.txt deliberately get NO legacy signature. A CiteFleet
 * sitemap and a hand-written one differ only in content, and any signature
 * loose enough to catch the old generated ones would also catch a real one.
 * The cost is that a property whose sitemap CiteFleet pushed before this change
 * is refused once, with the diff shown, until the operator pushes it again.
 * That is the correct direction to be wrong in.
 */
const LEGACY_SIGNATURES: ReadonlyArray<{ suffix: string; contains: string }> = [
  { suffix: ".well-known/botcentral.txt", contains: "publisher: citefleet" },
];

export type OriginWriteState =
  /** Nothing at that path in the repo. Writing creates it. */
  | "create"
  /** CiteFleet's own file, and the generated content differs. Writing updates it. */
  | "update"
  /** Already byte-identical to what CiteFleet would write. Writing is a no-op. */
  | "identical"
  /** Someone else's file. CiteFleet must not write it. */
  | "refused"
  /**
   * The app already generates this route in code, so a static file here would
   * never be served. Distinct from `refused` because nothing is being
   * protected from overwrite — the path is empty — yet writing it is still
   * wrong, and for a reason the operator has to fix in the repo, not here.
   */
  | "shadowed";

export type OriginFileVerdict = {
  path: string;
  state: OriginWriteState;
  /** Operator-facing sentence. Says what is there and why it may or may not be written. */
  reason: string;
  /** Byte length of what is in the repo now, when there is something. */
  remoteBytes?: number;
  /** Byte length of what CiteFleet would write. */
  generatedBytes: number;
  /** For `shadowed`: the repo path of the framework source that owns this route. */
  shadowedBy?: string;
};

/** True when `state` means the file is safe for `pushOriginPack` to PUT. */
export function isWritable(state: OriginWriteState): boolean {
  return state === "create" || state === "update";
}

// ---------------------------------------------------------------------------
// Framework-generated routes
//
// Ownership answers "is this file somebody's work". It cannot answer "does this
// route already have an owner somewhere else in the repo", and that is a real
// case: mitchvac/wflowprocess is a Next.js app with frontend/app/robots.ts and
// frontend/app/sitemap.ts, and NO static twin in frontend/public. Every
// ownership check therefore says `create`, correctly — the path is empty.
//
// Writing it is still wrong. Verified on Next 14.2.35 (the version that repo
// pins), App Router, output: "standalone", with both files present:
//
//   next build  -> ✓ Compiled successfully, ✓ Generating static pages (6/6),
//                  routes /robots.txt and /sitemap.xml both listed. No warning.
//   next start  -> GET /robots.txt returns the public/ file, not the route
//   standalone  -> same
//
// The static file wins silently and the app's own robots policy never ships.
// A build failure would have been the safe outcome; instead it is a green
// deploy with a quietly replaced policy. So the static twin is refused
// wherever the framework source exists.
// ---------------------------------------------------------------------------

/** Extensions a metadata route may be written in. */
const ROUTE_EXTENSIONS = ["ts", "tsx", "js", "jsx", "mjs"] as const;

/**
 * The origin file a framework source file would shadow, or null.
 *
 * `app/robots.ts` serves /robots.txt, so a static `public/robots.txt` in the
 * same app never reaches a crawler. Same for sitemap.
 *
 * TanStack Start escapes dots in file routes, so the same two routes are
 * `robots[.]txt.ts` and `sitemap[.]xml.ts`. Missing those was not hypothetical:
 * CiteFleet's own repo has `src/routes/sitemap[.]xml.ts` listing nine real
 * paths, and a pushed `public/sitemap.xml` shadows it — so citefleet.app serves
 * the generated five (three of which 404) and never its own nine. This guard
 * shipped without catching the case in the repo it shipped from.
 */
export function shadowedOriginFile(fileName: string): string | null {
  for (const ext of ROUTE_EXTENSIONS) {
    if (fileName === `robots.${ext}`) return "robots.txt";
    if (fileName === `sitemap.${ext}`) return "sitemap.xml";
    // TanStack Start file routes.
    if (fileName === `robots[.]txt.${ext}`) return "robots.txt";
    if (fileName === `sitemap[.]xml.${ext}`) return "sitemap.xml";
  }
  return null;
}

/**
 * Directories to search for framework route sources, given the origin root.
 *
 * The app that owns `<x>/public` lives at `<x>`, so the candidates are that
 * directory's `app/`, `pages/` and `routes/`, with and without a `src/` layer.
 * For a root of `frontend/public` that is frontend/app, frontend/src/app, …;
 * for a root of `public`, the same set at the repo root.
 *
 * `src/routes` is TanStack Start's file-route directory and is not optional
 * here: CiteFleet itself is a TanStack app whose `src/routes/sitemap[.]xml.ts`
 * is shadowed by its own pushed `public/sitemap.xml`.
 */
export function frameworkSourceDirs(root: string): string[] {
  const parent = root.split("/").slice(0, -1).join("/");
  const prefix = parent ? `${parent}/` : "";
  return [
    `${prefix}app`,
    `${prefix}src/app`,
    `${prefix}pages`,
    `${prefix}src/pages`,
    `${prefix}routes`,
    `${prefix}src/routes`,
  ];
}

/**
 * True when the content at `path` was written by CiteFleet.
 *
 * Exported for the tests and for callers that want the ownership question on
 * its own; `classifyOriginFile` is what push and the campaign panel use.
 */
export function isCiteFleetOwned(path: string, content: string): boolean {
  if (content.includes(OWNER_MARKER)) return true;
  return LEGACY_SIGNATURES.some(
    (sig) => path.endsWith(sig.suffix) && content.includes(sig.contains),
  );
}

/**
 * Decide what may happen to one origin file.
 *
 * `remote` is the content currently at `path` in the repo, or null when the
 * repo has nothing there. A read that FAILED is not null — the caller must not
 * turn an unreadable path into "absent", because that would write over a file
 * it could not see. `github.ts` fails the whole push in that case.
 */
export function classifyOriginFile(input: {
  path: string;
  generated: string;
  remote: string | null;
}): OriginFileVerdict {
  const { path, generated, remote } = input;
  const generatedBytes = generated.length;

  if (remote === null) {
    return {
      path,
      state: "create",
      reason: "Not in the repo yet — push creates it.",
      generatedBytes,
    };
  }

  const remoteBytes = remote.length;

  if (remote === generated) {
    return {
      path,
      state: "identical",
      reason: "Already exactly what CiteFleet would write — push skips it.",
      remoteBytes,
      generatedBytes,
    };
  }

  if (isCiteFleetOwned(path, remote)) {
    return {
      path,
      state: "update",
      reason: "CiteFleet wrote this file — push updates it.",
      remoteBytes,
      generatedBytes,
    };
  }

  return {
    path,
    state: "refused",
    reason:
      `This file was not written by CiteFleet (${remoteBytes} bytes in the repo, ` +
      `${generatedBytes} generated). Pushing would replace the site's own file. ` +
      `Refused — edit it in the repo, or delete it there if CiteFleet should own it.`,
    remoteBytes,
    generatedBytes,
  };
}

export type OriginPackPlan = {
  verdicts: OriginFileVerdict[];
  /** The files push would actually PUT. */
  writable: OriginFileVerdict[];
  /** The files push must leave alone: someone's own file, or a shadowed route. */
  blocked: OriginFileVerdict[];
  /** True when nothing at all would change in the repo. */
  noop: boolean;
};

/**
 * Classify a whole origin pack against what the repo currently holds.
 *
 * `remotes` maps path → content, with null for "read succeeded, nothing there".
 * A path missing from the map is treated as unread and refused, so a caller
 * that forgets to read one cannot silently overwrite it.
 *
 * `frameworkRoutes` maps an origin file NAME (`robots.txt`, `sitemap.xml`) to
 * the repo path of the framework source that already serves that route. Those
 * are refused as `shadowed` before ownership is consulted at all: it does not
 * matter whether the static path is free, because a file written there is
 * never served.
 */
export function planOriginPack(
  files: ReadonlyArray<{ path: string; content: string }>,
  remotes: ReadonlyMap<string, string | null>,
  frameworkRoutes: ReadonlyMap<string, string> = new Map(),
): OriginPackPlan {
  const verdicts = files.map((file): OriginFileVerdict => {
    const name = file.path.split("/").pop() ?? file.path;
    const owner = frameworkRoutes.get(name);
    if (owner) {
      return {
        path: file.path,
        state: "shadowed",
        shadowedBy: owner,
        reason:
          `The app generates this route in ${owner}. A static file here is ` +
          `never served — it silently takes the route over at build time, and ` +
          `the app's own version stops shipping. Refused. Add CiteFleet's lines ` +
          `to ${owner} instead.`,
        generatedBytes: file.content.length,
      };
    }
    if (!remotes.has(file.path)) {
      return {
        path: file.path,
        state: "refused",
        reason: "The repo was not read for this path — refusing to write blind.",
        generatedBytes: file.content.length,
      };
    }
    return classifyOriginFile({
      path: file.path,
      generated: file.content,
      remote: remotes.get(file.path) ?? null,
    });
  });

  const writable = verdicts.filter((v) => isWritable(v.state));
  const blocked = verdicts.filter(
    (v) => v.state === "refused" || v.state === "shadowed",
  );
  return { verdicts, writable, blocked, noop: writable.length === 0 };
}
