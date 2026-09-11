# Wix

- **Market share:** 4.2% of all websites (W3Techs, 2026-09-11)
- **Category:** SaaS site builder
- **File access:** admin UI only (dashboard editors + public REST API); no filesystem
- **Automatable by the CiteFleet script (rclone):** no — but Wix has a **public REST
  API for exactly these files** (`robots.txt` and `llms.txt` both have GET/UPDATE
  endpoints). Best automation story of the five SaaS builders.
- **Docs consulted:** https://support.wix.com/en/article/editing-your-sites-robotstxt-file,
  https://dev.wix.com/docs/api-reference/business-management/marketing/seo/txt-file-server/robots-txt/update-robots-txt,
  https://dev.wix.com/docs/api-reference/business-management/marketing/seo/txt-file-server/llms-txt,
  https://support.wix.com/en/article/understanding-your-sites-llmstxt-file,
  https://support.wix.com/en/article/understanding-your-sites-sitemap-file,
  https://support.wix.com/en/article/request-adding-a-txt-file-to-the-top-level-domain-for-google-analytics-verification,
  https://support.wix.com/en/article/setting-up-a-301-redirect-for-a-page-on-your-site,
  https://support.wix.com/en/article/how-wix-uses-indexnow-to-inform-search-engines-about-your-site-changes,
  fetched 2026-09-11

## Where the web root is

There is no web root. Wix serves the site from its own infrastructure. Wix does,
however, expose a named "TXT File server" that owns three specific root files —
`/robots.txt`, `/llms.txt` and `/ads.txt` — each with a dashboard editor **and** a
public REST API. Nothing else can be placed at the root: Wix states flatly that
adding an arbitrary `.txt` file to the top-level domain is "currently not possible."

## Steps to install the five files

### 1. `robots.txt` — yes, fully editable, and scriptable

Dashboard: **SEO & GEO** → scroll to **Tools and settings** → **Robots.txt Editor**
→ **View File** → write the directives under "This is your current file" → **Save
Changes** → **Save**. There is a **Reset to Default** button on the same screen.

The editor presents the whole file as one text field, so an edit **replaces** the
content rather than merging. Wix nonetheless keeps touching it: "If you need to
update a page, Wix automatically updates your robots.txt after you publish the
page. If you change your site's settings, your robots.txt file is updated
immediately." The precise merge semantics after a manual edit are **UNVERIFIED** —
the help article does not say what Wix's automatic updates do to a customised file.
Searched: the Robots.txt Editor article and the Robots Txt API introduction; neither
states it.

API (this is the good part):

```
PUT https://www.wixapis.com/promote-seo-robots-server/v2/robots
Authorization: <token>
Content-Type: application/json;charset=UTF-8

{ "robotsTxt": { "content": "User-agent: *\nAllow: /\nSitemap: …",
                 "default": false,
                 "subdomain": "www" } }
```

- Scope: `SCOPE.PROMOTE.MANAGE-SEO` ("Manage SEO Settings").
- `content` max length 720 000 chars.
- Setting `default: true` and omitting `content` restores Wix's default.
- `subdomain` (default `www`) — each subdomain gets its own robots.txt.
- There is a matching `GET` (Get Robots Txt) and a `Robots Txt Updated` webhook.
- JS SDK equivalent: `wixClientAdmin.seo.robotsTxt.updateRobotsTxt(options)` from
  `@wix/seo`.

### 2. `sitemap.xml` — cannot be replaced; declare an extra one instead

`/sitemap.xml` is auto-generated and auto-updated on every site change. It is a
sitemap **index**; Wix adds individual sitemaps per page type (Stores products,
Blog posts, …). There is no documented way to edit it, upload one, or register a
second sitemap file. Wix publishes explicit "not possible" articles for adjacent
requests (dynamic HTML sitemap, video sitemaps, Ecwid product URLs).

Workaround: put a `Sitemap: https://…` line in the robots.txt (editor or API)
pointing at a CiteFleet-hosted sitemap.

### 3. `llms.txt` — yes, natively, with an editor and an API

Wix auto-generates and maintains `/llms.txt`, regenerated daily, and lets the owner
override it.

Dashboard: **SEO & GEO** → **Tools and settings** → **Go to llms.txt**.
Editing it takes it off auto-update — "Once you edit the file, it will stop updating
automatically so your changes are preserved" — and there is a **Reset to Default**.
A toggle, **Use your llms.txt file**, opts the site out entirely.

Requirements: "Upgrade your site and connect a custom domain" and "Enable search
engine indexing for your site". So a free `*.wixsite.com` site cannot do this.

API:

```
PUT https://www.wixapis.com/promote-seo-robots-server/v2/llms
Authorization: <token>
Content-Type: application/json;charset=UTF-8

{ "llmsTxt": { "content": "# My Site\n\n> …",
               "default": false,
               "manuallyEdited": true,
               "subdomain": "www" } }
```

- Scope: `SCOPE.PROMOTE.MANAGE-SEO`, same as robots.txt.
- `content` max length 720 000 chars; `default: true` with no `content` restores Wix's.
- **`manuallyEdited` is a latch.** Wix: "Whether the content was manually edited by
  the user. If `true` in DB, update/append requests must also set
  `manually_edited=true` or they'll be rejected with `FAILED_PRECONDITION`." So once
  anyone edits the file (in the dashboard or via the API), every subsequent
  CiteFleet write must carry `manuallyEdited: true` or it fails.
- `hidden` is read-only here; flip it with **Update Llms Txt Hidden Status**.
- `detectedLanguage` (ISO 639-1) localises the MCP documentation section Wix injects.
- Also available: **Get Llms Txt** and **Append Llms Txt** — `Append` lets CiteFleet
  add its block without clobbering Wix's generated content.
- JS SDK: `wixClientAdmin.seo.llmsTxt.updateLlmsTxt(options)` from `@wix/seo`.

**Docs inconsistency worth noting:** Wix's own reference gives the URL as
`.../promote-seo-robots-server/v2/llms` in the schema block but
`.../promote-seo-txt-file-server/v2/llms` in the curl example — and the same
mismatch appears on the robots.txt page (`promote-seo-robots-server` vs
`promote-seo-txt-file-server`). Which host path is live is **UNVERIFIED**; try the
schema value first and fall back to the example value.

### 4. `.well-known/botcentral.txt` — not possible. Use DNS TXT.

Wix has no facility to create files or directories at the root, and no `.well-known`
mechanism is documented. Searched: Wix support for `.well-known`, Apple Pay domain
association, and domain verification files — nothing. Wix's Apple Pay support goes
through Wix Payments, with the domain association handled by Wix, not the owner.

**Not a blocker.** Use the apex DNS TXT record. For a Wix-managed domain: Wix
account → **Domains** → the **Domain Actions** icon → **Manage DNS Records** → TXT
section → **+ Add Record** → leave the host field blank for the apex (Wix: "Leave
this field blank if you were instructed to add an **@** sign") → paste the value →
**Save**. If the domain is only *pointed* at Wix, the TXT must be added at the
registrar instead.

### 5. IndexNow key file — not needed; Wix does IndexNow for you

Wix is an IndexNow partner. "Wix checks when there are changes to your site pages.
We then submit the changes on your behalf to the IndexNow protocol," and "The
IndexNow benefits and features are automatically included as part of your Premium
plan" — on by default, no setup, no key file for the owner to host.

Consequence for CiteFleet: a **customer-owned** IndexNow key cannot be installed
(no root file, and the URL Redirect Manager route is untested — see Gotchas), but
the *function* IndexNow provides is already running. Whether the owner can supply
their own key is **UNVERIFIED**; the help article does not mention custom keys.
Premium plan required — free sites get nothing.

## The `.well-known/` problem

Moot. No mechanism exists, and none is needed: the apex DNS TXT record proves the
same thing and BotCentral scores it higher.

## Gotchas

- **Editing `llms.txt` freezes it.** After a manual edit Wix stops regenerating it
  daily, so new pages will never appear in it. Use **Append Llms Txt** via the API
  instead of a full replace if the auto-generated body still has value —
  though whether Append preserves auto-regeneration is **UNVERIFIED**.
- **The `manuallyEdited` latch bites once.** After the first manual edit, any API
  write that omits `manuallyEdited: true` is rejected with `FAILED_PRECONDITION`.
  A CiteFleet integration should always send it.
- **Free sites are locked out.** Both the llms.txt editor and 301 redirects require
  a Premium plan with a connected custom domain. "301 redirects only work with
  custom domains. You can't set up a 301 redirect from free Wix URLs to a Premium
  site." IndexNow is Premium-only too.
- **Wix keeps rewriting robots.txt** after page publishes and settings changes. A
  CiteFleet-added `Sitemap:` line could plausibly be lost on one of those rewrites;
  worth re-reading via the GET endpoint after any site change.
- **Subdomains each have their own robots.txt** (`subdomain` field, default `www`).
  Setting it on `www` does not set it on `es.example.com`.
- **The URL Redirect Manager is not a file server.** It can redirect `/llms.txt` to
  an external URL (**SEO & GEO** → **Tools and settings** → **URL Redirect Manager**
  → **+ New Redirect** → **Single redirect**; "For external pages: Enter the entire
  URL that you want to redirect to"; old URL is a path like `/about-us`; limit 5 000
  redirects per site; CSV import up to 500 at a time). But `/llms.txt` is already
  served natively by Wix, so redirecting it is both unnecessary and likely to be
  shadowed. For an IndexNow key file the redirect would be the only route, and
  whether IndexNow follows a cross-host redirect on the key file is **UNVERIFIED** —
  indexnow.org's documentation does not address redirects.
- **DNS records only work for Wix-connected domains.** "If your domain is connected
  to Wix via pointing, you must add or update TXT records with your domain host (not
  Wix)."

## If files cannot be placed

Achievable: `robots.txt` (editor + API, full control) and `llms.txt` (editor + API,
full control, Premium + custom domain required). `sitemap.xml` is not replaceable —
declare a CiteFleet-hosted sitemap from robots.txt. `.well-known/botcentral.txt` →
apex DNS TXT record. IndexNow key file → not installable, and not needed because
Wix runs IndexNow natively on Premium plans.

## Automation

Wix is the most automatable provider in this category. The **TXT File server** API
package (`dev.wix.com/docs/api-reference/business-management/marketing/seo/txt-file-server`)
contains three groups:

| Group | Methods |
|---|---|
| Robots Txt | Get Robots Txt, Update Robots Txt, `Robots Txt Updated` webhook |
| Llms Txt | Get Llms Txt, Update Llms Txt, Append Llms Txt, Update Llms Txt Hidden Status |
| Ads Txt | Get Ads Txt, Update Ads Txt, Append Ads Txt, `Ads Txt Updated` webhook |

A CiteFleet Wix app holding `SCOPE.PROMOTE.MANAGE-SEO` can install and maintain both
`robots.txt` and `llms.txt` unattended, and the `Robots Txt Updated` webhook gives a
way to detect Wix overwriting a CiteFleet edit. No API exists for the sitemap.

## Sources

- https://support.wix.com/en/article/editing-your-sites-robotstxt-file — path **SEO & GEO** → **Tools and settings** → **Robots.txt Editor** → **View File** → **Save Changes** → **Save**; **Reset to Default**; "Wix automatically updates your robots.txt after you publish the page"; "If you change your site's settings, your robots.txt file is updated immediately."
- https://dev.wix.com/docs/api-reference/business-management/marketing/seo/txt-file-server/robots-txt/update-robots-txt — `PUT https://www.wixapis.com/promote-seo-robots-server/v2/robots`; scope `SCOPE.PROMOTE.MANAGE-SEO`; `robotsTxt.content` (max 720000), `default`, `subdomain` (default `www`); `default: true` + no `content` restores Wix's default; JS SDK `wixClientAdmin.seo.robotsTxt.updateRobotsTxt`.
- https://dev.wix.com/docs/api-reference/business-management/marketing/seo/txt-file-server.md — package index confirming the Robots Txt, Llms Txt and Ads Txt groups and their method names.
- https://dev.wix.com/docs/api-reference/business-management/marketing/seo/txt-file-server/llms-txt/update-llms-txt.md — `PUT https://www.wixapis.com/promote-seo-robots-server/v2/llms` (curl example shows `promote-seo-txt-file-server`); scope `SCOPE.PROMOTE.MANAGE-SEO`; fields `content` (max 720000), `default`, `subdomain`, `manuallyEdited`, `detectedLanguage`, read-only `hidden`; "If `true` in DB, update/append requests must also set `manually_edited=true` or they'll be rejected with `FAILED_PRECONDITION`."
- https://support.wix.com/en/article/understanding-your-sites-llmstxt-file — path **SEO & GEO** → **Tools and settings** → **Go to llms.txt**; auto-generated and regenerated daily; "Once you edit the file, it will stop updating automatically so your changes are preserved"; **Reset to Default**; **Use your llms.txt file** opt-out toggle; requires "Upgrade your site and connect a custom domain" and "Enable search engine indexing for your site".
- https://support.wix.com/en/article/understanding-your-sites-sitemap-file — sitemap auto-generated at `/sitemap.xml`, auto-updated, sitemap index with one sitemap per page type.
- https://support.wix.com/en/article/accessibility-request-creating-a-dynamic-html-sitemap — "not possible to create a dynamic HTML sitemap."
- https://support.wix.com/en/article/request-adding-video-sitemaps — video sitemaps not possible.
- https://support.wix.com/en/article/request-adding-a-txt-file-to-the-top-level-domain-for-google-analytics-verification — "it's currently not possible to add this kind of file to your Wix site"; workaround is a meta tag. This is the authoritative "no arbitrary root files" statement.
- https://support.wix.com/en/article/setting-up-a-301-redirect-for-a-page-on-your-site — **SEO & GEO** → **Tools and settings** → **URL Redirect Manager** → **+ New Redirect** → **Single redirect**; old URL as a path (e.g. `/about-us`); "For external pages: Enter the entire URL that you want to redirect to"; "301 redirects only work with custom domains"; 5 000 redirect limit.
- https://support.wix.com/en/article/importing-or-exporting-url-redirects-with-a-csv-file — CSV import of up to 500 redirects at a time.
- https://support.wix.com/en/article/how-wix-uses-indexnow-to-inform-search-engines-about-your-site-changes — "Wix checks when there are changes to your site pages. We then submit the changes on your behalf to the IndexNow protocol"; "The IndexNow benefits and features are automatically included as part of your Premium plan"; Premium-only.
- https://support.wix.com/en/article/adding-or-updating-txt-records-in-your-wix-account — **Domains** → **Domain Actions** → **Manage DNS Records** → TXT → **+ Add Record**; "Leave this field blank if you were instructed to add an **@** sign"; pointed domains must set TXT at the registrar.
- https://www.indexnow.org/documentation — key file at the root; `keyLocation` limits valid URLs to the key file's directory prefix; redirect handling not addressed.
