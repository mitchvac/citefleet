# Webflow

- **Market share:** 0.8% of all websites (W3Techs, 2026-09-11)
- **Category:** SaaS site builder
- **File access:** admin UI only (Site settings + Assets panel); no filesystem —
  but Webflow exposes a purpose-built slot for every file in the origin pack except
  the IndexNow key
- **Automatable by the CiteFleet script (rclone):** no. Partly automatable by the
  **Webflow Data API** — `.well-known` files via the Assets API (any plan with the
  feature), `robots.txt` via a **Enterprise-only** endpoint. No API for
  `sitemap.xml` or `llms.txt`.
- **Docs consulted:** https://help.webflow.com/hc/en-us/articles/41954080897683-Set-robots-txt-rules,
  https://help.webflow.com/hc/en-us/articles/33961355371667-Create-a-sitemap-in-Webflow,
  https://help.webflow.com/hc/en-us/articles/43240104183315-Upload-an-llms-txt-file-to-your-site,
  https://help.webflow.com/hc/en-us/articles/36293473743123-Upload-a-well-known-file,
  https://help.webflow.com/hc/en-us/articles/33961294898835-How-do-I-set-up-redirects-in-Webflow,
  https://developers.webflow.com/data/reference/enterprise/site-configuration/robots-txt/put,
  https://developers.webflow.com/data/reference/assets/assets/create,
  fetched 2026-09-11

## Where the web root is

There is no directory, but Webflow has the best set of root-path hooks of any SaaS
builder in this batch — it is the only one that will serve a customer-supplied
`.well-known/` directory and the only one that will accept a hand-written
`sitemap.xml`:

| Root path | Control |
|---|---|
| `/robots.txt` | full text field, **Site settings → SEO → Indexing** |
| `/sitemap.xml` | auto-generate **or** paste your own XML |
| `/llms.txt` | upload a file, **Site settings → SEO → LLMs.txt** |
| `/.well-known/*` | upload files to a `well-known` folder in the **Assets panel** |
| any other root path | not possible |

Everything below requires publishing, and **none of it appears on the
`*.webflow.io` staging domain** — only on the connected custom domain.

## Steps to install the five files

### 1. `robots.txt` — yes, fully editable

1. **Site settings** → **SEO** → **Indexing**.
2. Add the `robots.txt` rules you want (`User-agent:`, `Allow:`, `Disallow:`,
   `Sitemap:`, and Webflow also documents a `Content-Signal:` directive, e.g.
   `Content-Signal: ai-train=no, search=yes, ai-input=no`).
3. Click **Save** and **publish** the site.

Note on the sitemap line: "Webflow adds a link to your sitemap in your `robots.txt`
by default." If you add your own `Sitemap:` line as well, the file will list two
sitemaps. To suppress Webflow's, toggle **Remove sitemap.xml from robots.txt** to
**On** — but "Removing the default `sitemap.xml` address from your site's
`robots.txt` file requires a **paid Site plan**."

Whether the text you type is merged into Webflow's generated file or replaces it
wholesale is **UNVERIFIED** — the help article describes the field as where you
"add rules", and separately documents that Webflow injects the sitemap line, which
implies a merge, but it never says so outright. Searched: the Webflow Help Center
for "robots.txt" (5 articles) and the Data API robots.txt reference; neither states
it. Note the API models robots.txt as **structured rules** (`rules[].userAgent`,
`allows[]`, `disallows[]`, plus a single `sitemap` string), not as free text — which
is a strong hint the UI field is also structured and that Webflow composes the final
file. Verify on a live site before promising byte-for-byte control.

### 2. `sitemap.xml` — **yes, a custom sitemap can be pasted in**

This is unusual and worth calling out: Webflow is the only provider in this batch
that accepts a hand-written sitemap.

To use your own:

1. **Site settings** → **SEO** tab → **Sitemap** section.
2. Toggle **Auto-generate sitemap** to **"No"**.
3. Paste your XML into the **Custom sitemap.xml** field.
4. **Save changes** and **publish**.

To keep Webflow's generated one instead, toggle **Auto-generate sitemap** to
**"Yes"** — it regenerates on every publish, includes `<lastmod>` per URL, and adds
`hreflang` tags when Localize is enabled. If you switch to a custom sitemap on a
Localize site, "you'll need to manually add hreflang tags for each page."

Caveat: "It isn't possible to delete the `/sitemap.xml` page once you've created
your sitemap and published your site."

### 3. `llms.txt` — yes, an actual file upload

1. **Site settings** → **SEO** → **LLMs.txt**.
2. Click **Upload file**.
3. Choose your `llms.txt` — "must be UTF-8 encoded and under 100 KB".
4. Click **Save changes**, then publish.

"After publishing your site, the file will be available at
`https://example.com/llms.txt`. Note that it won't be published to your Webflow
staging domain."

Webflow's implementation is "intentionally scoped to the `llms.txt` file itself" —
it does not generate the `.html.md` per-page variants the spec proposes.

### 4. `.well-known/botcentral.txt` — **yes, this actually works on Webflow**

Webflow is the only provider in this batch with a real `.well-known` mechanism:

1. Open the **Assets panel** (left toolbar, or press **J**).
2. Create a new folder named **`well-known`** (no leading dot).
3. Upload `botcentral.txt` into that folder.
4. **Publish** your site.

"When you publish, Webflow automatically moves all files from the well-known folder
to your site's `/.well-known/` directory." Nested subfolders work too — a file in
`well-known/agent-skill-api-catalog/` is served at
`/.well-known/agent-skill-api-catalog/`.

Restrictions, verbatim:

- Files "must be `.json`, `.txt`, or `.md` files."
- "Maximum file size: 100KB"
- "Maximum number of files: 30"
- "Available on Premium Site plans (and legacy Business Site plans) or higher"
- "Not available on webflow.io staging domains"
- "Cache invalidation occurs on publish to ensure changes are reflected immediately"

`botcentral.txt` is a `.txt`, so no extension gymnastics are needed. (For a file that
must have *no* extension, Webflow's `.noext` convention applies:
`my-file.noext.txt` is served as `/.well-known/my-file`.)

One trap: "Webflow checks file content when determining duplicates during asset
uploads. If two files have the same content, they're treated as identical even if
their names or extensions differ" — so uploading a second file with byte-identical
content **replaces** the first instead of creating a new one.

**Even so, still prefer the apex DNS TXT record** — BotCentral scores it higher, and
the Webflow route costs a Premium Site plan and one of the 30 file slots.

### 5. IndexNow key file — not possible at the root

There is no mechanism for an arbitrary root path. The three near-misses:

- **`.well-known/<key>.txt`.** Technically easy on Webflow, but IndexNow's
  `keyLocation` then restricts valid URLs to those beginning with
  `https://example.com/.well-known/` — useless for the site's real pages. Dead end.
- **301 redirect** from `/<key>.txt`. **Site settings** → **Publishing** →
  **301 redirects** → **Old path** `/<key>.txt` → **Redirect to path** → **Add
  redirect path** → publish. Requires a paid Site plan (or a paid Workspace plan).
  Whether **Redirect to path** accepts a full external URL on another domain is
  **UNVERIFIED** — every example in the article is a same-site path, and the
  cross-domain case it describes is redirecting a whole *old domain* into Webflow,
  not the reverse. Whether IndexNow follows a cross-host redirect for the key file
  is also **UNVERIFIED** (indexnow.org's documentation does not address redirects).
- **Reverse proxy.** If the customer already fronts Webflow with Cloudflare or
  NGINX, they can serve the key file (and anything else) themselves at the real
  root. Webflow documents this pattern explicitly, including NGINX config for
  self-hosting `robots.txt` and `sitemap.xml`:
  ```nginx
  location = /robots.txt  { proxy_pass https://app.example.com; }
  location = /sitemap.xml { proxy_pass https://app.example.com; }
  ```
  Requires a paid Site plan, a dedicated Webflow origin subdomain (e.g.
  `wf.example.com`) as the default domain, and "Webflow does not configure or support
  third-party proxies". This is the escape hatch that makes every file possible, at
  the cost of the customer running their own edge.

No native IndexNow. Searched the Webflow Help Center for "IndexNow" — one irrelevant
hit ("Webflow staging subdomain").

## The `.well-known/` problem

Solved on Webflow, unusually — see step 4. The customer creates a folder literally
named `well-known` in the Assets panel and Webflow renames it to `.well-known/` at
publish time. Premium Site plan or higher, `.json`/`.txt`/`.md` only, 100 KB and 30
files. The apex DNS TXT record is still the better choice (higher BotCentral score,
no plan requirement), but Webflow is the one provider here where the file route is
genuinely open.

## Gotchas

- **Nothing lands on the staging domain.** `llms.txt` and `.well-known/*` are both
  documented as not served on `*.webflow.io`. Testing on staging will show a 404 and
  look like failure.
- **Everything needs a publish.** Saving in Site settings is not enough; the file
  appears only after the site is published.
- **Plan gates.** `.well-known` needs **Premium Site plan (or legacy Business) or
  higher**. 301 redirects need a paid Site plan or paid Workspace plan. Removing
  Webflow's default sitemap line from robots.txt needs a paid Site plan.
- **Two sitemaps by accident.** Webflow auto-inserts its `Sitemap:` line. Add your
  own without toggling **Remove sitemap.xml from robots.txt** and the file advertises
  two sitemaps — which is legal but usually not what was intended.
- **`/sitemap.xml` is permanent.** Once created and published it cannot be deleted.
- **Duplicate-content asset dedupe** silently replaces an existing `.well-known` file
  when a new upload has identical bytes.
- **The robots.txt API is Enterprise-only** and is rule-structured, not free text —
  so an exact-text robots.txt may not be achievable programmatically.
- **Reverse-proxy origin subdomain leaks into the sitemap.** If `wf.example.com` is
  set as the default domain, the auto-generated robots.txt and sitemap point at that
  subdomain. Webflow's fix: turn on **Auto-generate sitemap**, set **Global canonical
  URL** to the public site URL, and turn on **Use your global canonical URL as the
  base URL for each sitemap.xml entry**.

## If files cannot be placed

They can — four of the five, natively:

| File | Mechanism |
|---|---|
| `robots.txt` | Site settings → SEO → Indexing |
| `sitemap.xml` | Site settings → SEO → Sitemap → Custom sitemap.xml |
| `llms.txt` | Site settings → SEO → LLMs.txt → Upload file |
| `.well-known/botcentral.txt` | Assets panel → `well-known` folder (Premium+), or apex DNS TXT |
| `<key>.txt` (IndexNow) | **not possible** without a customer-run reverse proxy |

Webflow is the strongest SaaS builder in this batch. Only the IndexNow key file
fails, and it fails on every provider here.

## Automation

Webflow Data API v2, base `https://api.webflow.com/v2`:

- **`.well-known` files — the practical automation win.**
  `POST /v2/sites/{site_id}/asset_folders` (`assets:write`) with
  `{ "displayName": "well-known" }` creates the folder, then
  `POST /v2/sites/{site_id}/assets` (`assets:write`) with
  `{ fileName, fileHash (MD5), parentFolder }` returns an `uploadUrl` plus S3
  `uploadDetails` to POST the bytes to. Then `POST` the **Publish Site** endpoint.
- **`robots.txt` — Enterprise only.**
  `PUT /v2/sites/{site_id}/robots_txt`, scope `site_config:write`, body
  `{ "rules": [{ "userAgent", "allows": [], "disallows": [] }], "sitemap": "https://…" }`.
  Webflow states plainly: "This endpoint requires an Enterprise workspace." Also
  available: `GET`, `PATCH` (update), `DELETE`. Note the structured shape — one
  `sitemap` string, no free text.
- **301 redirects — Enterprise only**, under the same Site Configuration group
  (`GET`/`POST`/`PATCH`/`DELETE` on `301-redirects`).
- **No endpoint** for `sitemap.xml` or `llms.txt`. Checked the complete Data API v2
  reference index — the only SEO-adjacent endpoints are the Enterprise
  robots.txt/301-redirect ones. Those two files are admin-UI-only.

So a non-Enterprise CiteFleet integration can automate `.well-known` and nothing
else; `robots.txt`, `sitemap.xml` and `llms.txt` need either an Enterprise workspace
or a human in Site settings.

## Sources

- https://help.webflow.com/hc/en-us/articles/41954080897683-Set-robots-txt-rules — "Go to **Site settings** > **SEO** > **Indexing**", add rules, "Click **Save** and publish your site"; `Sitemap: https://yourdomain.com/sitemap.xml`; "Webflow adds a link to your sitemap in your `robots.txt` by default. You can remove your sitemap from your `robots.txt` by toggling **Remove sitemap.xml from robots.txt** to **on**"; `Content-Signal: ai-train=no, search=yes, ai-input=no`.
- https://help.webflow.com/hc/en-us/articles/33961355371667-Create-a-sitemap-in-Webflow — **Site settings** > **SEO** > **Sitemap**; **Auto-generate sitemap** Yes/No; "Paste your custom sitemap in the **Custom sitemap.xml** field"; "It isn't possible to delete the `/sitemap.xml` page once you've created your sitemap and published your site"; "Removing the default `sitemap.xml` address from your site's `robots.txt` file requires a **paid Site plan**"; `<lastmod>` tags; hreflang with Localize.
- https://help.webflow.com/hc/en-us/articles/43240104183315-Upload-an-llms-txt-file-to-your-site — "Go to your **Site settings** > **SEO** > **LLMs.txt**", "Click **Upload file**", "must be UTF-8 encoded and under 100 KB", "Click **Save changes**"; "After publishing your site, the file will be available at https://example.com/llms.txt. Note that it won't be published to your Webflow staging domain"; scoped to the llms.txt file itself, no `.html.md` variants.
- https://help.webflow.com/hc/en-us/articles/36293473743123-Upload-a-well-known-file — Assets panel → folder named "well-known" → upload → publish; "When you publish, Webflow automatically moves all files from the well-known folder to your site's /.well-known/ directory"; subfolders; "must be `.json`, `.txt`, or `.md` files"; "Maximum file size: 100KB"; "Maximum number of files: 30"; "Available on Premium Site plans (and legacy Business Site plans) or higher"; "Not available on webflow.io staging domains"; the `.noext` convention; duplicate-content dedupe.
- https://help.webflow.com/hc/en-us/articles/33961269934227-Assets-panel — supported document types include TXT and CSV; "A paid Workspace or Site plan is required to upload documents"; 10MB document limit; filenames under 100 characters; pro tip pointing at the well-known folder feature.
- https://help.webflow.com/hc/en-us/articles/33961294898835-How-do-I-set-up-redirects-in-Webflow — **Site settings** > **Publishing** > **301 redirects**; **Old path** / **Redirect to path** / **Add redirect path**; "To add 301 redirects, your site needs a paid Site plan, or it must be part of a Workspace with a paid Workspace plan"; ~1,000 redirect best-practice ceiling; capture groups `(.*)` / `%1`; every destination example is a same-site path.
- https://help.webflow.com/hc/en-us/articles/49835650986259-Set-up-a-self-managed-reverse-proxy-in-Webflow — reverse proxy pattern, origin subdomain, "Webflow does not configure or support third-party proxies", the NGINX `location = /robots.txt` / `location = /sitemap.xml` self-hosting snippet, and the canonical-URL sitemap fix.
- https://help.webflow.com/hc/en-us/articles/40846212086035-Webflow-Cloud-overview — Webflow Cloud hosts full-stack apps mounted to a path or subdomain; not a root static-file mechanism; custom-domain mounting unavailable on Starter/Basic.
- https://developers.webflow.com/data/reference/enterprise/site-configuration/robots-txt/put — `PUT https://api.webflow.com/v2/sites/{site_id}/robots_txt`; "This endpoint requires an Enterprise workspace"; scope `site_config:write`; body `rules[].userAgent` / `allows` / `disallows` and a single `sitemap` string.
- https://developers.webflow.com/data/reference/assets/asset-folders/create-folder — `POST https://api.webflow.com/v2/sites/{site_id}/asset_folders`, scope `assets:write`, body `displayName` (+ optional `parentFolder`).
- https://developers.webflow.com/data/reference/assets/assets/create — `POST https://api.webflow.com/v2/sites/{site_id}/assets`, scope `assets:write`, body `fileName` / `fileHash` (MD5) / `parentFolder`; returns `uploadUrl` + `uploadDetails` for the S3 POST.
- https://developers.webflow.com/data/v2.0.0/reference/llms.txt — the complete Data API v2 endpoint index; confirms Sites, Assets, Asset Folders, Publish Site, and the Enterprise-only robots.txt and 301-redirect endpoints, and the absence of any sitemap or llms.txt endpoint.
- https://www.indexnow.org/documentation — key file at the root; `keyLocation` limits valid URLs to the key file's directory prefix; redirect handling not addressed.
