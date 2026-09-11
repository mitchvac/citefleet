# GoDaddy

- **Market share:** 2.5% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting (Web Hosting/cPanel and Windows/Plesk) **and** managed WordPress **and** a SaaS site builder (Websites + Marketing) — GoDaddy genuinely spans all three, and the answer below differs per product
- **File access:** SFTP + FTP + SSH + control-panel file manager on cPanel; SFTP on Managed WordPress; FTP only on Windows/Plesk; admin UI only on Websites + Marketing
- **Automatable by the CiteFleet script (rclone):** partly — yes on Web Hosting (cPanel) once SSH is switched on, but password-only; no on Websites + Marketing
- **Docs consulted:** https://www.godaddy.com/help/what-is-my-websites-root-directory-in-my-web-hosting-cpanel-account-16187, https://www.godaddy.com/help/enable-ssh-for-my-web-hosting-cpanel-account-16102, https://www.godaddy.com/help/connect-to-my-web-hosting-cpanel-account-with-ssh-secure-shell-31865, https://www.godaddy.com/help/show-hidden-files-in-my-linux-hosting-account-32171, https://www.godaddy.com/help/add-a-txt-record-19232, https://www.godaddy.com/help/manage-dns-records-680, https://www.godaddy.com/help/how-do-i-access-domain-related-apis-42424, https://www.godaddy.com/help/add-html-or-custom-code-to-my-site-27252, https://www.godaddy.com/help/upload-files-to-my-windows-hosting-account-with-ftp-and-filezilla-31869, https://go-acme.github.io/lego/dns/godaddy/, fetched 2026-09-11

## Where the web root is

**Web Hosting (cPanel), Linux — the main case.** The primary domain serves from
`/public_html`. GoDaddy's own File Manager settings page refers to it as
"Web Root (public_html or www)", so `www` exists as an alias for the same place.

For an **addon domain or subdomain** GoDaddy does not publish a fixed path — the
document root is whatever was chosen when the domain was added, and the customer
must look it up: **Web Hosting** → **Manage** → **cPanel Admin** → in cPanel home,
the **Domains** section → **Subdomains** or **Addon Domains** → the path appears
under **Document Root**. In practice this is normally `public_html/<domain.tld>`,
but because it is configurable the installer must read it rather than assume it.
There is a separate GoDaddy article specifically for changing it.

**Windows Hosting (Plesk).** The primary domain serves from `httpdocs`.

**Managed Hosting for WordPress.** Reached over SFTP with credentials minted in
the panel. **UNVERIFIED:** the exact document-root directory name and the SFTP
port — GoDaddy's "Upload files with SFTP" article tells the customer to copy the
**Hostname** from the panel but does not print a port or a directory path.
Searched godaddy.com/help for "upload files with SFTP", "Managed WordPress SFTP
credentials", and "Managed WordPress root directory"; no official page states
them.

**Websites + Marketing.** There is no web root. See "If files cannot be placed".

## Steps to install the five files

**Unattended, via rclone over SFTP — Web Hosting (cPanel):**

1. **Web Hosting** → **Manage** next to the account → **Settings** tab → next to
   **SSH access** select **Manage** → toggle the **SSH access** switch on. It is
   off by default.
2. Connect on **port 22**, host = the domain name or the account IP, username =
   the FTP username (which GoDaddy states is the same as the cPanel login name),
   password = the cPanel/FTP password.
3. Upload the four flat files into `/public_html` (or the addon domain's
   Document Root read from cPanel), and `botcentral.txt` into
   `/public_html/.well-known/`.

Note the authentication constraint: GoDaddy states plainly that for cPanel SSH
"you don't need to configure any public or private keys" and that "your cPanel
password doubles as your SSH password". There is no documented public-key option
on this product, so an unattended rclone run means storing the customer's cPanel
password, which is also their panel login. That is a materially worse credential
to hold than a scoped SSH key, and is an argument for preferring the DNS route.

On the tier-gating question specifically: GoDaddy has historically been reported
to gate SSH behind higher-tier cPanel plans. The **current** published doc for
Web Hosting (cPanel) shows a plain per-account on/off toggle under Settings →
SSH access, with no plan-tier language anywhere on the page — so as documented
today, SSH on this product is a feature every Web Hosting (cPanel) plan can
switch on, not a paid-tier-only feature. Contrast this with Managed Hosting for
WordPress below, where the Basic tier is explicitly and currently excluded from
SSH (SFTP still works on Basic).

**By hand, via the cPanel File Manager:**

1. **Web Hosting** → **Manage** → under **Websites**, select **File Manager**.
2. The manager opens in the primary root directory (or the addon domain's root).
3. Drag files onto **Drop files here to start uploading**, or select
   **Select file**, choose the file, then **Open**.

**Managed Hosting for WordPress:** **My Products** → **Managed Hosting for
WordPress** → **Manage All** → the site's **Settings** → under **Production
Site**, **SSH/SFTP login** → **Change** → copy the **Hostname**, then **Create
New Login** twice to mint a username and password (this deletes the previous
SFTP credentials, so do not do it casually on a live account). SSH specifically
is **not available on Basic plans**.

## The `.well-known/` problem

**Real, but solved by a documented toggle, on cPanel.** GoDaddy's File Manager
hides dotfiles by default. The fix is GoDaddy's own article "Show hidden files
in my Web Hosting (cPanel) account": in the cPanel File Manager, **upper
right-hand corner** → **Settings** → in the **Preferences** list select
**Web Root (public_html or www)** and tick **Show Hidden Files (dotfiles)** →
**Save**. After that, `.well-known/` is visible and a dot-named folder can be
created with the normal **+ Folder** control.

Over SFTP the toggle is irrelevant — rclone sees dot-directories regardless, so
the automated path is unaffected.

**UNVERIFIED:** whether GoDaddy's File Manager refuses a dot-prefixed name at
creation time. GoDaddy documents only how to *show* hidden files, not how to
create a hidden directory. Searched godaddy.com/help for "create folder cPanel
File Manager", "create .well-known", and "create hidden folder"; no official
page addresses it either way.

Because the file is optional and an apex DNS TXT record proves the same thing
and scores higher on BotCentral — and because GoDaddy is first and foremost a
registrar that already runs the customer's DNS — **the TXT record is the right
answer for GoDaddy customers**, and `.well-known/botcentral.txt` is a second
proof rather than the primary one.

## Gotchas

- **SSH is off by default** on Web Hosting (cPanel) and must be toggled on in the
  account dashboard before any SFTP connection works.
- **Password-only auth on shared cPanel.** No documented public-key support, so
  the automated path holds a password that is also the panel password.
- **Windows/Plesk is FTP on port 21.** GoDaddy's Windows Hosting upload article
  documents FileZilla with **Port 21** and makes no mention of SFTP. CiteFleet
  should not drive plaintext FTP unattended; treat Windows Hosting as a manual or
  DNS-only host unless SFTP can be confirmed. **UNVERIFIED:** SFTP availability
  on GoDaddy Windows Hosting — searched godaddy.com/help for "Windows Hosting
  SFTP" and "Plesk SSH GoDaddy"; only FTP/port 21 is documented.
- **Addon domain roots are not predictable.** They are set per-domain and can be
  changed; always read **Document Root** from cPanel.
- **Yoast will take over robots.txt.** GoDaddy's official WordPress guidance is
  to install Yoast SEO and use **robots.txt** → **Create robots.txt file**. That
  writes a real file at the WordPress root, so it will overwrite or conflict with
  a CiteFleet-uploaded `robots.txt`. Same story for `sitemap.xml`: Yoast serves
  its own sitemap index via rewrite rules. If the site runs Yoast, edit through
  Yoast rather than uploading, or the next Yoast save silently reverts the upload.
- **WordPress's virtual robots.txt.** WordPress synthesises a `robots.txt` when no
  real file exists; a real file on disk wins. **UNVERIFIED** as a GoDaddy-documented
  fact — GoDaddy's robots.txt article makes no mention of WordPress's native
  behaviour at all. Searched godaddy.com/help for "virtual robots.txt" and
  "WordPress robots.txt not a real file".
- **Websites + Marketing has no filesystem.** Every GoDaddy FTP/SFTP/File Manager
  article is scoped to Web Hosting (cPanel), Windows Hosting (Plesk), Managed
  WordPress or Online Storage — none to Websites + Marketing. Positive
  confirmation from the product's own docs: GoDaddy's "Add HTML or custom code
  to my site" article — the only customer-facing code-injection mechanism this
  product offers — describes pasting HTML/CSS/JS into a **Custom Code field**
  scoped to one page section ("add your own custom code (HTML, CSS and
  JavaScript) to sections in your website"). That is snippet injection into
  rendered page content, not a way to write a standalone file to the server,
  and no GoDaddy doc for this product mentions file upload, a `.well-known/`
  path, or replacing `robots.txt`/`sitemap.xml`.

## If files cannot be placed

- **Use the apex DNS TXT record.** GoDaddy is the registrar and DNS operator for
  most of its customers — confirmed by GoDaddy's own "Manage DNS records" doc,
  which states GoDaddy manages DNS only when the domain uses GoDaddy
  nameservers (whether registered there or added via DNS Hosting); if neither
  is true, "DNS settings are managed through a different DNS or hosting
  provider, not GoDaddy," and this fallback doesn't apply. Add a **TXT** record
  and, per GoDaddy's own wording, "Enter `@` to put the record on your root
  domain".
- **This can be automated.** GoDaddy publishes a Domains API
  (developer.godaddy.com) with `POST /v3/domains/zones/{zone}/dns-records` to
  create a record, and lego ships a `godaddy` DNS plugin driven by
  `GODADDY_API_KEY` + `GODADDY_API_SECRET`.
  **Watch the eligibility gate, and note the sources disagree.** GoDaddy's own
  help page states "Customers with at least one active domain in their account
  get access to the Domains API with a monthly usage limit of 20,000 API calls",
  alongside separate 50+-domain and US$20/month-average tiers. lego's provider
  page, however, still carries the older April-2024 restriction: "Management and
  DNS APIs: Minimum 10 domains or active Discount Domain Club plan". The
  installer must handle an API key that is rejected for eligibility rather than
  for being wrong, and fall back to asking the customer to add the TXT record by
  hand.
- **On Websites + Marketing**, the pack cannot be installed as files at all.
  Proof must come from the DNS TXT record. **UNVERIFIED:** whether Websites +
  Marketing offers any robots.txt or custom-file control in its own SEO settings
  — searched godaddy.com/help for "Websites + Marketing robots.txt", "Websites +
  Marketing upload file", and "Websites + Marketing FTP"; the only robots.txt
  guidance returned was for the separate Search Engine Visibility product and for
  WordPress, both of which assume a hosted site with a root directory.

## Sources

- https://www.godaddy.com/help/what-is-my-websites-root-directory-in-my-web-hosting-cpanel-account-16187 — primary domain root is `/public_html`; addon/subdomain roots are read from **Document Root** under cPanel → Domains → Addon Domains/Subdomains
- https://www.godaddy.com/help/change-my-addon-domain-or-subdomain-root-folder-for-web-hosting-cpanel-16170 — addon/subdomain document roots are changeable, so not safe to assume
- https://www.godaddy.com/help/enable-ssh-for-my-web-hosting-cpanel-account-16102 — SSH is off by default; Manage → Settings tab → SSH access → Manage → toggle; "you don't need to configure any public or private keys"; the cPanel password doubles as the SSH password
- https://www.godaddy.com/help/connect-to-my-web-hosting-cpanel-account-with-ssh-secure-shell-31865 — SSH/SFTP **port 22**, host is the domain or IP, username is the FTP username (same as the cPanel login name)
- https://www.godaddy.com/help/upload-files-using-my-web-hosting-cpanel-file-manager-3239 — File Manager click-path (Web Hosting → Manage → Websites → File Manager) and the "Drop files here to start uploading" / "Select file" upload controls
- https://www.godaddy.com/help/show-hidden-files-in-my-linux-hosting-account-32171 — the dotfile toggle: File Manager → Settings (upper right) → Preferences → **Web Root (public_html or www)** + **Show Hidden Files (dotfiles)** → Save; also confirms `www` as an alias of the web root
- https://www.godaddy.com/help/upload-files-to-my-windows-hosting-account-with-ftp-and-filezilla-31869 — Windows Hosting (Plesk) primary root is **httpdocs**, FileZilla on **Port 21**, no SFTP mentioned; re-fetched directly a second time to confirm no SFTP option appears anywhere on the page
- https://www.godaddy.com/help/upload-files-with-sftp-8940 — Managed WordPress SFTP: Settings → Production Site → SSH/SFTP login → Change → copy Hostname → Create New Login; no port or root directory stated
- https://www.godaddy.com/help/enable-ssh-on-managed-hosting-for-wordpress-24596 — SSH is not available on Managed WordPress **Basic** plans
- https://www.godaddy.com/help/add-the-robotstxt-file-to-my-wordpress-site-41423 — GoDaddy's official WordPress robots.txt route is Yoast SEO → robots.txt → **Create robots.txt file**, which writes a real file that will conflict with an upload
- https://www.godaddy.com/help/add-a-txt-record-19232 — TXT record click-path; "Enter `@` to put the record on your root domain"
- https://www.godaddy.com/help/manage-dns-records-680 — GoDaddy manages DNS only for domains using GoDaddy nameservers (registered there or via DNS Hosting); otherwise DNS is managed by a different provider
- https://www.godaddy.com/help/add-html-or-custom-code-to-my-site-27252 — confirms Websites + Marketing's only content-injection mechanism is a Custom Code field scoped to a page section (HTML/CSS/JS snippets), not file upload or server-file access
- https://www.godaddy.com/help/how-do-i-access-domain-related-apis-42424 — current API eligibility: at least one active domain, 20,000 calls/month (plus 50+-domain and US$20/month tiers)
- https://developer.godaddy.com/en/docs/api-users/domains/manage/dns — `POST /v3/domains/zones/{zone}/dns-records` creates a DNS record synchronously; OAuth scopes `domains.domain:read` and `domains.dns:update`
- https://go-acme.github.io/lego/dns/godaddy/ — lego `godaddy` plugin, `GODADDY_API_KEY` / `GODADDY_API_SECRET`; also carries the older "minimum 10 domains or active Discount Domain Club" eligibility note that contradicts GoDaddy's current help page
- https://go-acme.github.io/lego/dns/ — the full lego provider list, confirming `godaddy` is present
