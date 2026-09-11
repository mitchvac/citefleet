# WP Engine

- **Market share:** 1.3% of all websites (W3Techs, 2026-09-11)
- **Category:** managed WordPress
- **File access:** SFTP (port 2222) | SSH Gateway (key-only) | git push-to-deploy
- **Automatable by the CiteFleet script (rclone):** yes
- **Docs consulted:** https://wpengine.com/support/sftp/, https://wpengine.com/support/ssh-gateway/, https://wpengine.com/support/read-use-robots-txt/, https://wpengine.com/support/git/, https://wpengine.com/support/cache/, https://wpengine.com/support/static-html-website/, https://wpengine.com/support/disallowed-plugins/, https://yoast.com/help/xml-sitemaps-in-the-wordpress-seo-plugin/, https://developer.yoast.com/features/xml-sitemaps/functional-specification/, fetched 2026-09-11

## Where the web root is

The WordPress document root **is** the SFTP root. Connect over SFTP and you land in the
directory that contains `wp-content/`, `wp-admin/`, `wp-includes/` and `wp-config.php`;
that is the "root of your site" WP Engine's own robots.txt article tells customers to
upload to.

Over the SSH Gateway the same directory has an absolute path:

```
/sites/<environment>/
```

WP Engine is explicit that this is the only persistent location — "files created outside
this path will disappear when your SSH session ends"
(https://wpengine.com/support/ssh-gateway/).

`<environment>` is the install/environment name from the User Portal (e.g. `mysite`,
`mysitedev`, `mysitestg`), **not** the domain. Each environment — Production, Staging,
Development — is a separate root with separate credentials.

Connection details:

| | Value |
|---|---|
| SFTP host | `<environment>.sftp.wpengine.com` |
| SFTP port | `2222` — "always set to `2222`", the only supported port |
| Protocol | SFTP only. "WP Engine only supports SFTP (Secure File Transfer Protocol) due to its improved security features." Plain FTP and FTPS are **not** offered. |
| SFTP auth | username + password, created per environment in the User Portal (**Sites → *environment* → SFTP Users**). "Each set of SFTP credentials will only work for one environment." |
| SSH Gateway host | `<environment>@<environment>.ssh.wpengine.net`, port 22 |
| SSH Gateway auth | ED25519 **key only** — password auth is not supported |
| git remote | `git@git.wpengine.com:<environment>.git`, SSH key added in the User Portal per environment |

(https://wpengine.com/support/sftp/, https://wpengine.com/support/ssh-gateway/,
https://wpengine.com/support/git/)

## Steps to install the five files

The CiteFleet script can do steps 1–3 unattended over rclone's `sftp` backend; step 4
needs the customer or the operator in the User Portal.

1. **Get SFTP credentials.** The customer creates an SFTP user in the User Portal
   (**Sites → *environment* → SFTP Users → Add SFTP User**) and hands over host,
   username and password. Host is `<environment>.sftp.wpengine.com`.

2. **Configure rclone for port 2222.** The non-standard port is the one thing that
   silently fails if you forget it:

   ```
   rclone config create wpe sftp \
     host=<environment>.sftp.wpengine.com \
     port=2222 \
     user=<sftp-username> \
     pass=<obscured-password>
   ```

3. **Copy the pack to the root.** The SFTP login directory is already the document root,
   so the destination path is `:`:

   ```
   rclone copy ./origin-pack wpe: --include robots.txt --include sitemap.xml \
     --include llms.txt --include '*.txt'
   rclone copy ./origin-pack/.well-known wpe:.well-known
   ```

   Equivalent by hand: drag the files into the folder that contains `wp-content/` in
   FileZilla/Cyberduck, or over the SSH Gateway:

   ```
   scp -O -P 22 robots.txt <environment>@<environment>.ssh.wpengine.net:/sites/<environment>/
   ```

   (`scp` and `rsync` are both supported; "Modern scp clients need the `-O` flag" —
   https://wpengine.com/support/ssh-gateway/.)

4. **Purge the cache.** See [Gotchas](#gotchas) — this is not optional on WP Engine.
   **Sites → *environment* → Manage → Cache → Clear all caches**
   (https://wpengine.com/support/cache/).

5. **Check `sitemap.xml` before you upload it.** See [Gotchas](#gotchas) — on a WordPress
   site `/sitemap.xml` is usually *not* where the site's real sitemap lives, and shipping a
   static one can be actively wrong. Decide per site.

## The `.well-known/` problem

SFTP and the SSH Gateway are ordinary file transports with no dotfile filtering, so
**creating `.well-known/` and writing `botcentral.txt` inside it is not the problem here**
— `mkdir .well-known` over SSH, or `rclone copy … wpe:.well-known`, both work the way
they do on any SFTP server. WP Engine offers no browser-based file manager at all, so
there is no dot-directory-hiding UI to work around.

The open question is whether WP Engine's nginx layer **serves** `/.well-known/*` back out
to the public, or reserves that path for its own certificate machinery.

**UNVERIFIED.** No WP Engine support article states how `/.well-known/` requests are
routed. Searched: `wpengine.com/support` for ".well-known", "well-known directory file
access", "acme-challenge domain verification file root"; also read
https://wpengine.com/support/read-use-robots-txt/,
https://wpengine.com/support/static-html-website/ and
https://wpengine.com/support/ssh-gateway/, none of which mention the path. WP Engine
provisions SSL for customer domains itself, which is the usual reason a managed host
intercepts `/.well-known/acme-challenge/` — but "intercepts `acme-challenge`" and
"intercepts all of `.well-known`" are different claims and neither is documented.

**Therefore: use the apex DNS TXT record for the BotCentral proof on WP Engine**
(`botcentral-verify=citefleet-app`), and treat `.well-known/botcentral.txt` as a
best-effort extra that must be verified by fetching the live URL after upload. DNS TXT
also survives the one thing most likely to wipe an uploaded root file here — a git
push-to-deploy or a restore from backup.

## Gotchas

**1. `robots.txt`: the static file wins — this is documented, and it is the good case.**
WP Engine states it plainly:

> "If there is a physical file in the root of your site called `robots.txt`, it will
> overwrite any dynamically generated `robots.txt` file created by a plugin or theme."
> — https://wpengine.com/support/read-use-robots-txt/

So uploading `robots.txt` to the root takes precedence over Yoast, Rank Math, All in One
SEO and WordPress core's virtual `do_robots()` output. The flip side: it takes precedence
*silently*. If the customer later edits robots.txt inside Yoast's admin UI, their edit will
have no effect on the live file and nothing will tell them why. Say so when handing over.

**2. `sitemap.xml`: the decisive difference from robots.txt — on WordPress, `/sitemap.xml`
is usually the wrong URL.** WP Engine's precedence statement covers `robots.txt` only; it
says nothing about sitemaps, and the reason is that WordPress sitemaps do not live at
`/sitemap.xml`:

- **WordPress core** (5.5+) exposes its sitemap index at **`/wp-sitemap.xml`**
  (https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/).
- **Yoast SEO** exposes its index at **`/sitemap_index.xml`**, and its functional spec says
  "The file should be accessible at `/sitemap_index.xml`. Requests to `/sitemap.xml` should
  redirect here."
  (https://developer.yoast.com/features/xml-sitemaps/functional-specification/).

Yoast's own support article confirms both that a physical file is a real, competing thing
and that Yoast expects it gone:

> "If you have a sitemap at example.com/sitemap.xml … your sitemap is not generated by
> Yoast SEO. It is probably generated by another plugin or WordPress core itself."
> "Disable other sitemap plugins and remove any physical sitemap files via FTP before
> enabling the sitemaps in our plugin."
> — https://yoast.com/help/xml-sitemaps-in-the-wordpress-seo-plugin/

Which layer wins on WP Engine's nginx when a static `/sitemap.xml` and Yoast's redirect
both exist is **UNVERIFIED** — no WP Engine or Yoast doc states the precedence for this
host. (Searched WP Engine support for "sitemap.xml Yoast 404" and read the Yoast Apache
and nginx sitemap articles; both give rewrite rules, neither adjudicates a physical file.)

**The concrete recommendation:** on a WP Engine site that already runs an SEO plugin, do
**not** upload a static `sitemap.xml`. Upload `robots.txt` with a `Sitemap:` line pointing
at the sitemap the site actually serves —

```
Sitemap: https://example.com/sitemap_index.xml     # Yoast / Rank Math
Sitemap: https://example.com/wp-sitemap.xml        # WordPress core, no SEO plugin
```

— which is both correct and immune to the precedence question. Ship a static
`sitemap.xml` only where the site generates no sitemap at all.

**3. Caching. A file upload is not a purge.** WP Engine runs several layers
(https://wpengine.com/support/cache/): a Varnish page cache with a 10-minute default,
an optional Edge Full Page Cache on Cloudflare, and Global Edge Security cache which
"caches based on file extension … all of Cloudflare's default file extensions" —
`.txt` and `.xml` are exactly the kind of static extension that gets a long TTL (static
assets default to 365 days at the browser/network layer). After uploading, clear caches:
**Sites → *environment* → Manage → Cache → Clear all caches**. Then verify with a
cache-busting fetch, not a browser reload.

**4. Non-production environments are `Disallow: /` by default.** WP Engine "disallows bots
to crawl and/or index a site that is using a WP Engine subdomain (`example.wpengine.com`)
via a default robots.txt virtual file"
(https://wpengine.com/support/read-use-robots-txt/). If the site has not yet had its custom
domain attached, the pack will appear to be installed and BotCentral will still see a
blocking robots.txt. Install the pack on the **Production** environment of a site with its
real domain mapped, and confirm you are not looking at `*.wpengine.com`.

**5. git push-to-deploy can un-do an SFTP upload — but only if the file is tracked.**
WP Engine: "the deployment end of the GitPush process will only remove files from the
application that have also been removed from the repository. If a file never existed in the
repository it will not be removed from the application upon pushing"
(https://wpengine.com/support/git/). So an SFTP-uploaded `robots.txt` survives a push —
*unless* the customer once tracked `robots.txt` and later deleted it from the repo, in
which case the next push deletes it from the server too. If the customer uses GitPush,
prefer committing the pack to the repo root over SFTP-uploading it.

**6. Only Production is a real site.** Staging and Development environments have their own
SFTP host and their own root. Uploading to `<env>dev.sftp.wpengine.com` installs the pack
somewhere no crawler will ever look.

**7. Some sitemap and caching plugins are blocked at the platform level.**
`google-xml-sitemaps-with-multisite-support` and `w3-total-cache` are on WP Engine's
disallowed list and are removed/disabled on sight
(https://wpengine.com/support/disallowed-plugins/). Relevant if a plugin route is proposed
as the fix for a sitemap problem — it may not be installable.

## The plugin route — assessed, and not recommended here

A WordPress plugin *could* serve all five files dynamically: register rewrite rules (or
hook `robots_txt`, `init` and `template_redirect`) and emit each file's body from PHP.
It is technically clean and it is how Yoast already serves sitemaps.

It is still the worse route on WP Engine, for four reasons:

- **The main problem it would solve is already solved.** The one file WordPress genuinely
  contests is `robots.txt`, and WP Engine has documented that the static file wins. A
  plugin buys nothing there.
- **`/.well-known/` is exactly where a plugin does *not* help.** If WP Engine's nginx
  reserves that path, it never reaches PHP, so a plugin cannot serve
  `.well-known/botcentral.txt` either. The DNS TXT fallback is needed either way.
- **It cannot be installed unattended.** Uploading plugin files over SFTP is easy;
  *activating* one is an admin-UI action or a WP-CLI call over the SSH Gateway, which
  requires the customer to have registered an ED25519 key. That is strictly more customer
  steps than dropping five files, not fewer.
- **It adds a thing that can be deactivated, updated, or swept up.** WP Engine's Smart
  Plugin Manager auto-updates plugins, and the disallowed-plugins list shows the platform
  will disable plugins it objects to. Five inert static files have no such failure mode.

Use the plugin route only for a customer who insists the content must be generated per
request (e.g. a sitemap that must track new posts). For a fixed origin pack, files win.

## If files cannot be placed

In order of preference:

1. **DNS TXT for the proof.** `botcentral-verify=citefleet-app` on the apex. This is the
   recommended primary on WP Engine regardless (see
   [The `.well-known/` problem](#the-well-known-problem)) — it does not depend on nginx
   routing, survives GitPush, survives a backup restore, and BotCentral scores it higher.
2. **Commit to the repo** if the customer uses GitPush (`git@git.wpengine.com:<env>.git`),
   which makes the pack part of the deploy rather than a manual upload that a later deploy
   can contradict.
3. **`robots.txt` only, plus a correct `Sitemap:` line.** If sitemap precedence is
   uncertain and the customer will not risk it, the static `robots.txt` alone (which WP
   Engine documents as authoritative) plus a pointer to the site's real sitemap URL
   delivers most of the value with no conflict.
4. **WP Engine support** can be asked directly whether `/.well-known/` is served on a given
   install — the one question this research could not answer from public docs.

## Sources

- https://wpengine.com/support/sftp/ — SFTP host pattern `<environment>.sftp.wpengine.com`; port "always set to `2222`"; "WP Engine only supports SFTP … " (no plain FTP); username/password auth; credentials are per-environment.
- https://wpengine.com/support/ssh-gateway/ — SSH Gateway host `<environment>.ssh.wpengine.net`; ED25519 key-only auth; `/sites/<environment>/` is the persistent site root and files outside it vanish at session end; `rsync` and `scp` supported (`scp -O`); 5 concurrent connections, 10-minute timeout; no root/sudo.
- https://wpengine.com/support/read-use-robots-txt/ — **the decisive quote**: "If there is a physical file in the root of your site called `robots.txt`, it will overwrite any dynamically generated `robots.txt` file created by a plugin or theme."; upload "to the root directory of your site" via SFTP or SSH Gateway; WP Engine serves a default virtual robots.txt that disallows bots on `*.wpengine.com` subdomains.
- https://wpengine.com/support/static-html-website/ — static files go in the root directory; confirms WP Engine serves plain static files, and that it does **not** document rewrite-rule precedence.
- https://wpengine.com/support/git/ — git remote `git@git.wpengine.com:<environmentname>.git`; SSH-key auth per environment; "If a file never existed in the repository it will not be removed from the application upon pushing"; `wp-config.php` and `object-cache.php` cannot be deployed.
- https://wpengine.com/support/cache/ — cache layers (Varnish page cache, 10-minute default; Edge Full Page Cache; Global Edge Security "caches based on file extension"; 365-day static-asset browser cache); clear via **Sites → environment → Manage → Cache → Clear all caches**.
- https://wpengine.com/support/disallowed-plugins/ — platform-level disallowed plugin list, including `google-xml-sitemaps-with-multisite-support` and `w3-total-cache`.
- https://developer.yoast.com/features/xml-sitemaps/functional-specification/ — "The file should be accessible at `/sitemap_index.xml`. Requests to `/sitemap.xml` should redirect here."
- https://yoast.com/help/xml-sitemaps-in-the-wordpress-seo-plugin/ — a sitemap at `/sitemap.xml` "is not generated by Yoast SEO"; "remove any physical sitemap files via FTP before enabling the sitemaps in our plugin" — confirms physical sitemap files exist and conflict, without settling precedence.
- https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/ — "With version 5.5., WordPress will expose a sitemap index at `/wp-sitemap.xml`" — core's sitemap is not at `/sitemap.xml`.
- https://developer.wordpress.org/reference/functions/do_robots/ — WordPress generates a virtual robots.txt dynamically; the page itself does not document physical-file precedence (that claim rests on the WP Engine article above).
