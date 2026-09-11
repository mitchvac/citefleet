# Vercel

- **Market share:** 2.1% of all websites (W3Techs, 2026-09-11)
- **Category:** git-deploy platform
- **File access:** none at runtime — files enter only through a deployment (git push, `vercel` CLI, or the REST API)
- **Automatable by the CiteFleet script (rclone):** no — rclone has no backend for this. CiteFleet's existing **Push origin files** (commit to the attached GitHub repo) is the automation route, and `vercel.json` rewrites are the zero-commit alternative.
- **Docs consulted:** https://vercel.com/docs/functions/runtimes, https://vercel.com/docs/project-configuration/vercel-json, https://vercel.com/docs/builds/configure-a-build, https://vercel.com/docs/platforms/multi-tenant-platforms/serving-static-files, https://vercel.com/docs/domains/working-with-ssl, https://vercel.com/docs/domains/troubleshooting, https://vercel.com/kb/guide/using_vercel_as_a_cdn, https://nextjs.org/docs/app/api-reference/file-conventions/public-folder, https://go-acme.github.io/lego/dns/vercel/, fetched 2026-09-11

## Where the web root is

**There is no web root on a disk anyone can reach.** A Vercel site is built from a git
commit into an immutable deployment artifact and served from the CDN. The runtime
filesystem is read-only:

> "Vercel functions have a read-only filesystem with writable `/tmp` scratch space up to
> 500 MB."
> — https://vercel.com/docs/functions/runtimes (§ File system support)

`/tmp` is per-invocation scratch — it is not served to the public, and nothing written
there survives. There is no SFTP, no SSH, no file manager, and no way to add a file to a
deployment that already exists. Each deployment is immutable; a change means a new
deployment.

The equivalent of a web root is **a directory in the source tree that the build publishes
at `/`**:

| Project type | Directory whose contents land at `/` |
|---|---|
| Next.js | `public/` — "Files inside `public` can then be referenced by your code starting from the base URL (`/`)" (https://nextjs.org/docs/app/api-reference/file-conventions/public-folder) |
| Vite, Nuxt, Astro, SvelteKit, Remix, Gatsby, Create React App | `public/` (Astro and SvelteKit call it `public/` and `static/` respectively; check the framework) |
| "Other" framework preset, no build | `public/` if it exists, otherwise the repository root — "This sets the output directory as `public` if it exists or `.` (root directory of the project) otherwise" (https://vercel.com/docs/builds/configure-a-build) |
| Any | whatever **Output Directory** is set to in **Settings → Build and Deployment**; "Only the contents of this Output Directory will be served statically by Vercel" |

Vercel's own framework docs state the rule plainly for arbitrary files:
"`/vercel.svg` is automatically served when included in the `public/**` directory"
(https://vercel.com/docs/frameworks/backend/flask).

So for the overwhelmingly common case the answer is: **`public/` in the connected git
repo.** Five files committed there appear at `/robots.txt`, `/sitemap.xml`, `/llms.txt`,
`/.well-known/botcentral.txt` and `/<indexnow-key>.txt` on the next deploy.

## Steps to install the five files

There are two genuinely different routes. Route A is what CiteFleet already does; route B
is worth knowing because it needs no file content in the customer's repo at all.

### Route A — commit the files to the connected git repo (recommended)

This is exactly what CiteFleet's **Push origin files** button already does
(see [`docs/customer-setup.md`](../customer-setup.md): "If you attached your GitHub repo in
CiteFleet, **Push origin files** commits this file for you; deploy the site and it is
live.").

1. **Find the publish directory.** `public/` for almost every framework; confirm against
   **Settings → Build and Deployment → Output Directory** if the project is unusual, and
   against **Root Directory** if it is a monorepo (the app's root may not be the repo root).
2. **Commit the five files** under it:

   ```
   public/robots.txt
   public/sitemap.xml
   public/llms.txt
   public/.well-known/botcentral.txt
   public/<indexnow-key>.txt
   ```

3. **Check `.gitignore` and `.vercelignore`.** Both can silently drop what you just added —
   see [Gotchas](#gotchas). `.vercelignore` excludes files from the deployment even when
   they are committed (https://vercel.com/docs/deployments/vercel-ignore).
4. **Push to the production branch.** Vercel builds and the files are live at the apex. No
   cache purge step: the deployment is a new immutable artifact with its own URLs.
5. **Verify against the custom domain**, not the `*.vercel.app` preview URL.

For a **Next.js App Router** project, step 2 has a wrinkle: if the repo contains
`app/robots.ts` or `app/sitemap.ts`, those generate `/robots.txt` and `/sitemap.xml`
dynamically and collide with the static files. See [Gotchas](#gotchas).

### Route B — `vercel.json` rewrites pointing at CiteFleet (no file content committed)

Vercel rewrites accept an **external absolute URL** as the destination — this is
documented, not a trick:

> `destination` — "A location destination defined as an absolute pathname **or external
> URL**."
> — https://vercel.com/docs/project-configuration/vercel-json (Rewrite object definition)

The same page's own example proxies to another host:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/proxy/:match*", "destination": "https://example.com/:match*" }
  ]
}
```

and Vercel's knowledge base describes this as a supported product feature: "Vercel's
external rewrites let you proxy and cache content from external websites or APIs through
their global edge network" (https://vercel.com/kb/guide/using_vercel_as_a_cdn).

So CiteFleet can host the content and the customer commits four lines of config:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/robots.txt",  "destination": "https://citefleet.app/origin/<domain>/robots.txt" },
    { "source": "/sitemap.xml", "destination": "https://citefleet.app/origin/<domain>/sitemap.xml" },
    { "source": "/llms.txt",    "destination": "https://citefleet.app/origin/<domain>/llms.txt" },
    { "source": "/<indexnow-key>.txt", "destination": "https://citefleet.app/origin/<domain>/<indexnow-key>.txt" }
  ]
}
```

A **rewrite** proxies (the URL stays on the customer's domain, status 200) — this is what
you want. A **redirect** would also accept an external absolute URL —

```json
{ "redirects": [ { "source": "/view-source", "destination": "https://github.com/vercel/vercel" } ] }
```

— but it answers 308/307 and sends the crawler off-domain, which fails BotCentral's rule
that the proof must be served *at* the domain, and is wrong for `robots.txt` regardless.
**Use `rewrites`, not `redirects`.**

**The one path this cannot cover is `/.well-known/`.** See the next section — that is a
hard platform restriction, not an oversight.

Route B still requires a commit (of `vercel.json`) and a redeploy, so it is not
"unattended" either. What it buys is that the *content* stays under CiteFleet's control and
can change without the customer redeploying — which makes it the better route for a
sitemap that must stay fresh, and for a customer who does not want generated files in their
repo.

## The `.well-known/` problem

This is the decisive Vercel-specific finding, and it is documented twice:

> "The `/.well-known` path is reserved and cannot be redirected or rewritten. Only
> Enterprise teams can configure custom SSL."
> — https://vercel.com/docs/domains/working-with-ssl, repeated verbatim at
> https://vercel.com/docs/domains/troubleshooting (§ Rewriting or redirecting `/.well-known`)

The reason is Vercel's automatic Let's Encrypt issuance: for non-wildcard domains Vercel
uses the HTTP-01 challenge and "Vercel creates that file with the code on the HTTP-01 …
validation path", intercepting `/.well-known/acme-challenge/` requests itself.

Consequences, in order:

1. **Route B cannot serve `.well-known/botcentral.txt`.** A `vercel.json` rewrite on
   `/.well-known/botcentral.txt` is not honoured. Do not write one; it will appear to
   deploy cleanly and then do nothing.
2. **Committing `public/.well-known/botcentral.txt` is the only file-based option**, and
   whether Vercel serves it is **UNVERIFIED**. The reserved-path statement is about
   *redirects and rewrites*, and Vercel's own multi-tenant guide lists `/.well-known`
   alongside `/robots.txt` and `/llms.txt` as a static file path that should be allowed
   through to handlers
   (https://vercel.com/docs/platforms/multi-tenant-platforms/serving-static-files) — which
   implies the path is reachable by application code — but no official page states that a
   dotfile directory committed to `public/` is published. Searched: Vercel docs and KB for
   ".well-known", "apple-app-site-association", "public directory dotfiles", plus
   `/docs/builds/configure-a-build`, `/docs/project-configuration/vercel-json`,
   `/docs/functions/runtimes` and the multi-tenant static-files guide. Vercel's community
   forum reports it works but may answer behind a 308 — a forum thread is not an official
   doc, so it is not cited as one here.
3. **Therefore, on Vercel, prove control with the apex DNS TXT record**
   (`botcentral-verify=citefleet-app`). It sidesteps a reserved path, a possible 308, and a
   redeploy. If the customer also wants the file, commit it and then *verify the live URL
   returns 200 with `content-type: text/plain`* before claiming it works.

Note that `.well-known` is a dot-directory in **git**, not in a file manager, so the usual
"the file manager hides dotfiles" problem does not apply. Git tracks it fine. The risk is
build tooling, not the UI — see [Gotchas](#gotchas).

## Gotchas

**1. `/.well-known` is reserved.** Covered above. The single most important thing to know
about this host.

**2. Next.js App Router metadata files collide with `public/`.** Next.js generates
`/robots.txt` from `app/robots.ts` (or a static `app/robots.txt`) and `/sitemap.xml` from
`app/sitemap.ts` (https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots).
Next.js's own `public/` docs steer users away from `public/` for exactly these files:
"For static metadata files, such as `robots.txt`, `favicon.ico`, etc, you should use special
metadata files inside the `app` folder"
(https://nextjs.org/docs/app/api-reference/file-conventions/public-folder). If the repo has
both, one wins and the customer will not be told which. **Check for `app/robots.*` and
`app/sitemap.*` before committing to `public/`**; if they exist, edit those instead of
adding competing static files.

**3. Middleware / `proxy.ts` can swallow the requests.** On a Next.js site with middleware
(renamed `proxy.ts` in Next.js 16+), a catch-all matcher rewrites `/robots.txt` before the
static file is reached. Vercel documents the fix — allow the paths through explicitly:

```ts
const STATIC_FILE_PATHS = ['/robots.txt', '/sitemap.xml', '/llms.txt', '/.well-known'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (STATIC_FILE_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }
  // Your other logic
}
```

(https://vercel.com/docs/platforms/multi-tenant-platforms/serving-static-files — note that
Vercel's example list is *exactly* four of our five paths.)

**4. `.vercelignore` and `.gitignore` silently drop files.** An allowlist-style
`.vercelignore` (`/*` then `!api`, `!vercel.json`, …) excludes anything not re-allowed,
including `public/` — the pattern is straight out of Vercel's own docs
(https://vercel.com/docs/deployments/vercel-ignore). A `.gitignore` containing `*.txt` or
`.well-known` will drop the pack before it ever reaches Vercel. Check both.

**5. Root Directory in a monorepo.** If **Settings → Build and Deployment → Root Directory**
is set (e.g. `apps/web`), "your app will not be able to access files outside of that
directory", so the pack must go in `apps/web/public/`, not `public/`
(https://vercel.com/docs/builds/configure-a-build).

**6. A build step can rewrite the publish directory.** Some frameworks copy `public/` into
the output; some SSGs regenerate a `sitemap.xml` on every build and will overwrite a
hand-committed one. If the project already generates a sitemap, point `robots.txt` at the
generated URL rather than shipping a competing file.

**7. Verify on the custom domain.** Preview deployments are not indexed and a `*.vercel.app`
URL is not the domain BotCentral will check.

**8. Route B changes are cached at the edge.** External rewrites are proxied and cached;
Vercel's CDN guide describes controlling this with `CDN-Cache-Control` on the upstream
response (https://vercel.com/kb/guide/using_vercel_as_a_cdn). If CiteFleet serves the
origin pack, set a short `CDN-Cache-Control` (e.g. `s-maxage=300`) so an updated sitemap
propagates without the customer redeploying.

## `lego` DNS plugin (for the DNS TXT route)

Yes — `lego` ships a Vercel DNS provider, which matters here because the recommended proof
on this host is a DNS TXT record, and CiteFleet can write it automatically for any customer
whose domain uses **Vercel DNS / Vercel nameservers**.

| | |
|---|---|
| Provider code | `vercel` |
| Required env var | `VERCEL_API_TOKEN` — the authentication token |
| Optional | `VERCEL_TEAM_ID` (required in practice for a team-owned domain), `VERCEL_TTL` (default 60s), `VERCEL_HTTP_TIMEOUT` (30s), `VERCEL_POLLING_INTERVAL` (5s), `VERCEL_PROPAGATION_TIMEOUT` (60s) |
| File indirection | any variable may be suffixed `_FILE` to read the value from a path |

(https://go-acme.github.io/lego/dns/vercel/)

The token is an ordinary Vercel API token from the customer's account settings. It is
**account-scoped, not domain-scoped** — a token that can write one DNS record can also
read and change projects, deployments and other domains on that account. Ask for a token
only if the customer understands that; otherwise have them paste the TXT record by hand.
This only works when the domain's nameservers are Vercel's; a domain merely *pointed* at
Vercel with an A record has its DNS elsewhere and needs that registrar's provider instead.

## If files cannot be placed

1. **Apex DNS TXT record** — `botcentral-verify=citefleet-app`. The recommended primary on
   Vercel: no redeploy, no reserved-path problem, and it survives every rebuild. Scriptable
   with `lego`'s `vercel` provider when the domain uses Vercel DNS.
2. **`vercel.json` rewrites** (route B) for the four non-`.well-known` files, if the
   customer will accept a config commit but not generated content in their repo.
3. **A route handler** — on Next.js, `app/robots.ts` / `app/sitemap.ts` / an
   `app/llms.txt/route.ts` that returns CiteFleet's content, per Vercel's own
   serving-static-files guide. More code, but it is the documented pattern and it composes
   with the metadata-file conflict in Gotcha 2 instead of fighting it.
4. **Nothing else.** There is no upload path on Vercel. A customer with no git access and no
   DNS access cannot serve the pack from this host; the deployment is the only door.

## Sources

- https://vercel.com/docs/functions/runtimes — § File system support: "Vercel functions have a read-only filesystem with writable `/tmp` scratch space up to 500 MB." Confirms there is no writable, servable filesystem at runtime.
- https://vercel.com/docs/project-configuration/vercel-json — Rewrite object definition: `destination` is "A location destination defined as an absolute pathname **or external URL**"; worked external-proxy example (`/proxy/:match*` → `https://example.com/:match*`); redirects example to an absolute external URL (`https://github.com/vercel/vercel`, 308); `has`/`missing` conditions.
- https://vercel.com/docs/project-configuration — property table: `rewrites` "Route requests to different paths **or external URLs**".
- https://vercel.com/kb/guide/using_vercel_as_a_cdn — external rewrites "let you proxy and cache content from external websites or APIs"; `CDN-Cache-Control` on upstream responses controls edge caching of the proxied content.
- https://vercel.com/docs/domains/working-with-ssl — **the decisive quote**: "The `/.well-known` path is reserved and cannot be redirected or rewritten. Only Enterprise teams can configure custom SSL."; HTTP-01 challenge handled by Vercel intercepting the validation path.
- https://vercel.com/docs/domains/troubleshooting — § "Rewriting or redirecting `/.well-known`" repeats the reserved-path restriction verbatim.
- https://vercel.com/docs/platforms/multi-tenant-platforms/serving-static-files — lists `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known` as static file paths that proxy/middleware must let through, with the `STATIC_FILE_PATHS` code; "Truly static assets: Use `/public` for files that don't change per tenant"; content-type table; `CDN-Cache-Control` guidance.
- https://vercel.com/docs/builds/configure-a-build — "Only the contents of this **Output Directory** will be served statically by Vercel"; the "Other" preset "sets the output directory as `public` if it exists or `.` … otherwise"; Root Directory restricts access to files outside it.
- https://vercel.com/docs/frameworks/backend/flask — "`/vercel.svg` is automatically served when included in the `public/**` directory" — official confirmation that `public/**` publishes at the site root.
- https://nextjs.org/docs/app/api-reference/file-conventions/public-folder — "Files inside `public` can then be referenced by your code starting from the base URL (`/`)"; steers `robots.txt` etc. to `app/` metadata files instead; `public` assets get `Cache-Control: public, max-age=0`.
- https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots — static `app/robots.txt` vs generated `app/robots.js`/`.ts`; the collision source for Gotcha 2.
- https://vercel.com/docs/deployments/vercel-ignore — `.vercelignore` excludes files from a deployment; allowlist pattern (`/*` plus `!` re-includes) shown in Vercel's own example.
- https://go-acme.github.io/lego/dns/vercel/ — lego provider code `vercel`; required `VERCEL_API_TOKEN`; optional `VERCEL_TEAM_ID`, `VERCEL_TTL`, `VERCEL_HTTP_TIMEOUT`, `VERCEL_POLLING_INTERVAL`, `VERCEL_PROPAGATION_TIMEOUT`; `_FILE` suffix supported.
**UNVERIFIED on this host:** whether a `public/.well-known/botcentral.txt` committed to the
repo is actually served (see [The `.well-known/` problem](#the-well-known-problem) for
exactly what was searched). Treat DNS TXT as the proof and test the file URL if you ship it.
