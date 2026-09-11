# Newfold Digital — Bluehost, HostGator, Network Solutions

- **Market share:** 2.4% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting (all three brands are consumer/SMB shared hosting; Bluehost and HostGator also sell VPS/dedicated tiers)
- **File access:** control-panel file manager + FTP/FTPS everywhere; SFTP present on all three but gated differently — Bluehost shared requires an explicit one-time SSH-enable step, HostGator shared works out of the box except on its managed "Optimize WordPress" tier, Network Solutions ties it to "UNIX nsHosting Shared" accounts specifically
- **Automatable by the CiteFleet script (rclone):** partly, and it differs by brand — HostGator: yes on ordinary shared/Business plans (SFTP port 2222, cPanel credentials, no documented enable step); Bluehost: partly (SFTP port 22 works once SSH/Shell access is turned on per-account, and only the primary account username can use it); Network Solutions: partly/**UNVERIFIED** (SFTP port 22 exists via an "SFTP Account Manager" but the docs don't show a scriptable credential-issuance path, and there is no confirmed DNS API for the fallback TXT record)
- **Docs consulted:** https://www.bluehost.com/help/article/file-manager-uploading-files, https://www.bluehost.com/help/article/accessing-the-file-manager, https://www.bluehost.com/help/article/where-to-upload-files-for-an-addon-domain, https://www.bluehost.com/help/article/sftp, https://www.bluehost.com/help/article/ssh-access, https://www.bluehost.com/help/article/am-ssh-access, https://www.bluehost.com/help/article/dns-management-add-edit-or-delete-dns-entries, https://www.bluehost.com/help/article/cloudflare-enable-cdn, https://www.bluehost.com/help/article/optimizing-ai-search-llms-txt-yoast-seo, https://www.bluehost.com/blog/new-bluehost-account-manager/, https://www.hostgator.com/help/article/how-to-navigate-through-file-manager, https://www.hostgator.com/help/article/how-to-createeditdelete-a-file-using-the-file-manager, https://www.hostgator.com/help/article/secure-ftp-sftp-and-ftps, https://www.hostgator.com/help/article/manage-dns-records-with-hostgatorenom, https://www.hostgator.com/help/article/how-to-change-dns-zones-mx-cname-and-a-records, https://www.hostgator.com/help/article/where-do-i-go-to-login-to-my-control-panel, https://www.networksolutions.com/help/article/access-the-web-hosting-control-panel, https://www.networksolutions.com/help/article/how-to-manage-website-files-using-file-manager, https://www.networksolutions.com/help/article/configure-sftp-on-networksolutions, https://www.networksolutions.com/help/article/manage-dns-adns-records, https://go-acme.github.io/lego/dns/, https://go-acme.github.io/lego/dns/cpanel/, fetched 2026-09-11

## Where the web root is

### Bluehost

`public_html/` for the primary domain, confirmed in the addon-domain article. Bluehost
runs its own panel now — the **Bluehost Account Manager** (which superseded an
earlier in-house panel nicknamed "Rock"/"Bluerock" in 2018) — but stock cPanel is
still reachable underneath it via an **Advanced** menu item, with no separate
cPanel login required while already signed in.

For an addon domain, Bluehost auto-creates a dedicated subfolder inside
`public_html`:

```
public_html/<addon_domain_foldername>
```

The exact folder name is account-specific; Bluehost tells customers to read the
**Document Root** field on the **Files & Access** tab of the Account Manager
rather than assume a name.

### HostGator

`public_html` (or, per HostGator's own File Manager settings dialog, "**Web Root
(public_html or www)**" — the article treats the two as synonyms). HostGator is
stock cPanel for shared hosting: server hostnames look like `gator1234.hostgator.com`
or `secure1234.hostgator.com`, and cPanel itself is reachable directly at that
hostname on port **2083**, or launched from the Customer Portal's Hosting/Websites
tab without re-entering the cPanel password (documented SSO).

### Network Solutions

**UNVERIFIED** as a fixed name. The official File Manager and control-panel-access
articles describe only a generic "hosting control panel" and say a customer has
"one root directory that contains all other directories and files" — they never
print a literal `public_html` (or equivalent) path. Network Solutions also has more
than one hosting stack in its own docs: a "Powered By Network Solutions" (PBNS)
panel, a legacy "NameSecure" panel, and — based on a DNS help-article URL found
during this research (`.../help/article/manage-dns-adns-web`, i.e. "support.web.com")
— hosting for at least some accounts appears to run on Web.com's platform (Web.com
and Network Solutions are sister brands under Newfold). None of the fetched articles
confirm which stack a given customer is on or what its root directory is literally
called. Treat the root directory name as **account-specific and to be confirmed
from that customer's own control panel**, not assumed as `public_html`.

## Steps to install the five files

### Bluehost

**Unattended, via rclone over SFTP:**

1. Confirm SSH/Shell access is enabled. On shared hosting this is off by default:
   either cPanel → **Security** → **SSH/Shell Access** → **Manage SSH Access** →
   choose **Real Shell (Bash)** → **Submit**, or, in the modern Account Manager,
   **Websites** → **Manage Site** → **Files & Access** tab → **SSH** section →
   **Manage**. If the account is unverified, Bluehost's own error text is "Your
   account must be verified before shell access can be enabled" and requires
   contacting Bluehost's verification team first.
2. Connect rclone's `sftp` backend to the domain name or server IP on **port 22**,
   using the **primary cPanel/account username only** — Bluehost states
   additional FTP users created in the panel cannot authenticate over SFTP.
3. Upload `robots.txt`, `sitemap.xml`, `llms.txt`, `<indexnow-key>.txt` into
   `public_html/` (or `public_html/<addon_domain_foldername>` for an addon
   domain), and `.well-known/botcentral.txt` — see the dotfile section below.

**By hand, via Bluehost's File Manager:**

1. Bluehost Portal → **Hosting** → **File Manager** button (or: **Websites** →
   **Manage Site** → **Files and Access** tab → **File Manager** → **Manage**).
2. Click **Upload** → **Select File** → choose the file. Maximum upload size is
   documented as 500 MB; for anything larger, or multiple files, Bluehost's own
   advice is to use FTP or a `.zip`.

### HostGator

**Unattended, via rclone over SFTP:**

1. No documented enable step for eligible plans — SFTP is stated to be "allowed
   on any server" except HostGator's managed **Optimize WordPress** tier and
   Windows Shared plans (which have no SSH service at all).
2. Point rclone at the domain, server IP, or server name, on **port 2222** for
   shared hosting (**port 22** for VPS/Dedicated). Authenticate with the cPanel
   username and password — HostGator states other FTP logins created in the
   panel will not work over SFTP.
   **Prefer a key over that password.** HostGator's SSH article documents key
   auth on shared hosting: cPanel → **SSH Access** → **Generate a New Key** or
   **Import Key**. Importing CiteFleet's public key avoids storing the
   customer's cPanel password (which is also their panel login) in the rclone
   config, and gives HostGator the best unattended story of the three brands.
   HostGator also notes "We offer locked SSH, which is limited to your account
   only."
3. Upload the four root files and create `.well-known/botcentral.txt` (see below).

FTPS is also available on all non-Optimize, non-Windows-Shared plans, host
`ftpes://<domain-or-ip-or-servername>`, **port 21**, "Explicit" mode.

**By hand, via HostGator's File Manager:**

1. Customer Portal → **Hosting** → **File Manager**.
2. Top-right **Settings** → choose **"Web Root (public_html or www)"** → Save,
   so File Manager opens directly into the web root each time.
3. Use the **Upload** control (separate HostGator article walks through
   selecting and uploading a file) to place the four root-level files.

### Network Solutions

**By hand — this is the primary documented path; unattended scripting is not
confirmed (see Gotchas):**

1. Log in at networksolutions.com/my-account/login → **Websites & Hosting** →
   **Manage** next to the hosting package (if more than one exists).
2. In the hosting control panel, find **File Manager** under "Most Popular
   Tools" or the "FTP & Content Publishing" section.
3. Click **Upload**, select the file (or paste a URL), click **Upload**.
   Network Solutions' own docs warn File Manager "is designed to handle smaller
   file uploads and will time out with larger files" and recommend uploading in
   batches if a transfer would run past 60 seconds — irrelevant for these five
   small text files, but worth knowing for anything bigger later.
4. If SFTP is preferred instead: retrieve host, username and port from the
   panel's **SFTP Account Manager**, then connect on **port 22** (documented for
   "UNIX nsHosting Shared" accounts). No explicit SSH-enable step is documented —
   credentials appear to be issued directly from that panel screen.

## The `.well-known/` problem

### Bluehost

**UNVERIFIED for Bluehost's own File Manager.** None of the fetched Bluehost
help articles (uploading files, accessing File Manager) mention a hidden-files
toggle or confirm whether the Account Manager's File Manager can create a
dot-prefixed directory at all. Bluehost's Account Manager Guide does confirm
that stock cPanel is still reachable via an **Advanced** menu item while signed
in — if the customer drops into that legacy cPanel File Manager, the standard
cPanel toggle (**Settings** → **Show Hidden Files (dotfiles)** → **Save**,
confirmed below for HostGator's identical cPanel) should apply, but this was not
found confirmed in a Bluehost-branded document. Given the uncertainty, and that
this file is optional, **use the DNS TXT record instead** (see below).

### HostGator

**Confirmed and works.** HostGator's File Manager hides dotfiles by default,
stock cPanel behavior: open the site's document root, click **Settings** in the
upper-right corner, check **"Show Hidden Files (dotfiles)"**, click **Save**.
Folder creation also works with a leading dot: click **"Folder"** at the top of
the File Manager, type the name (`.well-known` is accepted — HostGator's own
docs note `.well-known` "is a legitimate dot-folder — it's an IETF standard"),
click **"Create New Folder"**, then create `botcentral.txt` inside it the same
way as any other file.

### Network Solutions

**UNVERIFIED.** No hidden-files toggle, dotfile handling, or dot-prefixed
directory creation is mentioned anywhere in the fetched File Manager or
control-panel documentation. Given this file is optional and Network Solutions'
own docs are silent on the point, **do not attempt it here — use the DNS TXT
record instead** (Network Solutions does run its own DNS, see below).

### All three brands

Per the task brief, this file is optional: an apex DNS **TXT** record proves
the same ownership claim and BotCentral scores it higher. For Bluehost and
Network Solutions specifically, where the panel behavior is unconfirmed, the
TXT record is the recommended primary route rather than a fallback.

## Gotchas

- **Bluehost SSH must be turned on per-account before SFTP works**, and an
  unverified account gets a hard error ("Your account must be verified before
  shell access can be enabled") requiring a support/verification step —
  something an unattended first-run script cannot clear on its own.
- **Bluehost SFTP only authenticates as the primary account username**;
  additional FTP users made in the panel silently fail over SFTP — a script
  that provisions a dedicated FTP user for CiteFleet will not be able to use it
  over SFTP on Bluehost shared hosting.
- **HostGator's SFTP port is 2222 on shared hosting, not 22** (VPS/Dedicated
  uses 22) — a naive rclone config defaulting to port 22 will fail silently
  against shared HostGator.
- **HostGator's managed "Optimize WordPress" plan and Windows Shared plans have
  no SSH/SFTP at all** — FTPS (port 21) or the File Manager are the only options
  there.
- **Cloudflare caches `robots.txt` on Bluehost by default.** Bluehost's own
  Cloudflare CDN doc states plainly: "By default Cloudflare caches a website's
  robots.txt." An uploaded/updated `robots.txt` will keep serving the old
  content until the customer purges cache (Cloudflare dashboard → **Caching**
  tab → **Purge Everything**). The same applies to any file served through that
  CDN, so a freshly-uploaded `llms.txt` or `sitemap.xml` can also appear stale
  for a period after upload.
- **HostGator's SiteLock TrueShield/TrueSpeed is a comparable CDN** bundled into
  SiteLock plans; the same purge-before-you-trust-it caution applies, though no
  HostGator doc was found stating a specific default cache duration for
  `robots.txt`/`sitemap.xml` the way Bluehost's Cloudflare doc does —
  **UNVERIFIED** for the exact HostGator behavior; only the presence of the CDN
  itself is confirmed.
- **Bluehost auto-generates a WordPress sitemap with no plugin needed** —
  Bluehost's own blog states a WordPress install through Bluehost gets a working
  `yoursite.com/wp-sitemap.xml` automatically (WordPress core's native sitemap
  feature). This is on bluehost.com but is blog content, not a formal help
  article, so treat the specific claim as **directionally confirmed, not a
  guarantee for every install**.
- **A physical `robots.txt` on disk wins over WordPress's virtual one** — this
  is general WordPress core behavior (a real file at the web root is served
  directly by the webserver and is never routed through WordPress's dynamic
  `do_robots()` fallback), not something documented specifically by Newfold.
  **UNVERIFIED against a Newfold-specific doc** — no Bluehost/HostGator/Network
  Solutions help article was found asserting this explicitly; it was corroborated
  only via general WordPress-ecosystem sources, so verify empirically per site
  (upload the file, then check what `curl` returns) rather than assuming it from
  this doc alone.
- **Bluehost's `llms.txt` help article describes only a Yoast-SEO-managed
  version**, not a manually uploaded file — if the customer has that Yoast
  toggle on, it and CiteFleet's uploaded `llms.txt` can conflict; treat this the
  same as the WordPress sitemap/robots.txt conflict above and verify by request.
- **Network Solutions may not be one product.** The docs reference at least
  three different hosting/panel lineages (PBNS, NameSecure, and what looks like
  Web.com-powered hosting) without saying which a given customer is on — a
  generic Network Solutions installer cannot assume a single click-path and
  should detect or ask which panel the account actually has.

## If files cannot be placed

- **Preferred fallback across all three brands: an apex DNS TXT record.** All
  three run their own customer-facing DNS:
  - **Bluehost:** Domains → **Manage** → **DNS** tab (Account Manager) or
    Domains → **Zone Editor** (legacy) → **+ Add Record** → Type **TXT** → Host
    `@` → paste the value → Save.
  - **HostGator:** two documented UIs coexist — the newer Customer Portal
    (**Domains** tab → select domain → **DNS** tab → **+ Add Record**, "no need
    to use cPanel") and the older cPanel **Zone Editor** (**Domains** → **Zone
    Editor** → **Manage** → **+Add Record** → Type **TXT**).
  - **Network Solutions:** **Domains** → select the domain → **Advanced Tools**
    section → **Manage** next to Advanced DNS Records → **+ Add Record** →
    **Text (TXT Records)** → **Edit TXT Records** → Host `@`, TXT value, TTL
    3600 → **Continue** → **Save Changes**. Network Solutions' own doc warns
    changes can take **up to 48 hours** to propagate.
- **No automation API was found for any of the three brands**, consistent with
  the task's premise: lego (github.com/go-acme/lego) has no `bluehost`,
  `hostgator`, `networksolutions`, or `newfold` DNS provider
  (https://go-acme.github.io/lego/dns/ lists providers alphabetically and none
  of those names appear), only `cpanel`, `plesk`, and `directadmin` among
  panel-style entries. The lego `cpanel` plugin needs three inputs —
  `CPANEL_USERNAME`, `CPANEL_TOKEN` (an API token), and `CPANEL_BASE_URL` (e.g.
  `https://example.com:2083`) — per https://go-acme.github.io/lego/dns/cpanel/.
  - **HostGator is plausible but UNVERIFIED for this route.** HostGator shared
    hosting is confirmed stock cPanel reachable directly at
    `https://<server-hostname>:2083`, which is the shape the lego `cpanel`
    plugin expects. Generic cPanel (not HostGator-specific) documentation shows
    a **Security → Manage API Tokens** screen for issuing `CPANEL_TOKEN` values.
    However, no HostGator-branded help article was found confirming that
    "Manage API Tokens" is present/enabled on their shared-hosting cPanel
    build for ordinary customers — searched `site:hostgator.com` for "API
    token"/"API Tokens" and HostGator's own developer-facing pages, and found
    none. Treat this as **worth trying, not guaranteed** — the operator should
    log into a real HostGator cPanel and check for Security → Manage API
    Tokens before relying on it.
  - **Bluehost and Network Solutions are not on stock cPanel for most
    customers** (Bluehost's primary surface is its own Account Manager; Network
    Solutions' panel identity is itself unconfirmed — see above), so the lego
    `cpanel` plugin is not expected to apply there even where legacy cPanel
    access exists underneath.
  - **Conclusion: for all three brands, the TXT record must be added by hand in
    the panel** using the click-paths above; do not build an automated DNS path
    for this integration without first manually confirming cPanel API-token
    access on the specific HostGator account in question.
- **If neither file placement nor DNS is possible** (e.g., the customer refuses
  panel access entirely), fall back to whatever proof mechanism BotCentral
  accepts short of file/DNS verification, per the main CiteFleet integration
  docs — no Newfold-specific alternative was found or expected to exist.

## Sources

- https://www.bluehost.com/help/article/file-manager-uploading-files — Bluehost File Manager click-path (Hosting → File Manager → Upload → Select File), 500 MB upload cap, no mention of hidden files or public_html
- https://www.bluehost.com/help/article/accessing-the-file-manager — two ways to reach File Manager (Hosting tab; Websites → Manage Site → Files and Access tab), confirms the panel is branded "Bluehost Portal"/"Bluehost Account Manager", not cPanel
- https://www.bluehost.com/help/article/where-to-upload-files-for-an-addon-domain — addon domains live at `public_html/<addon_domain_foldername>`, exact name shown in the Document Root field on Files & Access
- https://www.bluehost.com/help/article/sftp — SFTP hostname (domain/server IP) and port 22 for shared hosting; shared requires enabling SSH/Shell access first; only the primary account username can use SFTP
- https://www.bluehost.com/help/article/ssh-access — legacy cPanel path to enable SSH (Security → SSH/Shell Access → Manage SSH Access → Real Shell (Bash) → Submit) and the "account must be verified" error condition
- https://www.bluehost.com/help/article/am-ssh-access — modern Account Manager path to SSH management (Websites → Manage Site → Files & Access → SSH → Manage)
- https://www.bluehost.com/help/article/dns-management-add-edit-or-delete-dns-entries — Bluehost runs its own nameservers by default; confirms cPanel-based Zone Editor click-path for DNS entries; no API mentioned
- https://www.bluehost.com/help/article/cloudflare-enable-cdn — confirms Bluehost bundles Cloudflare CDN and that "by default Cloudflare caches a website's robots.txt", requiring a cache purge after updates
- https://www.bluehost.com/help/article/optimizing-ai-search-llms-txt-yoast-seo — Bluehost's `llms.txt` support is via the Yoast SEO plugin toggle, not a manually uploaded file; no mention of File Manager or override behavior
- https://www.bluehost.com/blog/new-bluehost-account-manager/ — confirms Bluehost moved Legacy → "Rock"/"Bluerock" (2018) → Account Manager (current), with stock cPanel still reachable via an Advanced menu
- https://www.hostgator.com/help/article/how-to-navigate-through-file-manager — File Manager Settings dialog offers "Web Root (public_html or www)" as a saved starting location, and a separate "Show Hidden Files (dotfiles)" setting
- https://www.hostgator.com/help/article/how-to-createeditdelete-a-file-using-the-file-manager — exact click-path to create a new folder ("Folder" button → name → "Create New Folder"), including a dot-prefixed name
- https://www.hostgator.com/help/article/secure-ftp-sftp-and-ftps — SFTP port 2222 (shared)/22 (VPS-Dedicated), available on any server except Optimize WordPress and Windows Shared plans; FTPS port 21, "Explicit" mode; only cPanel credentials work
- https://www.hostgator.com/help/article/how-do-i-get-and-use-ssh-access — HostGator shared hosting supports SSH **key** auth (cPanel → SSH Access → "Generate a New Key" / "Import Key"), port 2222 for shared, and offers "locked SSH, which is limited to your account only" — the basis for keyless-password unattended rclone on HostGator
- https://www.hostgator.com/help/article/manage-dns-records-with-hostgatorenom — newer HostGator Customer Portal DNS UI (Domains → domain → DNS tab → +Add Record), explicitly says cPanel is no longer required for this
- https://www.hostgator.com/help/article/how-to-change-dns-zones-mx-cname-and-a-records — legacy cPanel Zone Editor click-path (Domains → Zone Editor → Manage → +Add Record → Type)
- https://www.hostgator.com/help/article/where-do-i-go-to-login-to-my-control-panel — confirms HostGator shared hosting runs stock cPanel, reachable at a `gator####`/`secure####`.hostgator.com hostname on port 2083, and via Customer Portal SSO
- https://www.networksolutions.com/help/article/access-the-web-hosting-control-panel — login path (Websites & Hosting → Manage); does not name the panel as cPanel or otherwise
- https://www.networksolutions.com/help/article/how-to-manage-website-files-using-file-manager — File Manager click-path (Most Popular Tools/FTP & Content Publishing → File Manager → Upload); root directory described only generically, no `public_html` name given; no mention of hidden files/dotfiles; upload timeout warning for larger transfers
- https://www.networksolutions.com/help/article/configure-sftp-on-networksolutions — SFTP on "UNIX nsHosting Shared" accounts, port 22, credentials issued via an "SFTP Account Manager" in the hosting control panel; no explicit SSH-enable step documented
- https://www.networksolutions.com/help/article/manage-dns-adns-records — Network Solutions runs its own Advanced DNS Manager; click-path to add a TXT record (Domains → Advanced Tools → Manage Advanced DNS Records → +Add Record → Text (TXT Records) → Host `@`, value, TTL 3600 → Save Changes); notes propagation up to 48 hours
- https://go-acme.github.io/lego/dns/ — confirms the full lego DNS provider list has no `bluehost`, `hostgator`, `networksolutions`, or `newfold` entry, but does list `cpanel`, `plesk`, and `directadmin`
- https://go-acme.github.io/lego/dns/cpanel/ — lego's `cpanel` provider requires `CPANEL_USERNAME`, `CPANEL_TOKEN`, and `CPANEL_BASE_URL` (e.g. `https://example.com:2083`), i.e. a cPanel API token, not just a control-panel password
