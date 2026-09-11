# IONOS / United Internet (1&1)

- **Market share:** 2.5% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting (Linux Web Hosting / Plesk-based VPS), AND a separate SaaS site builder (MyWebsite / Website Builder) — IONOS genuinely spans both, and the two behave nothing alike for this task
- **File access:** SFTP + FTP + control-panel file manager (Webspace Explorer) on Web Hosting / Managed Dedicated Server / Plesk products — but **admin UI only, no file access at all** on MyWebsite / Website Builder
- **Automatable by the CiteFleet script (rclone):** partly — yes on Linux Web Hosting via SFTP (port 22); no on MyWebsite/Website Builder (no filesystem exposed to the customer at all); Windows Hosting is FTPS-only, not SFTP
- **Docs consulted:** https://www.ionos.com/help/domains/general-information-about-domain-usage/modifying-a-domains-destination/, https://www.ionos.co.uk/help/domains/connecting-a-domain-to-your-webspace/connecting-a-domain-to-a-webspace-directory/, https://www.ionos.com/help/hosting/using-php-for-web-projects/determining-the-absolute-path-document-root-of-your-webspace/, https://www.ionos.com/help/hosting/managing-webspace-with-webspace-explorer/uploading-a-file-using-webspace-explorer/, https://www.ionos.com/help/hosting/managing-webspace-with-webspace-explorer/what-is-the-webspace-explorer/, https://www.ionos.com/help/hosting/ftp-ssh-webfiles/, https://www.ionos.com/help/hosting/setting-up-and-managing-ftp-access/connection-details-for-ftp/sftp-in-ionos-web-hosting/, https://www.ionos.com/help/hosting/setting-up-and-managing-ftp-access/creating-an-sftp/ssh-account/, https://www.ionos.co.uk/help/hosting/setting-up-and-managing-ftp-access/setting-up-the-main-sftp-user/, https://www.ionos.com/help/hosting/setting-up-and-managing-ftp-access/creating-new-ftpsftp-accounts/, https://www.ionos.com/help/websites-stores/mywebsite-2008-2017/setting-up-mywebsite/ftp-access-in-mywebsite/, https://www.ionos.com/help/domains/configuring-txt-and-srv-records/managing-txt-records/, https://www.ionos.com/help/hosting/ionos-apis/ionos-developer-apis/, https://developer.hosting.ionos.com/docs/dns, https://go-acme.github.io/lego/dns/ionos/, fetched 2026-09-11

## Where the web root is

IONOS shared hosting does **not** use a fixed `public_html`-style name. The
webspace root is `/`, and a domain is connected to a **destination folder**
that the customer chooses in the panel, not a hardcoded path:

- **Click-path to see/change which folder a domain serves from:** log in to
  IONOS → **Domains & SSL** → select the domain → **Details** tab →
  **Adjust Destination** → pick the webspace folder (or click the pencil icon
  to type a path directly, e.g. `/my-websites/wordpress-blog`) → **Save**.
  IONOS's own docs describe this generically as "Connection to your webspace"
  under "Simple Types of Use," changeable at any time without side effects.
- **A domain is connected to the webspace root by default.** A second (or
  additional) domain's root is simply another **subfolder created under that
  same root** (e.g. `/seconddomain/`) which is then assigned to it via the
  same Adjust Destination flow — all domains on one contract share one
  webspace unless the customer buys a second, separate hosting contract.
  IONOS explicitly recommends a **new, separate contract with a new,
  dedicated webspace** if true filesystem-level separation between domains is
  required, because directory assignment for an FTP/SFTP account (see below)
  is not itself a security boundary.
- **Absolute path format depends on contract age** — do not hardcode it. IONOS
  documents two shapes:
  - Contracts before 2026-07-21: `/kunden/homepages/26/d123456789/htdocs/`
  - Contracts from 2026-07-21 onward: `/home/www/`
  To find the real value: **Menu → Hosting** → **Webspace** tile → **Use
  Webspace** (opens **Webspace Explorer**) → click the path shown next to
  "Path:" → the popup shows "Absolute path".
- **Plesk-based products** (IONOS's Plesk-panel VPS/Cloud offerings) use the
  standard Plesk layout instead: **Websites & Domains → Add Domain**, and with
  the default "Create a new webspace" option, Plesk creates an **`httpdocs/`**
  folder per domain as its document root — the customer uploads via
  **Websites & Domains → (domain) → File Manager → httpdocs**.
- **MyWebsite / Website Builder has no web root a customer can reach at all.**
  IONOS states plainly: *"MyWebsite is one of the website builders in which no
  FTP access is required... You can make changes to your MyWebsite directly
  online in your browser. FTP access is not necessary for this."* For the
  newer "MyWebsite Now" product IONOS is even more explicit: *"FTP and
  .htaccess not supported in MyWebsite Now."* There is no document root to
  install files into short of upgrading to a real hosting contract.

## Steps to install the five files

**On Linux Web Hosting / Managed Dedicated Server, via SFTP (unattended, rclone):**

1. In the panel: **Menu → Hosting → SFTP & SSH** tile → **Set up** (first
   time) or **Manage** → **Create new account**. Set a password.
2. Optionally click **Change** next to **Directory:** to scope this account to
   a specific webspace folder instead of the whole webspace root — IONOS notes
   this restriction applies "only at the FTPS/SFTP level," not to PHP or web
   access.
3. Read the exact hostname shown in the panel for this account. IONOS's
   current connection-details doc gives the form
   `access123456789.webspace-data.io`; other IONOS material (and the wild)
   still shows the older `homeXXXXXXXX.1and1-data.host` form — **use whatever
   the customer's own panel currently displays**, don't hardcode either
   pattern. Protocol is **SFTP, port 22**, on Linux hosting / Managed
   Dedicated Server.
4. Point rclone at it (`type = sftp`, that host, port 22, the SFTP username,
   password or key).
5. Upload `robots.txt`, `sitemap.xml`, `llms.txt`, and `<indexnow-key>.txt` to
   the destination folder that is assigned to the target domain (the webspace
   root `/` by default, or the subfolder set via Adjust Destination — see
   above). Create `.well-known/botcentral.txt` there too if pursuing the file
   route (see next section — DNS TXT is the recommended route instead).

**By hand, via Webspace Explorer (any Linux Web Hosting / Managed Dedicated Server plan):**

1. **Menu → Hosting → Webspace** tile → **Use Webspace** (opens **Webspace
   Explorer**).
2. Click into the folder that is the target domain's assigned destination
   (root `/` unless it was pointed elsewhere).
3. Click **Upload**, select the file(s), click **Upload** again. Repeat for
   each of the four root files.

**Plesk-based VPS/Cloud:** **Websites & Domains → (domain) → File Manager →
httpdocs** → upload the four root files there; create `.well-known` and
`botcentral.txt` inside it the same way (standard Plesk File Manager, which
does not hide dotfiles/dot-folders).

**IONOS Managed WordPress:** the dashboard has **SEO → Tools → File Editor**
for `robots.txt`, but WordPress's own virtual robots.txt is silently
overridden the moment a real file exists on disk, so the reliable path is the
same SFTP route as above (IONOS documents a WordPress-specific flow: "Creating
an SFTP user for WordPress"). Use SFTP for `sitemap.xml`, `llms.txt`, and the
IndexNow key file, since the dashboard only exposes robots.txt editing.

**MyWebsite / Website Builder:** **not possible** — see "If files cannot be
placed" below.

## The `.well-known/` problem

**UNVERIFIED whether Webspace Explorer / IONOS's File Manager lets a customer
create a folder name that starts with a dot, or whether it hides dotfiles by
default.** Searched: "IONOS Webspace Explorer create new folder dot",
"IONOS Webspace Explorer hidden files show dotfiles", "IONOS help .well-known
directory hidden files webspace", and the Webspace Explorer overview and
upload help pages directly — none of IONOS's official docs state either way.
The one dotfile-adjacent official mention found is about **editing rights on
an existing `.htaccess`** (right-click → Change rights → 644), which implies
`.htaccess` is at least visible/editable in Webspace Explorer, but this is not
the same claim as being able to **create** a new dot-prefixed directory.

Also **UNVERIFIED** whether IONOS reserves `.well-known/` for its own SSL
issuance on shared webspace. IONOS's own SSL docs describe "IONOS-managed"
certificates as installed and renewed automatically without customer file
placement, and IONOS Cloud's ACME tooling (docs.ionos.com/cloud/.../acme) uses
**DNS TXT-based** ACME validation, not an HTTP `.well-known/acme-challenge`
file — so there's no documented indication that shared-webspace `.well-known/`
is IONOS-managed or off-limits, but it is likewise not confirmed to be free
for arbitrary customer use.

**Given both are unverified, the correct answer per the task brief is: skip
the file and use the DNS TXT record instead.** IONOS's DNS management is
confirmed and straightforward: **Domains & SSL → (domain) → gear icon under
Actions → DNS → Add Record → Type: TXT** → set host name (e.g. `@`) and value
→ **Save**
(https://www.ionos.com/help/domains/configuring-txt-and-srv-records/managing-txt-records/).
This sidesteps the dotfile question entirely, and BotCentral scores the DNS
proof higher regardless.

If a customer insists on the file anyway: creating the directory **over an
SFTP client** (WinSCP/FileZilla/rclone `mkdir`) rather than through the
browser Webspace Explorer is worth trying first, since any restriction visible
in Webspace Explorer would most plausibly be a File-Manager UI/display
limitation rather than a filesystem one — but this is a suggestion, not a
documented guarantee, and remains unverified against official IONOS docs.

## Gotchas

- **Windows Hosting (ASP.NET) is FTPS-only, not SFTP** — port 21 (explicit
  FTP over TLS / FTPES) or port 990 (implicit FTP over TLS). Only Linux Web
  Hosting and Managed Dedicated Server offer SFTP on port 22. Confirm the
  customer's OS/plan before assuming port 22 will work.
- **Two generations of SFTP/FTP docs exist**, split at contracts ordered
  around 2024-08-29/2024-09-10: "Setting up the main SFTP user" (legacy
  packages, purchased before then) vs. "Creating an SFTP/SSH Account"
  (current packages). The click-path and terminology differ slightly —
  confirm which applies before scripting against a specific customer.
- **Directory scoping for an FTP/SFTP account is enforced only at the
  FTP/SFTP protocol layer**, not for PHP scripts or plain web access — IONOS
  states this explicitly, so don't treat it as a real security boundary.
- **No IP allowlisting feature is documented** for SFTP/FTP account access
  (searched the account-creation and connection-details pages; neither
  mentions it).
- **Hostname naming is inconsistent across IONOS's own docs** —
  `access123456789.webspace-data.io` in the current connection-details page,
  `homeXXXXXXXX.1and1-data.host` elsewhere/historically. Always read the
  literal value shown in the customer's own panel rather than constructing it.
  IONOS itself notes some FTP clients fail on the `.host`-ending hostname and
  recommends creating a custom FTP subdomain as a workaround.
- **Absolute document-root path shape changed with contract age**
  (`/kunden/homepages/.../htdocs/` vs. `/home/www/`) — never hardcode it;
  resolve it live via Webspace Explorer's "Absolute path" popup.
- **MyWebsite / Website Builder has zero file access** — this is a large
  share of IONOS's customer base and the pack simply cannot be installed
  there without a plan change.
- **MyWebsite auto-generates its own `sitemap.xml`** ("MyWebsite automatically
  creates a sitemap.xml with all the pages of your website" per IONOS's
  digitalguide); this is not customer-editable content and is not the same
  as installing CiteFleet's file.
- **WordPress's virtual robots.txt loses to a real file on disk** — once a
  physical `robots.txt` is uploaded via SFTP, it takes precedence over
  anything WordPress or a dashboard editor would otherwise serve, on any host
  including IONOS Managed WordPress.

## If files cannot be placed

- **MyWebsite / Website Builder customers:** there is no in-product
  workaround. Either (a) upgrade the contract to a Linux Web Hosting plan to
  get webspace + SFTP and follow the steps above, or (b) stay on MyWebsite and
  use the **DNS TXT record** for the BotCentral proof (IONOS runs the DNS for
  most of its customers — see the DNS section above), accepting that
  `llms.txt` and the IndexNow key file cannot be hosted at all, and that
  `robots.txt`/`sitemap.xml` are whatever MyWebsite itself generates.
- **Any product, if `.well-known/botcentral.txt` specifically cannot be
  created** (dot-folder blocked, or no SFTP access): use the apex **DNS TXT
  record** instead — confirmed working via Domains & SSL → DNS → Add Record →
  TXT, and BotCentral scores this proof method higher than the file anyway.
- **DNS API for automation:** IONOS publishes a self-service Developer API at
  https://developer.hosting.ionos.com/docs (customers create their own API
  key per https://developer.hosting.ionos.com/docs/getstarted, referenced from
  https://www.ionos.com/help/hosting/ionos-apis/ionos-developer-apis/), with a
  dedicated DNS API at https://developer.hosting.ionos.com/docs/dns. This is
  independently confirmed by the ACME ecosystem: lego
  (github.com/go-acme/lego) ships an `ionos` DNS provider
  (https://go-acme.github.io/lego/dns/ionos/) driven by a single
  `IONOS_API_KEY` environment variable (format `<prefix>.<secret>`, optional
  `_FILE` suffix variants, plus `IONOS_TTL`/`IONOS_POLLING_INTERVAL`/
  `IONOS_PROPAGATION_TIMEOUT`/`IONOS_HTTP_TIMEOUT`), which references the same
  getstarted/dns docs URLs — meaning the TXT-record fallback can be scripted
  end-to-end without the customer touching the panel each time, on any IONOS
  plan tier including MyWebsite (DNS is managed separately from hosting).

## Sources

- https://www.ionos.com/help/domains/general-information-about-domain-usage/modifying-a-domains-destination/ — "Adjust Destination" click-path on the domain's Details tab; connecting to webspace is a freely-changeable "Simple Type of Use"
- https://www.ionos.co.uk/help/domains/connecting-a-domain-to-your-webspace/connecting-a-domain-to-a-webspace-directory/ — confirms a domain is pointed at a customer-assigned webspace directory ("the webspace directory you have assigned to the domain"), and the webspace/contract prerequisite
- https://www.ionos.com/help/hosting/using-php-for-web-projects/determining-the-absolute-path-document-root-of-your-webspace/ — click-path to the absolute path popup, and the two documented path shapes (`/kunden/homepages/.../htdocs/` pre-2026-07-21 vs `/home/www/` from that date)
- https://www.ionos.com/help/hosting/managing-webspace-with-webspace-explorer/uploading-a-file-using-webspace-explorer/ — exact Webspace Explorer upload click-path (select folder → Upload → choose files → Upload)
- https://www.ionos.com/help/hosting/managing-webspace-with-webspace-explorer/what-is-the-webspace-explorer/ — what Webspace Explorer is and does (upload/download/move/delete/copy/edit), available for Linux Web Hosting and Managed Dedicated Server
- https://www.ionos.com/help/hosting/ftp-ssh-webfiles/ — overview of FTP/SSH/Webfiles article set; confirms SFTP/SSH account creation flow differs for tariffs from 2024-08-29 onward
- https://www.ionos.com/help/hosting/setting-up-and-managing-ftp-access/connection-details-for-ftp/sftp-in-ionos-web-hosting/ — hostname example `access123456789.webspace-data.io`; SFTP port 22 on Linux/Managed Server; FTPS on port 21 (explicit) or 990 (implicit) for Windows Hosting
- https://www.ionos.com/help/hosting/setting-up-and-managing-ftp-access/creating-an-sftp/ssh-account/ — current (contracts from 2024-08-29) SFTP/SSH account creation click-path; directory can be restricted via "Directory: → Change," but only at the SFTP level, not for PHP; no IP-allowlisting option mentioned
- https://www.ionos.co.uk/help/hosting/setting-up-and-managing-ftp-access/setting-up-the-main-sftp-user/ — legacy (pre-2024-09-10 / pre-2024-09-27) main SFTP user setup; confirms an SFTP user exists by default on package initialization
- https://www.ionos.com/help/hosting/setting-up-and-managing-ftp-access/creating-new-ftpsftp-accounts/ — legacy FTP/SFTP account creation; directory restriction confirmed "only at the FTPS/SFTP level," and the recommendation to use a separate contract for true separation
- https://www.ionos.com/help/websites-stores/mywebsite-2008-2017/setting-up-mywebsite/ftp-access-in-mywebsite/ — "MyWebsite is one of the website builders in which no FTP access is required"; changes are made in-browser instead
- https://www.ionos.com/help/domains/configuring-txt-and-srv-records/managing-txt-records/ — exact click-path to add/edit/delete a TXT record (Domains & SSL → gear/Actions → DNS → Add Record → TXT)
- https://www.ionos.com/help/hosting/ionos-apis/ionos-developer-apis/ — confirms IONOS Developer APIs cover domains, DNS, and SSL, and that a customer must first generate API credentials via the linked getstarted doc
- https://developer.hosting.ionos.com/docs/dns — the official DNS API documentation location (page did not return readable content to the fetch tool; existence and scope confirmed indirectly via the ionos-developer-apis help page and the lego `ionos` provider doc, both of which link/reference it)
- https://go-acme.github.io/lego/dns/ionos/ — confirms lego's `ionos` DNS provider exists, using `IONOS_API_KEY` (and `_FILE` variants, plus TTL/timeout/polling env vars), and links to the same getstarted/dns docs
