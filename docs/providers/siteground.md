# SiteGround (Site Tools)

- **Market share:** 2.0% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting
- **File access:** SFTP + SSH + control-panel file manager (Site Tools), key-authenticated
- **Automatable by the CiteFleet script (rclone):** yes — but only after a key pair is created in Site Tools, and only on a non-standard port
- **Docs consulted:** https://www.siteground.com/kb/upload-website-files, https://www.siteground.com/kb/is_sftp_access_available, https://www.siteground.com/kb/how_to_establish_sftp_connection_to_hosting_with_filezilla, https://www.siteground.com/kb/manage-files-file-manager, https://www.siteground.com/kb/wordpress-robots-txt, https://www.siteground.com/kb/siteground-dynamic-caching-configuration, https://www.siteground.com/kb/clear-site-cache, https://www.siteground.com/kb/manage-dns-records-site-tools, https://go-acme.github.io/lego/dns/, https://www.siteground.com/tutorials/sg-git/clone-git-repository, https://www.siteground.com/kb/increase-wp-memory-limit, https://www.siteground.com/kb/which_ports_are_open_on_siteground_shared_servers, https://www.siteground.com/tutorials/ftp/filezilla, https://www.siteground.com/kb/create-manage-and-edit-ftp-accounts, https://www.siteground.com/kb/sftp-cyberduck, https://www.siteground.com/kb/siteground-cdn-configuration, https://www.siteground.com/kb/use-cdn-cloudflare, fetched 2026-09-11

## Where the web root is

`public_html`. SiteGround replaced cPanel with its own **Site Tools** panel but kept
the familiar directory name: "Your website files need to be uploaded inside the
*public_html*, which is the document root folder for your primary domain name."
SiteGround's KB also calls it the "web root folder or document root folder", and
notes its permissions are **755** by default.

Additional sites on the account — subdomains and secondary domains — each get
**their own document root folder**; SiteGround's guidance is that "Their respective
website files need to be uploaded under the respective folder." For a subdomain the
documented shape is `subdomain.yourdomain.com/public_html`, viewable from
**Site Tools** → **Site** → **File Manager**.

**Confirmed absolute path.** Two independent official docs print the literal
absolute path, and it is *not* the classic cPanel shape — `public_html` sits
under a shared `www` directory keyed by domain name:

```
/home/customer/www/<yourdomain.com>/public_html/
```

- SiteGround's Git tutorial gives the exact clone command
  `git clone ssh://username@server_name:18765/home/customer/www/yourdomain.com/public_html/`.
- SiteGround's WordPress memory-limit KB locates `wp-config.php` at
  `/home/customer/www/yourdomain.com/public_html`.

Neither doc states the exact path shape for a secondary/addon domain, but both
confirm each additional site "has its own document root folder" and the
upload-website-files KB says those files "need to be uploaded under the
respective folder" — the pattern-consistent (but not verbatim-documented)
inference is `/home/customer/www/<addon-domain.com>/public_html/`. **The
installer should still connect and locate `public_html` by relative navigation
rather than hardcoding the addon-domain form**, since that exact string was not
found in an official doc.

## Steps to install the five files

**Unattended, via rclone over SFTP — the supported route:**

1. In **Site Tools** → **Devs** → **SSH Keys Manager**, generate a new SSH key
   pair (or import CiteFleet's public key). This step is mandatory — see the
   authentication note below.
2. From that key's **Actions** kebab menu, open **SSH Credentials** to read the
   hostname and username.
3. Connect on **port 18765** — *not* 22. SiteGround runs SSH/SFTP on a
   non-standard port and a default rclone config will simply fail to connect.
4. Configure rclone as `type = sftp`, `host = <hostname from SSH Credentials>`,
   `port = 18765`, `user = <username>`, `key_file = <private key>`.
5. Upload `robots.txt`, `sitemap.xml`, `llms.txt` and `<indexnow-key>.txt` into
   `public_html/`, and `botcentral.txt` into `public_html/.well-known/`.
6. **Flush the cache** — see Gotchas. This step is not optional on SiteGround.

**By hand, via the Site Tools File Manager:**

1. **Site Tools** → **Site** → **File Manager**.
2. Click **public_html** in the left-hand folder tree (SiteGround's KB describes
   selecting it from the left sidebar).
3. "Navigate to the folder in which you want to upload from the folder/file tree
   on the left. Click the **File Upload** or the **Folder Upload** icon in the
   upper toolbar."
4. Flush the cache afterwards.

**Authentication note, and why it is good news.** SiteGround does not offer
password-authenticated SFTP: access is key-based, created per-site in the SSH Keys
Manager. That is more setup than typing a password, but it is exactly what an
unattended agent wants — a scoped credential that is not the customer's panel
login, and one the customer can revoke without changing their own password. Of the
mainstream shared hosts in this set, SiteGround has the cleanest credential model
for CiteFleet. The caveat SiteGround itself flags is scope: "SSH keys can be used
to access **all** files on the website via SFTP/SSH", with no folder-level
restriction, so the key must be stored as a full-account credential.

For accounts with several sites, SiteGround documents a **Multisite SFTP access**
option under **Client Area** → **Multiple SFTP access**, which is the right shape
for CiteFleet managing a customer's whole portfolio with one key.

## The `.well-known/` problem

**Not a problem on SiteGround.** The Site Tools File Manager does not hide
dotfiles: SiteGround's KB states that "By default, all hidden files are displayed
there." There is consequently no "show hidden files" toggle to find, because
nothing is hidden. Over SFTP the question does not arise at all.

**UNVERIFIED:** whether the File Manager's *create folder* dialog accepts a
dot-prefixed name. SiteGround documents that hidden files "begin with a '.' (dot)"
and that they are all displayed, but no official page walks through creating a
dot-named directory. Searched siteground.com/kb for "create folder file manager",
"new folder", and "create .well-known"; nothing addresses it either way. Since the
automated path is SFTP — where rclone creates `.well-known/` with no dialog
involved — this gap does not block CiteFleet; it only affects a customer doing it
by hand.

Note also that `.well-known/` is very likely to **already exist** on a SiteGround
account, because the ACME HTTP-01 challenge used for Let's Encrypt issuance writes
into `.well-known/acme-challenge/`. **UNVERIFIED** as a documented SiteGround
behaviour — searched siteground.com/kb for "well-known", "acme-challenge" and
"Let's Encrypt validation"; SiteGround's SSL articles describe issuing
certificates but never mention the directory. Treat the directory as
possibly-present and **never delete or overwrite it wholesale** — create
`botcentral.txt` inside it, do not sync the directory.

As always, this file is optional: an apex DNS TXT record proves the same thing and
BotCentral scores it higher.

## Gotchas

- **The premise that SiteGround "removed plain FTP" is not supported by current
  official docs — if anything, it is contradicted.** SiteGround's ports
  reference (last updated 2024-11-13) still lists **port 21** as "the default
  FTP port" alongside port 18765 for SSH/SFTP, and SiteGround's own FileZilla
  tutorial still documents connecting over **plain FTP on port 21** using the
  username/password created at **Site Tools → Site → FTP Accounts** — a
  separate, password-only feature from the SSH-key-based SFTP covered above.
  **UNVERIFIED:** no SiteGround blog post or KB article announcing FTP removal
  was found (searched siteground.com/blog and /kb for "FTP removed",
  "discontinued FTP", "SFTP only announcement"). Do not assume plain FTP is
  gone; if a customer's firewall or the CiteFleet script only intends to use
  the key-authenticated SFTP path documented above, that is a choice for
  security, not because FTP is unavailable.
- **Port 18765, not 22.** This is the single biggest trap. SiteGround's own
  FileZilla walkthrough says "Set **18765** as **Port**". An rclone remote left on
  the default will time out with no useful error.
- **No password auth.** A key pair must exist in Site Tools first. There is no way
  to hand CiteFleet a username and password and have it work.
- **Dynamic Cache is on by default and will serve stale files.** SiteGround
  documents that "Our Dynamic caching is a full-page caching mechanism powered by
  NGINX that's enabled and running by default on all SiteGround servers." After
  uploading, purge it, or the verification fetch may see the old content — or a
  404 where `llms.txt` now exists. Three documented ways to purge:
  **Site Tools** → **Speed** → **Caching** → **Dynamic Cache** tab → the **Flush
  Cache** icon under **Actions**; the Speed Optimizer plugin's **Cache** tab
  button; or the WP-CLI command `wp sg purge`.
  **UNVERIFIED:** whether Dynamic Cache caches plain static files such as
  `robots.txt` and `llms.txt` at all, as opposed to only dynamically generated
  HTML. SiteGround's configuration article describes it as full-page caching of
  "page content" and does not say. Searched siteground.com/kb for "dynamic cache
  static files", "cache robots.txt" and "NGINX Direct Delivery"; no official page
  resolves it. **Purge anyway** — it costs one click and removes the doubt.
- **A physical robots.txt does override WordPress's virtual one, and SiteGround
  says so explicitly.** This is the clearest official statement of it in this whole
  provider set: "WordPress comes with a built-in feature that generates a
  robots.txt file dynamically – this isn't a physical file stored on your server",
  and "IMPORTANT: Note that if you create a physical robots.txt file in your
  WordPress site's root folder, it will override the virtual robots.txt that
  WordPress generates by default." So CiteFleet's uploaded `robots.txt` wins.
- **Yoast or another SEO plugin still owns `sitemap.xml`.** SiteGround's own SEO
  guidance points WordPress users at Yoast SEO → General → Features → **XML
  Sitemaps**, which serves a sitemap index through WordPress rewrite rules rather
  than a file on disk. An uploaded `sitemap.xml` and a Yoast sitemap can both
  answer, at different URLs, and disagree. Decide which one is canonical and
  reference that from `robots.txt`.
- **SiteGround's own CDN (separate from Cloudflare) explicitly caches static
  files, and is mutually exclusive with Cloudflare.** SiteGround's CDN KB
  states "The free SiteGround CDN plan caches only static files such as CSS
  files, JS files, images, static HTML files, etc." — flush it manually at
  **Site Tools → Speed → SiteGround CDN** (global purge "could take up to 180
  seconds") if it's enabled. Separately, SiteGround's own KB states "You can
  only use one of the services for your website. You can disable the CDN from
  Site Tools if you wish to use Cloudflare instead." — so a site is never
  running both SiteGround's CDN and Cloudflare at once; check which one (if
  either) is active and purge that one specifically after upload.
- **SiteGround Optimizer does not generate robots.txt or sitemap.xml.**
  **UNVERIFIED** but well-supported: SiteGround describes the plugin as a
  performance/caching tool (image optimisation, lazy loading, GZIP, minification)
  and no official page attributes robots/sitemap generation to it. Searched
  siteground.com for "SiteGround Optimizer sitemap", "Speed Optimizer robots.txt".
  The practical risk from this plugin is caching, not file generation.

## If files cannot be placed

- **Use the apex DNS TXT record.** SiteGround runs DNS for domains pointed at its
  nameservers. **Site Tools** → **Domain** → **DNS Zone Editor** → the
  **Create New Record** section → the **TXT** tab → fill in the value →
  **Create**.
- **This cannot be automated on SiteGround, and that is a firm finding.** lego
  (github.com/go-acme/lego) has **no `siteground` DNS provider** — the full list
  at https://go-acme.github.io/lego/dns/ carries `hostinger`, `godaddy`, `ionos`,
  `cpanel`, `plesk` and `directadmin`, but nothing for SiteGround. Nor is there a
  public SiteGround API to write one against: **UNVERIFIED / no public DNS API
  found** — searched siteground.com for "API", "REST API", "developer
  documentation" and "Site Tools API". SiteGround's own engineering blog describes
  Site Tools as internally API-driven and says opening those APIs publicly is
  planned but not shipped, with no published documentation. The only SiteGround
  "API key" article in the KB is about the unrelated Akismet/WordPress.com key.
  **So on SiteGround the apex TXT record is a manual, customer-performed step.**
- **Therefore, prefer the file route on SiteGround** — the inverse of the advice
  for most hosts in this set. SFTP is scriptable here and DNS is not, so
  `.well-known/botcentral.txt` placed over SFTP is the path CiteFleet can actually
  automate end to end. Ask the customer for the TXT record as the sturdier second
  proof, not as the first resort.

## Sources

- https://www.siteground.com/kb/upload-website-files — `public_html` is the document root for the primary domain; additional sites and subdomains each have their own document root folder
- https://www.siteground.com/kb/permissions-directory-listing-public_html/ — `public_html` permissions are 755 by default; the folder is also called the web root / document root
- https://www.siteground.com/kb/is_sftp_access_available — "Yes, SFTP is available on all hosting solutions" — no plan gating
- https://www.siteground.com/kb/how_to_establish_sftp_connection_to_hosting_with_filezilla — "Set **18765** as **Port**"; an SSH key pair must be generated first; credentials come from the key's Actions kebab menu → SSH Credentials; keys grant access to *all* files on the website
- https://www.siteground.com/kb/sftp-command-line — the SSH Keys Manager lives at Site Tools → Devs → SSH Keys Manager
- https://www.siteground.com/kb/multisite-sftp-access/ — Client Area → Multiple SFTP access, for one credential across several sites
- https://www.siteground.com/kb/manage-files-file-manager — File Manager click-path (Site Tools → Site → File Manager), the File Upload / Folder Upload toolbar icons, and that "By default, all hidden files are displayed there"
- https://www.siteground.com/kb/wordpress-robots-txt — WordPress's robots.txt "isn't a physical file stored on your server", and "if you create a physical robots.txt file in your WordPress site's root folder, it will override the virtual robots.txt"
- https://www.siteground.com/kb/siteground-dynamic-caching-configuration — Dynamic Caching is "enabled and running by default on all SiteGround servers"; purge via the Speed Optimizer plugin's Cache tab, `wp sg purge`, or Site Tools → Caching
- https://www.siteground.com/kb/clear-site-cache — the Site Tools flush path: Speed → Caching → Dynamic Cache tab → Flush Cache under Actions (and the Memcached tab)
- https://www.siteground.com/kb/manage-dns-records-site-tools — DNS Zone Editor click-path: Site Tools → Domain → DNS Zone Editor → Create New Record → TXT tab → Create
- https://www.siteground.com/kb/seo-general-guide — SiteGround's SEO guidance routes WordPress sitemap generation through Yoast SEO → General → Features → XML Sitemaps
- https://www.siteground.com/blog/technology-behind-new-client-area-and-site-tools — Site Tools is internally API-driven; SiteGround states public API access is intended but not yet released, and no public documentation exists
- https://go-acme.github.io/lego/dns/ — the full lego provider list contains no `siteground` entry, confirming the apex TXT record cannot be automated through lego
- https://www.siteground.com/tutorials/sg-git/clone-git-repository — confirmed the literal absolute web-root path `/home/customer/www/yourdomain.com/public_html/` and that port 18765 is used for SSH-based access
- https://www.siteground.com/kb/increase-wp-memory-limit — second independent confirmation of the same `/home/customer/www/yourdomain.com/public_html` path
- https://www.siteground.com/kb/which_ports_are_open_on_siteground_shared_servers — confirmed port 21 ("the default FTP port") and port 18765 ("SSH/SFTP") are both currently listed as open, page last updated 2024-11-13
- https://www.siteground.com/tutorials/ftp/filezilla — confirmed a currently-documented **plain FTP** (port 21) connection flow using Site Tools → Site → FTP Accounts username/password, contradicting the premise that plain FTP was removed
- https://www.siteground.com/kb/create-manage-and-edit-ftp-accounts — confirmed the FTP Accounts feature (Site Tools → Site → FTP Accounts) creates username/password accounts, separate from the SSH Keys Manager, and can have a custom home directory
- https://www.siteground.com/kb/sftp-cyberduck — confirmed SFTP on port 18765 via Cyberduck requires the SSH private key (password field left empty), corroborating that the SSH-key SFTP path has no password fallback
- https://www.siteground.com/kb/siteground-cdn-configuration — confirmed SiteGround's own CDN caches static files ("static HTML files, etc.") and gave the manual purge path Site Tools → Speed → SiteGround CDN
- https://www.siteground.com/kb/use-cdn-cloudflare — confirmed SiteGround's CDN and Cloudflare are mutually exclusive per site
