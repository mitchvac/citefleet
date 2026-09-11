# Your.Online

- **Market share:** 0.8% of all websites (W3Techs, 2026-09-11) — aggregated across ~35 brands
- **Category:** shared hosting under many national brands, plus managed WordPress (Savvii), a git-deploy platform (Gandi Web Hosting) and registrars
- **File access:** brand-dependent — o2switch: FTP + FTPS + SFTP + SSH + cPanel File Manager; Gandi: SFTP and git only, no FTP, no file manager; Yourhosting: FTP + Plesk File Manager, **no SSH on shared hosting**
- **Automatable by the CiteFleet script (rclone):** partly — yes on o2switch (SFTP, after an IP whitelist) and Gandi (SFTP is the only protocol); on Yourhosting the credentials and protocol are not documented publicly, so it is FTP-with-panel-supplied-details at best
- **Docs consulted:** https://your.online/brands/, https://faq.o2switch.fr/hebergement-mutualise/gestion-web/parametres-ftp, https://docs.gandi.net/en/simple_hosting/connection/sftp.html, https://www.yourhosting.nl/kennisbank/hosting-website/een-phpinfo-bestand-maken/, https://go-acme.github.io/lego/dns/ — fetched 2026-09-11

**Two corrections to the brief.**

1. **Openprovider / Hosting Concepts is not a confirmed Your.Online brand — UNVERIFIED, and the evidence points against it.** Openprovider's own about and company pages name no parent group; Your.Online's brands page does not list Openprovider or Hosting Concepts; Your.World's site names only the two divisions. The actual predecessor entity was **Total Webhosting Solutions B.V. (TWS)**, per Your.Online's own merger announcement: "Gandi SAS and Total Webhosting Solutions B.V., today announced their merger and the creation of Your.Online." So TWS → Your.Online is confirmed; Hosting Concepts → Your.Online is not. Do not repeat the Openprovider claim.
2. **Hosting.nl is not a Your.Online brand either.** It is absent from the brands page, and Hosting.NL's own blog calls **Cyso** a "sister organization" (naming Fuga Cloud as another). The negative is firm; the exact corporate parent is **UNVERIFIED**.

The official brand list is: Zone (EE), Blacknight (IE), Shellrent (IT), UK2 Group and Heart Internet (UK), Pair Networks (US), Gandi, o2switch and Nexylan (FR), 1blu and manitu (DE), Inleed (SE), Axarnet / okITup / Loading (ES), ecomDATA (AT), Yourhosting / Savvii / Shock Media / LinQhost / Realtime Register / Sansec / Reconi (NL), plus GitLabHost, Link-Busters, Progress Planner, Firm24, Ligo, DigiTrust, Aangetekend, AET Europe, Avensus, Dtch. Digitals, WiseFundaments, NordLEI.

**The brands genuinely differ** — three different control panels and three different web roots among the top three alone. This file covers **o2switch**, **Gandi** and **Yourhosting**.

## Where the web root is

**o2switch — `public_html/`**, with `www` as a symlink to it: "Le répertoire `www` n'est pas vraiment un répertoire mais un **lien symbolique** vers le dossier public_html" ("the `www` directory is not really a directory but a symbolic link to the public_html folder"). Writing to either path reaches the same inode. Put the pack at `public_html/`, and `.well-known/` at `public_html/.well-known/`.

**Gandi — `vhosts/<yourdomain>/htdocs/`.** The emergency-console guide gives the concrete shape `web/vhosts/wp.gandi.ninja/htdocs/`, with virtual hosts under `/web/vhosts/`; the SSHFS guide shows `vhosts` as a symlink to `lamp0/web/vhosts/`; and the git guide warns that "the root of your repository is not the directory used by the Apache httpd server" — files must sit in the repository's **`htdocs/`** subdirectory to be served. Over SFTP you see `lamp0/` paths; from the console the same tree appears under `/srv/data/`.

**Yourhosting — `/httpdocs`** on the Plesk platform, stated plainly in their own article: "Maak een bestand aan in de root (**/httpdocs**) van je website." The residual DirectAdmin estate (being phased out, and only under the Argeweb label) uses **`public_html`**: "Navigeer naar de '**public_html**' map." Detect, do not assume.

## Steps to install the five files

**o2switch (cPanel):**
1. Host: your domain name, or the temporary address `<node>.o2switch.net` given in the welcome email. Login and password are the **cPanel** ones.
2. Choose a protocol: **FTP on port 21**, **FTPS explicit**, or **SFTP on port 22** — all three are officially documented.
3. Upload the five files to `public_html/`, creating `public_html/.well-known/`.
4. Panel route instead: cPanel → **File Manager**, opening at "Web Root (public_html or www)". Use **+ Folder** for `.well-known`.
5. For SSH (`ssh <cpanel-user>@<domain>` or `<server>.o2switch.net`, port 22) you must first whitelist your IP: cPanel → **Autorisation SSH**. "Avant de pouvoir se connecter en SSH, il faut ajouter votre adresse IP en liste blanche", limited to **5 exceptions per cPanel account**; dyndns hostnames are accepted. There is also a browser Terminal.
6. If xtremCache/Varnish or LSCache is enabled on the domain, purge afterwards (see Gotchas).

**Gandi (Web Hosting, formerly Simple Hosting):**
1. **SFTP is the only file-transfer protocol** — "Web Hosting only supports the **sFTP protocol**… sFTP uses **port 22**… and not port 21."
2. Host follows `sftp.<datacenter_id>.gpaas.net` (e.g. `sftp.sd3.gpaas.net`); the username is the hosting's "unique identifier". Read both from the hosting's management page.
3. Upload to `vhosts/<yourdomain>/htdocs/`, creating `.well-known/` there.
4. Git alternative: `GIT_URL="ssh+git://{web_hosting_id}@git.{datacenter_id}.gpaas.net"`, then `ssh {web_hosting_id}@git.{datacenter_id}.gpaas.net 'deploy {repository}.git'`. PHP hostings get one repo per domain (`example.com.git`); Node/Python a single `default.git`. Files still go in the repo's `htdocs/`.
5. **Purge Varnish afterwards** — this is not optional on Gandi (see Gotchas).

**Yourhosting (Plesk):**
1. Log in at `login.account.yourhosting.nl` → **Beheren** → **Webhosting** → select the package. A yellow **"Naar Plesk"** button means the package is on Plesk.
2. Read the FTP host and credentials from the customer environment. Yourhosting publishes **no hostname pattern, no port number and no statement about SFTP or FTPS** in any of its FTP articles — **UNVERIFIED**; the model is per-package credentials shown in the panel.
3. Upload to `/httpdocs` (or `public_html` on the DirectAdmin remnant).
4. Panel route: Plesk → **Websites & Domeinen** → the domain → **Bestandsbeheer**. Yourhosting markets this as replacing the FTP client entirely: "Een FTP-programma heb je dus niet meer nodig."

## The `.well-known/` problem

**o2switch: solved and documented.** Its own File Manager guide says an option exists "pour afficher les fichiers cachés (ceux qui commencent par un \".\" comme le .htaccess)", reached "en haut à droite sur les paramètres". cPanel upstream confirms the same control — "To display hidden files in the interface, select **Show Hidden Files (dotfiles)**" under **Settings → Preferences** — and documents **+ Folder** for creating directories. (o2switch's own page enumerates compress/upload/download/edit/move/rename/delete but not folder creation; that gap is filled by cPanel's docs, not o2switch's.)

**Gandi: moot — there is no file manager.** The control panel offers logs, databases, cron, gitweb, process restart, Varnish purge and disk space. File access is SFTP, SSHFS or git, where `.well-known` is an ordinary directory. Nothing to work around.

**Yourhosting: creating a dot-*entry* is documented; *listing* one is not.** Their `.htaccess` guide walks through Plesk → **Bestandsbeheer** → the **+** icon → **Bestand aanmaken** → name it `.htaccess`. So dot-names are accepted by the Plesk file manager. Whether that file manager has a "show hidden files" toggle is **UNVERIFIED** — Yourhosting's own Bestandsbeheer article covers only upload, delete and permissions, and Plesk's customer-guide File Manager page could not be reached (404/403 on four candidate URLs). What Yourhosting *does* document is the FTP-client workaround: FileZilla → **Server** → "Toon verborgen bestanden (forceer)". DirectAdmin's hidden-file behaviour is likewise **UNVERIFIED** from DirectAdmin's own docs.

In all three cases the apex DNS TXT record remains the better proof, and on Gandi it is fully automatable.

## Gotchas

- **Gandi's Varnish is ON BY DEFAULT with a 120-second TTL.** "Caching is enabled by default and an expiration period of **120 seconds** is set for all requests." A freshly written `/.well-known/botcentral.txt` can return a stale 404 for two minutes — the single most likely failure in this set to be misread as a bug. Purge with `curl -X PURGE http://www.example.com/path`, via the control panel, or automatically on a git deploy. `PURGEALL` is rate-limited to once per 120 s. Requests carrying cookies and responses setting cookies bypass the cache.
- **o2switch's caches are OFF by default but opt-in per domain** — xtremCache (Varnish) and LiteSpeed LSCache. If either is on, purge after writing: the cPanel "Vider le cache" button, or `curl -X 'PURGE' http://mon-domaine.fr` (regex form `curl -X 'PURGE' -H 'X-Purge-Regex:.*' http://mon-domaine.fr`).
- **o2switch SSH needs an IP whitelist, capped at five entries per account**, and the firewall tool only accepts ports 22, 27017–27019 and 8888 — "Il n'est pas possible de créer des exceptions parefeu sur des ports différents que ceux listés dans l'outil, **même en contactant le support**." Whether SFTP on the same port 22 also needs the whitelist is **UNVERIFIED**; o2switch's firewall doc says "SSH" and never "SFTP". Test rather than assume.
- **o2switch secondary FTP accounts take the full `user@domain.tld` string as the login**, and the docs warn "Prenez garde à la valeur par défaut du répertoire" — a secondary account can be jailed to a subfolder and silently publish nowhere.
- **Gandi's SSH is an emergency console, not a shell.** "The console is offered as an emergency access"; it must be enabled per session from the **Administration & Security** tab and stays "available for **2 hours**". Do not design around it. Use SFTP or git.
- **Yourhosting has no SSH on shared hosting at all** — "Op de hostingpakketten van Yourhosting is **SSH uitgeschakeld**." Shell access requires moving to a VPS. Any shell-based automation is ruled out there.
- **Yourhosting fronts several labels** — its FTP article covers "Yourhosting, Argeweb, SoHosted, RealHosting, Vevida, De Heeg, VIP, and Alpahmega" — and panel and paths can differ per label.
- **Yourhosting nameservers cannot be self-edited:** "Deze kun je zelf niet aanpassen. Als je de nameservers voor je domeinnaam wil laten aanpassen geef dan de gewenste wijziging aan ons door."
- **Platform-generated robots.txt and dotfile stripping: UNVERIFIED for all three, with no evidence of either.** None of the three documents generating or injecting a `robots.txt` (the o2switch cPanel tool index, the whole Gandi docs tree, and Yourhosting's full knowledge-base sitemap were checked). All three document `.htaccess` as an ordinary file, which is the opposite of stripping. Yourhosting documents no caching or CDN layer at all — **UNVERIFIED**.

## If files cannot be placed

Use the **apex DNS TXT record**. All three brands run their customers' DNS:

- **o2switch** — cPanel's **Zone Editor**: "L'outil zone editor … permet de gérer les zones DNS des domaines hébergés". The nameserver hostnames are **UNVERIFIED** (not published on that page).
- **Gandi** — **LiveDNS**, with a real public API at `https://api.gandi.net/v5/livedns`, authenticated by `Authorization: Bearer pat_…` (a Personal Access Token created in the Organization tab) or the deprecated `Apikey` header.
- **Yourhosting** — zones are managed in the customer environment ("Hiermee kan je ook via je klantomgeving de DNS zone van de domeinnaam beheren"), but nameservers are not self-editable and **no DNS API exists** — no `api` or `developer` URL appears anywhere in Yourhosting's sitemap.

**Automation — what lego covers.** Verified against the lego repository's `providers/dns` directory on `main` (v5.4.1) and each provider's `.toml`:

| Brand | lego provider | Credentials |
|---|---|---|
| **Gandi** | `gandiv5` — use this one | `GANDIV5_PERSONAL_ACCESS_TOKEN` (or the deprecated `GANDIV5_API_KEY`). Optional `GANDIV5_TTL` (300), `GANDIV5_PROPAGATION_TIMEOUT` (**1200**), `GANDIV5_POLLING_INTERVAL` (20), `GANDIV5_HTTP_TIMEOUT` (10) |
| Gandi (legacy XML-RPC) | `gandi` | `GANDI_API_KEY`; `GANDI_PROPAGATION_TIMEOUT` defaults to **2400** |
| **Zone (EE)** | `zoneee` | `ZONEEE_API_USER`, `ZONEEE_API_KEY`, optional `ZONEEE_ENDPOINT` |
| **Shellrent (IT)** | `shellrent` | `SHELLRENT_USERNAME`, `SHELLRENT_TOKEN` |
| **o2switch** | `cpanel` (generic) | `CPANEL_BASE_URL`, `CPANEL_TOKEN`, `CPANEL_USERNAME`; optional `CPANEL_MODE` (default `cpanel`, or `whm`) |
| Argeweb DirectAdmin remnant | `directadmin` | `DIRECTADMIN_API_URL`, `DIRECTADMIN_USERNAME`, `DIRECTADMIN_PASSWORD`, `DIRECTADMIN_ZONE_NAME` |
| **Yourhosting** | **none** | no provider matches; Plesk's `plesk` provider needs a server base URL the customer does not have on shared hosting |
| Openprovider | `openprovider` exists (`OPENPROVIDER_USERNAME`, `OPENPROVIDER_PASSWORD`) | but Openprovider is **not** a confirmed Your.Online brand — see the correction above |
| Versio | `versio` exists (`VERSIO_USERNAME`, `VERSIO_PASSWORD`, `VERSIO_ENDPOINT`) | Versio is absent from the official brands page — **UNVERIFIED** as a Your.Online brand |

Any lego variable may be suffixed `_FILE` to read its value from a file.

**On o2switch, `cpanel` is the right shape but not confirmed to work.** o2switch documents cPanel **API tokens** (cPanel → *Manage API Tokens*; "il faudra bien conserver le jeton" since it is shown once), but the listed use cases are email addresses, databases and FTP accounts — **DNS-over-API is not mentioned on that page, UNVERIFIED for o2switch specifically**. The token plus `CPANEL_BASE_URL` is the thing to try.

So: Gandi is fully automatable end to end (`gandiv5`), o2switch is probably automatable via the generic cPanel provider, and Yourhosting needs a human in the panel for the TXT record and panel-supplied credentials for the files.

## Sources

- https://your.online/brands/ — the official 35-brand list; no Openprovider, no Hosting Concepts, no Hosting.nl, no Versio
- https://your.online/gandi-tws-join-forces-to-form-your-online/ — "Gandi SAS and Total Webhosting Solutions B.V. … announced their merger and the creation of Your.Online"
- https://your.online/about-us/ — "backed by Strikwerda Investments"; "A new chapter began as part of Your.World"
- https://www.openprovider.com/company/about-us and https://www.openprovider.com/company — no parent group named; legal entity is Hosting Concepts B.V.
- https://hosting.nl/en/blog/sister-organization-cyso-managed-hosting-in-emerce100/ — Hosting.NL describes Cyso as a "sister organization"
- https://faq.o2switch.fr/cpanel/ — "Les outils cPanel sur les plans d'hébergement o2switch"; cPanel is the panel
- https://faq.o2switch.fr/hebergement-mutualise/tutoriels-cpanel/difference-publichtml-www — "Le répertoire `www` n'est pas vraiment un répertoire mais un lien symbolique vers le dossier public_html"
- https://faq.o2switch.fr/hebergement-mutualise/gestion-web/parametres-ftp — FTP port 21, SFTP port 22, FTPS explicit; host is the domain or the temporary address; cPanel login and password
- https://faq.o2switch.fr/hebergement-mutualise/gestion-web/filezilla-config-ftp — publish into `public_html`; alternative host `<something>.o2switch.net` from the welcome email
- https://faq.o2switch.fr/cpanel/fichiers/comptes-ftp — secondary FTP logins are always `something@domain.tld`; mind the default directory
- https://faq.o2switch.fr/guides/webmastering/connexion-ssh/ — SSH port 22 with cPanel credentials; IP must be whitelisted first; 5 exceptions per account
- https://faq.o2switch.fr/cpanel/outils/exception-parefeu/ — only ports 22, 27017–27019 and 8888 can be whitelisted, "même en contactant le support"
- https://faq.o2switch.fr/cpanel/fichiers/gestionnaire-fichiers-web — "une option est également présente pour afficher les fichiers cachés (ceux qui commencent par un \".\" comme le .htaccess)"
- https://docs.cpanel.net/cpanel/files/file-manager/ — "To display hidden files in the interface, select Show Hidden Files (dotfiles)" under Settings → Preferences; "+ Folder"; "Web Root (public_html or www)"
- https://faq.o2switch.fr/cpanel/o2switch/xtremcache-varnish — xtremCache/Varnish is opt-in per domain; purge button and `curl -X 'PURGE'`
- https://faq.o2switch.fr/cpanel/o2switch/litespeed-cache-webadc — LSCache is opt-in and needs the matching site plugin
- https://faq.o2switch.fr/cpanel/domaines/editeur-zone-dns — cPanel Zone Editor manages DNS zones for hosted domains
- https://faq.o2switch.fr/cpanel/securite/token-api-cpanel — cPanel API tokens via "Manage API Tokens"; DNS is not among the listed use cases
- https://docs.gandi.net/en/simple_hosting/connection/sftp.html — "Web Hosting only supports the sFTP protocol"; "sFTP uses port 22… and not port 21"; username is the hosting's unique identifier
- https://docs.gandi.net/en/simple_hosting/connection/sshfs.html — `sftp.sd3.gpaas.net` host shape; `vhosts -> lamp0/web/vhosts/`
- https://docs.gandi.net/en/simple_hosting/connection/ssh.html — emergency console only, enabled from Administration & Security, available for 2 hours; example path `web/vhosts/wp.gandi.ninja/htdocs/`
- https://docs.gandi.net/en/simple_hosting/connection/git.html — git deploy URLs; files must be in the repository's `htdocs/`
- https://docs.gandi.net/en/simple_hosting/connection/control_panel.html — what the panel offers; no file manager
- https://docs.gandi.net/en/simple_hosting/common_operations/varnish_cache.html — "Caching is enabled by default and an expiration period of 120 seconds is set for all requests"; PURGE/PURGEALL and the 120 s rate limit; cookie bypass
- https://api.gandi.net/docs/livedns/ — LiveDNS base URL, `Bearer pat_…` Personal Access Token, deprecated `Apikey`
- https://www.yourhosting.nl/webhosting/plesk-control-panel/ — "Bij Yourhosting maken we gebruik van het Plesk control panel"; "Een FTP-programma heb je dus niet meer nodig"
- https://www.yourhosting.nl/kennisbank/hosting-website/plesk-of-directadmin/ — Plesk is the platform; DirectAdmin is being phased out and only under the Argeweb label; how to tell which you have
- https://www.yourhosting.nl/kennisbank/hosting-website/een-phpinfo-bestand-maken/ — "Maak een bestand aan in de root (/httpdocs) van je website"
- https://www.yourhosting.nl/kennisbank/hosting-website/htaccess-bestand-aanmaken/ — Plesk Bestandsbeheer → + → "Bestand aanmaken" → name it `.htaccess`; DirectAdmin route uses `public_html`
- https://www.yourhosting.nl/kennisbank/hosting-website/beheer-van-ftp-gegevens/ — FTP needs "een FTP account; Inloggegevens en host adres" from the panel; covers Yourhosting, Argeweb, SoHosted, RealHosting, Vevida, De Heeg, VIP and Alpahmega; no host pattern or port published
- https://www.yourhosting.nl/kennisbank/hosting-website/bestanden-verwijderen-via-ftp/ — FileZilla → Server → "Toon verborgen bestanden (forceer)"
- https://www.yourhosting.nl/kennisbank/hosting-website/shell-access-ssh-voor-je-hostingpakket/ — "Op de hostingpakketten van Yourhosting is SSH uitgeschakeld"; shell access requires a VPS
- https://www.yourhosting.nl/kennisbank/domeinnamen-dns/dns-records-van-een-domeinnaam-beheren/ — DNS zone management in the customer environment; nameservers not self-editable
- https://go-acme.github.io/lego/dns/gandiv5/, https://go-acme.github.io/lego/dns/zoneee/, https://go-acme.github.io/lego/dns/shellrent/, https://go-acme.github.io/lego/dns/cpanel/, https://go-acme.github.io/lego/dns/directadmin/, https://go-acme.github.io/lego/dns/openprovider/, https://go-acme.github.io/lego/dns/versio/ — the exact environment variables for each
- https://github.com/go-acme/lego/tree/main/providers/dns — the authoritative 225-package provider list on `main` (v5.4.1); no `o2switch`, no `yourhosting`
