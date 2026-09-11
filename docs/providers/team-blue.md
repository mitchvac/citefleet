# team.blue

- **Market share:** 2.2% of all websites (W3Techs, 2026-09-11) — aggregated across ~45 local hosting brands, not one platform
- **Category:** shared hosting under many national brands, plus VPS (where DirectAdmin / cPanel / Plesk appear as options)
- **File access:** varies by brand — Combell: FTP + SSH/SFTP + panel file manager; TransIP: SFTP + SSH + panel file manager (no plain FTP documented); Register.it: FTP only on the documented paths, plus a panel file manager
- **Automatable by the CiteFleet script (rclone):** partly — yes on TransIP (SFTP, but read the host from the panel) and on Combell once SSH is switched on; unproven on Register.it, where only FTP is documented
- **Docs consulted:** https://team.blue/our-brands/, https://www.combell.com/en/help/kb/upload-your-website-via-ftp/, https://www.transip.eu/knowledgebase/website-general/6605-the-documentroot-of-your-website, https://www.register.it/assistenza/crear-account-ftp-cpanel/, https://go-acme.github.io/lego/dns/ — fetched 2026-09-11

**Correction to the brief.** team.blue's own brands page does **not** list one.com or Hosting.nl. one.com is a **group.one** brand (see `group-one.md`); Hosting.nl's ownership could not be established from an official source and is **UNVERIFIED** here, but it is not on team.blue's list. The brands team.blue does name include Combell (BE), TransIP (NL), Register.it (IT), Simply.com (DK), Vimexx (NL), Loopia (SE), Websupport (SK), Active24 (CZ), Amen.fr, Easyhost (BE), Names.co.uk, LCN (UK), Nominalia (ES), Papaki (GR), Curanet / Dandomain / Scannet (DK), Keliweb / Etinet (IT), Raidboxes (DE), Proserve / Signet / VDX (NL), Superhosting.bg, Webempresa (ES), Turhost / Natro (TR), Swizzonic (CH) and about twenty more.

**The brands genuinely differ.** There is no shared team.blue hosting platform: the web root is `www/` on Combell and TransIP but `public_html` / `public/www` / `htdocs/www` on Register.it, and the transfer protocol differs too. This file covers the largest three — **Combell, TransIP, Register.it** — and says so where they diverge.

## Where the web root is

**Combell — `www/`.** Documented twice: "the public folder where your website must be uploaded is the **'www' folder**", with the warning "Never delete the 'www' folder!"; and "Your website itself is in the folder **'www'** by default."

**TransIP — `www/`, and it is the literal DocumentRoot.** "the **/www/** folder will be set as the default DocumentRoot of your website" and "Use the **www** folder of the webhostingpackage to upload files to your website, this is your website's '**root**' folder." Two caveats: the DocumentRoot is changeable by the customer under **Site → Domains & SSL → Edit website path**, and sites on subdomains live under a separate `subsites/` folder, not under `www/`.

**Register.it — three different answers, and you must detect which.** Register.it runs two platform generations side by side, split by purchase date (its legacy articles all carry a "Linux Hosting purchased before June 2015" note):

| Product | Web root |
|---|---|
| cPanel Linux hosting (current) | `/public_html` |
| Legacy Linux additional packages | `/public/www` |
| Windows hosting | `/htdocs/www` |

Hardcoding any one of the three breaks on the other two.

## Steps to install the five files

**Combell:**
1. Log in → **My products** → **Web hosting** → **Manage hosting** next to the domain.
2. In the left menu choose **SSH**, and switch on **Activate SSH** — "By default, SSH is not activated."
3. Note the SSH host shown. It is `ssh.<yourdomain>` or a backup form such as `ssh008.webhosting.be`, and the SSH username (e.g. `ninefortwobe`) — **not** the FTP username.
4. Connect an SFTP client to that SSH host on **port 22** with the SSH credentials. Combell documents exactly this ("At HOST you use your backup SSH host… At PORT you fill in '22'").
5. Upload into `www/`, creating `www/.well-known/`.
6. Plain-FTP alternative: host `ftp.<yourdomain>` (Windows/.NET packages use `windowsftp.combell.com` instead). **Combell never publishes the FTP port** — its guide says only "Enter the port that the control panel indicates." Read it from the panel; do not assume 21.

**TransIP:**
1. Control panel → **Shared Hosting** → your domain → **Site** tab → **SFTP/SSH**.
2. Copy the value under **Host** — TransIP publishes no `sftp.<domain>` pattern, the host is per-package.
3. Connect over **SFTP on port 22, or 2222** if 22 is refused ("SFTP port: 22 or 2222").
4. Upload into `www/`. For a subdomain site, into the matching folder under `subsites/`.
5. SSH is available on shared hosting on port 22 with the same host/username, with a restricted command set that includes `ls`, `cd`, `cat`, `vi` and WP-CLI — enough to `mkdir .well-known` and write a file.

**Register.it:**
1. Determine the generation. If the account has cPanel, the panel's **Configura Client FTP** link hands you host, port and username; the root is `/public_html`.
2. If it is the legacy panel, use **Configurazione automatica account FTP**, which downloads a FileZilla site-config file to import — the host is not printed anywhere in the docs.
3. Connect over **FTP on port 21** (the only protocol documented: "il nome utente creato + host + numero porta (**21**)").
4. Upload into `/public_html`, `/public/www` or `/htdocs/www` per the table above.
5. Note that a legacy FTP account with no path set lands at "la root dello spazio" — the storage root, which is *above* the web root.

## The `.well-known/` problem

**Register.it is the only one of the three that officially documents a hidden-files capability**, and only on the legacy panel: the File Manager has a *Visualizza i files nascosti* checkbox, and — decisively — "**I file nascosti sono gestiti come tutti gli altri file, e quindi sarà possibile eseguire su di essi tutte le azioni del File Manager**" ("hidden files are managed like all other files, so all File Manager actions can be performed on them"). The same platform writes `.htaccess` and `.htpasswd` itself when you password-protect a directory, so dot-entries are unambiguously supported there. For the cPanel generation, dotfiles are cPanel's standard *Settings → Show Hidden Files (dotfiles)* behaviour, but **Register.it does not document it on its own pages — UNVERIFIED**.

**Combell and TransIP: UNVERIFIED.** Both file managers document creating files and folders, permissions, zip and rename — and neither mentions hidden files, dotfiles, `.htaccess` or `.well-known` anywhere. Do not build against the file manager on these two. Use SFTP/SSH, where `mkdir .well-known` is an ordinary filesystem operation: Combell over SSH on port 22, TransIP over SFTP or its shell (`vi` is available).

**Better on all three: skip the file and use the apex DNS TXT record.** BotCentral scores it higher, and on TransIP it is fully automatable (below).

## Gotchas

- **Combell's SSH is off by default** and lives on a *different hostname* from FTP. `ftp.<domain>` and `ssh0NN.webhosting.be` are not interchangeable, and the SSH username is not the FTP username. An unattended run cannot bootstrap itself — someone must flip the toggle first.
- **Combell publishes no FTP port number, anywhere.** Its own guide defers to the panel. Any script that hardcodes 21 is guessing.
- **Combell's shared-hosting KB never uses the word "SFTP"** — the secure route is documented as an FTP client speaking port 22 with SSH credentials. (The only Combell-owned page that says "SFTP" is the Combell-SRE knowledge base, which is a different, managed product.)
- **TransIP's SFTP port is 22 *or* 2222**, and the docs tell you to try both. A connector that only tries 22 will report a false failure on some packages.
- **TransIP's DocumentRoot is customer-editable** and subdomains are served from `subsites/`, not `www/`. Uploading to `www/` on a package whose path was edited publishes nothing.
- **Register.it is not one target.** Two panel generations plus Windows, three web roots, and a "Migrazione programmata degli Hosting Linux – 2025" in progress. Detect per account.
- **Register.it: no SFTP is documented at all.** Six official FTP articles were checked and none mentions SFTP or FTPS. SSH is likewise **UNVERIFIED**. Treat it as plaintext FTP unless the account proves otherwise.
- **Platform-generated robots.txt, CDN cache, dotfile stripping: UNVERIFIED for all three.** No official page from Combell, TransIP or Register.it documents any of them. That is "not found", not "does not happen".

## If files cannot be placed

Use the **apex DNS TXT record**. All three brands run their customers' DNS and expose a record editor:

- **Combell:** panel → DNS. "Via the control panel of Combell you can only make changes to the Combell name servers." TXT is supported; changes "will only take effect after 1 to 4 hours."
- **TransIP:** adding Web Hosting means "the default 'TransIP Settings' in your Control Panel will be used", which "make[s] sure that your domain automatically uses the TransIP name servers." Records live under **Domain → your domain → Advanced domain settings**.
- **Register.it:** DNS for domains registered with it; for externally-registered domains you point an A record at the hosting IP instead.

**Automation — what lego actually covers.** Verified against the lego repository's `providers/dns` directory on the `main` branch (v5.4.1) and each provider's `.toml`:

| team.blue brand | lego provider | Credentials |
|---|---|---|
| TransIP | `transip` | `TRANSIP_ACCOUNT_NAME`, `TRANSIP_PRIVATE_KEY_PATH` (a **path on disk**, not inline key material). Optional `TRANSIP_TTL` (10), `TRANSIP_PROPAGATION_TIMEOUT` (600), `TRANSIP_POLLING_INTERVAL` (10), `TRANSIP_HTTP_TIMEOUT` (30) |
| Simply.com | `simply` | `SIMPLY_ACCOUNT_NAME`, `SIMPLY_API_KEY` |
| Loopia | `loopia` | `LOOPIA_API_USER`, `LOOPIA_API_PASSWORD`, `LOOPIA_API_URL` (e.g. `https://api.loopia.se/RPCSERV`) |
| Websupport | `websupport` | `WEBSUPPORT_API_KEY`, `WEBSUPPORT_SECRET` |
| Active24 | `active24` | `ACTIVE24_API_KEY`, `ACTIVE24_SECRET` |
| **Combell** | **none** | no `combell` provider exists |
| **Register.it** | **none** | no `register.it` / `registerit` provider exists |

Panel-level providers apply only where the customer controls the panel — a TransIP or Register.it VPS, or a cPanel account with an API token: `cpanel` needs `CPANEL_BASE_URL`, `CPANEL_TOKEN`, `CPANEL_USERNAME` (plus `CPANEL_MODE`, default `cpanel`); `directadmin` needs `DIRECTADMIN_API_URL`, `DIRECTADMIN_USERNAME`, `DIRECTADMIN_PASSWORD` and `DIRECTADMIN_ZONE_NAME`; `plesk` needs `PLESK_SERVER_BASE_URL` (e.g. `https://plesk.myserver.com:8443`), `PLESK_USERNAME`, `PLESK_PASSWORD`. Any lego variable may be suffixed `_FILE` to read its value from a file.

Note the operational asymmetry: `transip`, `simply`, `loopia`, `websupport` and `active24` talk to a **vendor-hosted API** and therefore work on shared hosting. `cpanel`, `directadmin` and `plesk` need a per-server base URL and panel credentials, so they do not.

**Combell has an API, but it is reseller-gated.** The documentation portal is at https://api.combell.com/v2/documentation; Combell's own announcement describes it as "intended for Combell Resellers" and "any Combell customer who purchased **Reseller Hosting**", covering DNS records among other things. The portal renders as a JavaScript SPA, so endpoint paths and the authentication scheme could not be read from an official source — **UNVERIFIED**. **Register.it: no public DNS API found — UNVERIFIED.** (Register.com's US reseller API is a different company.)

So: TransIP is fully automatable end to end. Combell needs one human toggle (SSH) and, for DNS, reseller-tier API access. Register.it needs a human in the panel for the TXT record, and plain FTP for the files.

## Sources

- https://team.blue/our-brands/ — the official brand list; Combell (BE), TransIP (NL), Register.it (IT), Simply.com (DK), Loopia (SE), Websupport (SK), Active24 (CZ) and ~38 others. Neither one.com nor Hosting.nl appears
- https://www.combell.com/en/help/kb/upload-your-website-via-ftp/ — "the public folder where your website must be uploaded is the 'www' folder"; "Never delete the 'www' folder!"; FTP host "ftp.domainname.com"; "Enter the port that the control panel indicates"
- https://www.combell.com/en/help/kb/manage-your-website-files-using-file-manager/ — "Your website itself is in the folder 'www' by default"; File Manager can create files and folders; no mention of hidden files or dotfiles
- https://www.combell.com/en/help/kb/how-do-i-use-ftp-with-my-ssh-credentials-port-22/ — "At HOST you use your backup SSH host. For example: ssh004.webhosting.be"; "At PORT you fill in '22'"; "By default, SSH is not activated"
- https://www.combell.com/en/help/kb/activate-ssh-on-your-hosting-package/ — panel path to switch on SSH
- https://www.combell.com/en/help/kb/connect-to-your-hosting-via-ssh/ — SSH host `ssh.<domain>` and backup form `ssh008.webhosting.be`
- https://www.combell.com/en/help/kb/setup-website-after-transferring-your-domain-name/ — "The ftp subdomain: ftp.yourdomainname.be"; Windows/.NET uses "windowsftp.combell.com"
- https://www.combell.com/en/help/kb/what-are-dns-records/ — TXT supported; "Via the control panel of Combell you can only make changes to the Combell name servers"; 1–4 hour propagation
- https://www.combell.com/en/blog/automate-your-reseller-hosting-using-our-new-api/ — API documentation at api.combell.com/v2/documentation; DNS records covered; audience is resellers
- https://www.transip.eu/knowledgebase/website-general/6605-the-documentroot-of-your-website — "the /www/ folder will be set as the default DocumentRoot of your website"; changeable via Site → Domains & SSL → Edit website path
- https://www.transip.eu/knowledgebase/5894-upload-download-website-via-sftp — "Use the www folder … this is your website's 'root' folder"; "SFTP port: 22 or 2222"
- https://www.transip.eu/knowledgebase/5930-using-sftp-filemanager-control-panel — panel File Manager creates files and folders; subdomain sites live in the "subsites" folder; no hidden-file toggle documented
- https://www.transip.eu/knowledgebase/website-general/6191-ssh-on-webhosting-packages — SSH on shared hosting, port 22, host and username from Site → SFTP/SSH; `ls`, `cd`, `cat`, `vi`, WP-CLI
- https://www.transip.eu/knowledgebase/527-the-dns-settings-web-hosting — default "TransIP Settings" put the domain on TransIP nameservers; records under Advanced domain settings
- https://api.transip.nl/rest/docs.html — REST API; key pair generated in the control panel, `Authorization: Bearer` JWT; DNS endpoints `/domains/{domainName}/dns` supporting TXT
- https://www.register.it/assistenza/crear-account-ftp-cpanel/ — cPanel hosting: use "/public_html" for the main domain folder; host and port come from the "Configura Client FTP" link
- https://www.register.it/assistenza/faq-hosting/risoluzione-problemi-linux/ — legacy Linux publishes to "/public/www"; Windows packages to "/htdocs/www"
- https://www.register.it/assistenza/client-ftp-filezilla/ — FTP credentials are "il nome utente creato + host + numero porta (21)"
- https://www.register.it/assistenza/configurare-ftp-hosting-linux/ — legacy FTP account with no path set accesses "la root dello spazio"; no SFTP or SSH mentioned
- https://www.register.it/assistenza/file-nascosti/ — "Visualizza i files nascosti" checkbox; "I file nascosti sono gestiti come tutti gli altri file, e quindi sarà possibile eseguire su di essi tutte le azioni del File Manager"; applies to Linux Hosting purchased before June 2015
- https://www.register.it/assistenza/proteggere-directory-file-manager/ — directory protection "crea nella directory 2 files, .htaccess e .htpasswd"
- https://www.register.it/assistenza/configurazione-hosting-linux-cpanel/ — cPanel Linux hosting product; external domains point an A record at the cPanel IP; ~15 minute propagation
- https://www.register.it/hosting/web-hosting/cpanel-webhosting/ — "I nostri piani di web hosting non includono cPanel, Plesk, Atomia o altri pannelli di controllo standard"; VPS "supportano sia cPanel che Plesk"
- https://go-acme.github.io/lego/dns/ and https://github.com/go-acme/lego/tree/main/providers/dns — the authoritative provider list (225 entries on `main`, v5.4.1): `transip`, `simply`, `loopia`, `websupport`, `active24`, `cpanel`, `directadmin`, `plesk` exist; `combell` and `register.it` do not
- https://go-acme.github.io/lego/dns/transip/ — `TRANSIP_ACCOUNT_NAME`, `TRANSIP_PRIVATE_KEY_PATH`, and the optional timeout/TTL variables
