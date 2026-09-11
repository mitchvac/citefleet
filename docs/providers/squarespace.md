# Squarespace

- **Market share:** 2.4% of all websites (W3Techs, 2026-09-11)
- **Category:** SaaS site builder
- **File access:** admin UI only; no filesystem, no SFTP, no root file placement
- **Automatable by the CiteFleet script (rclone):** no. Also **not automatable by API** —
  Squarespace's public APIs are commerce-only; there is no site-settings or SEO API.
  Everything below is a manual admin-panel step.
- **Docs consulted:** https://support.squarespace.com/hc/en-us/articles/206543207-Understanding-Google-SEO-emails-and-console-errors,
  https://support.squarespace.com/hc/en-us/articles/47434125611277-Create-an-llms-txt-file,
  https://support.squarespace.com/hc/en-us/articles/206543547-View-your-site-map,
  https://support.squarespace.com/hc/en-us/articles/205815308-URL-mappings,
  https://support.squarespace.com/hc/en-us/articles/205812748-Image-and-file-URLs-in-Squarespace,
  https://developers.squarespace.com/commerce-apis/overview,
  fetched 2026-09-11

## Where the web root is

There is no web root, and Squarespace is the most closed of the five SaaS builders.
The only root paths a customer can influence at all are:

| Root path | Control |
|---|---|
| `/robots.txt` | **none** — shared platform file; only an AI-crawler checkbox nudges it |
| `/sitemap.xml` | **none** — auto-generated, "You can't edit the sitemap" |
| `/llms.txt` | **full** — a text field in SEO Settings (version 7.1 only) |
| `/ads.txt` | full — a text field in Settings → Website (precedent, not needed here) |
| anything else | impossible |

Uploaded files do not land on the customer's domain at all. They are served from
`images.squarespace-cdn.com`, `static.squarespace.com` or `static1.squarespace.com`,
and Squarespace states "it's not possible to customize or redirect a static asset URL."

## Steps to install the five files

### 1. `robots.txt` — **cannot be edited**

Squarespace's own words: "**All Squarespace sites use the same robots.txt file and
Squarespace users can't access or edit the file.**" There is no editor, no upload,
no API.

The only lever is one checkbox: **Settings → Crawlers → Block known artificial
intelligence crawlers**. Ticking it makes Squarespace add `Disallow` directives for
a fixed list of about 25 named AI bots (ClaudeBot, GPTBot, Amazonbot,
Applebot-Extended, Google-Extended and others). It is **unchecked by default**. It
is a blunt on/off switch — the customer cannot choose which bots, cannot add
`Allow` rules, and **cannot add a `Sitemap:` line**.

Consequence for CiteFleet: the robots.txt half of the origin pack simply cannot be
delivered on Squarespace. This also kills the usual fallback of declaring an
externally hosted sitemap from robots.txt.

### 2. `sitemap.xml` — cannot be edited or replaced

Auto-generated at `https://www.yourdomain.com/sitemap.xml` (or
`https://sitename.squarespace.com/sitemap.xml` on the built-in domain). Squarespace:
"Squarespace automatically generates a list of your site's URLs and image metadata,
so you don't need to create one manually," and "**You can't edit the sitemap or a
page's source code.**"

No page-level exclusion control either; Squarespace decides what is omitted
(disabled pages, password-protected pages, pages hidden from search).

And because robots.txt is not editable, there is no way to declare a second,
CiteFleet-hosted sitemap. **Both** sitemap routes are closed.

### 3. `llms.txt` — yes, fully custom (version 7.1 only)

1. Open the **SEO/AI Visibility** panel.
2. Click **SEO Settings**, then the **LLMS.txt** tab.
3. Type or paste the file contents into the text field (the file is **disabled by
   default** — adding text is what enables it).
4. Click **Save**.

The content is entirely the customer's — nothing is auto-generated. Squarespace:
"An llms.txt file is a plain Markdown file on your site that helps ensure
large-language models (LLMs) and other AI assistants accurately reflect your site
content," and "**You can create an llms.txt file on version 7.1 sites.**"

Version 7.0 sites: **not available**. Clearing the text field and saving deletes it.

The article does not state the serving URL. It is almost certainly
`https://yourdomain.com/llms.txt` by the file's nature, but Squarespace does not
say so — **UNVERIFIED**. Searched the Squarespace Help Center for "llms.txt"; the
article does not name the path. No size limit is documented either.

### 4. `.well-known/botcentral.txt` — not possible. Use DNS TXT.

No `.well-known` mechanism exists and no arbitrary file can be placed at the root.
Searched the Squarespace Help Center for "well-known" — zero relevant articles;
the five hits were a template called "Wells", an ISP-blocking article, a domain
transfer article, a version-identification article, and the AI-crawler article.

**Not a blocker.** Use the apex DNS TXT record, which BotCentral scores higher:
Squarespace domains dashboard → **DNS** → **DNS Settings** → scroll to **Custom
Records** → **Add record** (re-authenticate with your password or 2FA) → **Type** =
**TXT** → **Name** = `@` ("To add your domain as the host name, enter @ into the
**Name** field") → paste the value into **Text** → **Save**. If the domain is with
another registrar, add the TXT there instead.

### 5. IndexNow key file — not possible

No root file, no `.well-known`, and no native IndexNow. Searched the Squarespace
Help Center for "IndexNow" — **zero results**. Squarespace documents Bing only as
manual verification through Bing Webmaster Tools.

The theoretical route is **Developer Tools → URL mappings**, which does support
external destinations:

```
/fundraiser -> https://fundraiser.com/very-special-fundraiser 301
```

("Ensure the URL you're directing to begins with **https://**.") But two problems:
Squarespace states "**Redirects only work if the page you're redirecting from has
been deleted or disabled**", and whether a mapping fires for a path that never
existed as a Squarespace page is **UNVERIFIED**; separately, whether IndexNow
follows a cross-host redirect when fetching the key file is **UNVERIFIED** —
indexnow.org's documentation does not address redirects. Do not promise this.

Also note "You can only redirect from built-in and custom domains connected to your
Squarespace site."

## The `.well-known/` problem

Moot. No mechanism, no workaround, and none needed — the apex DNS TXT record proves
the same thing and scores higher.

## Gotchas

- **The shared robots.txt is the headline.** Every Squarespace site on the planet
  serves the same one. Nothing CiteFleet writes can reach it, and no `Sitemap:` line
  can be added. Squarespace is the only provider in this batch where robots.txt is
  fully closed.
- **7.0 vs 7.1 matters.** `llms.txt` is 7.1-only. Developer mode (git access to a
  template) is **7.0 only** — and switching to developer mode "replaces your current
  template with an editable developer template", after which "your template will no
  longer receive updates and bug fixes added by our team". Even then, nothing in the
  developer docs says template files can be served at arbitrary root paths
  (**UNVERIFIED** — the developer quick-start does not describe a static-asset
  directory or root file serving).
- **Uploaded files never live on the customer's domain.** They are on
  `static1.squarespace.com` / `images.squarespace-cdn.com`, and "it's not possible to
  customize or redirect a static asset URL". So the IndexNow `keyLocation` trick is
  not even available — the key file would be on a different host entirely, which
  IndexNow does not permit.
- **URL mappings live in Developer Tools**, which is a separate panel from Settings;
  the syntax is `/old-url -> /new-url 301` with a literal space-arrow-space.
- **No SEO API.** Any CiteFleet "install for me" flow on Squarespace must be a set of
  screenshots and instructions, not automation.

## If files cannot be placed

Achievable on Squarespace: **`llms.txt` only** (7.1 sites), plus the apex DNS TXT
record for BotCentral proof. `robots.txt` and `sitemap.xml` cannot be touched — not
edited, not replaced, not supplemented. The IndexNow key file cannot be placed.

For CiteFleet's purposes Squarespace should be classed as a **partial** provider:
`llms.txt` + DNS TXT, with a clear, honest message to the customer that Squarespace
does not permit robots.txt or sitemap customisation at all. If robots.txt control is
a hard requirement, the only fix is to move the site off Squarespace or front it with
a proxy the customer controls.

## Automation

None available. Squarespace's public Developer Platform APIs are Analytics,
Contacts, Discounts, Inventory, Orders, Products, Profiles, Transactions and Webhook
Subscriptions — all commerce. There is no API for site settings, SEO settings,
robots.txt, sitemap, llms.txt, or URL mappings. The Custom Code Spec covers code
**injection** into 7.1 pages, not root file serving.

## Sources

- https://support.squarespace.com/hc/en-us/articles/206543207-Understanding-Google-SEO-emails-and-console-errors — "All Squarespace sites use the same robots.txt file and Squarespace users can't access or edit the file."
- https://support.squarespace.com/hc/en-us/articles/360022347072-Request-that-AI-models-exclude-your-site — **Settings** → **Crawlers** → "Block known artificial intelligence crawlers"; unchecked by default; adds disallow instructions for ~25 named bots including ClaudeBot, GPTBot, Amazonbot, Applebot-Extended, Google-Extended.
- https://support.squarespace.com/hc/en-us/articles/47434125611277-Create-an-llms-txt-file — **SEO/AI Visibility** panel → **SEO Settings** → **LLMS.txt** tab → text field (disabled by default) → **Save**; "You can create an llms.txt file on version 7.1 sites"; content is fully custom; delete by clearing the field and saving.
- https://support.squarespace.com/hc/en-us/articles/47912856372109-Create-an-ads-txt-file — **Settings** → **Website** → **Ads.txt File**; precedent that Squarespace ships per-file editors, not a general file store.
- https://support.squarespace.com/hc/en-us/articles/206543547-View-your-site-map — sitemap at `https://www.yourdomain.com/sitemap.xml` and `https://sitename.squarespace.com/sitemap.xml`; "Squarespace automatically generates a list of your site's URLs and image metadata"; "You can't edit the sitemap or a page's source code."
- https://support.squarespace.com/hc/en-us/articles/205815308-URL-mappings — **Developer tools** → **URL mappings**; syntax `/old-url -> /new-url 301`; external example `/fundraiser -> https://fundraiser.com/very-special-fundraiser 301`; "Ensure the URL you're directing to begins with **https://**"; "Redirects only work if the page you're redirecting from has been deleted or disabled"; "You can only redirect from built-in and custom domains connected to your Squarespace site."
- https://support.squarespace.com/hc/en-us/articles/205812748-Image-and-file-URLs-in-Squarespace — assets served from `images.squarespace-cdn.com`, `static.squarespace.com`, `static1.squarespace.com`; "it's not possible to customize or redirect a static asset URL."
- https://support.squarespace.com/hc/en-us/articles/205813928-Uploading-and-managing-files — "You can upload most types of files to your site"; CDN "assigns URLs automatically".
- https://support.squarespace.com/hc/en-us/articles/31120980444429-Adding-TXT-records — **DNS** → **DNS Settings** → **Custom Records** → **Add record** → **TXT**; "To add your domain as the host name, enter @ into the **Name** field."
- https://support.squarespace.com/hc/en-us/articles/205815758-Developer-Tools — developer mode is "version 7.0 only"; git/GitHub connection; "Switching to developer mode replaces your current template with an editable developer template"; the template "will no longer receive updates and bug fixes".
- https://developers.squarespace.com/commerce-apis/overview — the complete public API list (Analytics, Contacts, Discounts, Inventory, Orders, Products, Profiles, Transactions, Webhook Subscriptions); no site-settings, SEO, robots.txt, sitemap or redirect API.
- https://www.indexnow.org/documentation — key file must be on the same host; `keyLocation` limits valid URLs to the key file's directory prefix; redirect handling not addressed.
