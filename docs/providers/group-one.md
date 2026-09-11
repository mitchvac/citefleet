# group.one

- **Market share:** 0.8% of all websites (W3Techs, 2026-09-11) — aggregated across the group's brands, dominated by one.com
- **Category:** shared hosting under national brands, plus website builders (one.com Website Builder and the newer Aida AI Website Builder) that change who owns `robots.txt`
- **File access:** brand-dependent — one.com: SFTP everywhere (must be switched on), SSH on the top two plans only, FTP being retired, plus a panel File Manager; Hostnet: FTP + SFTP (key-based, must be enabled) + File Manager; dogado / Alfahosting: FTP + SFTP/SSH + a browser "Web-FTP"
- **Automatable by the CiteFleet script (rclone):** partly — yes over SFTP on every brand here, but always after a human enables SFTP/SSH in the panel, and never against a hardcoded path
- **Docs consulted:** https://www.group.one/brands, https://help.one.com/hc/en-us/articles/115005585689-Using-SFTP, https://help.one.com/hc/en-us/articles/360000825478-How-do-I-create-a-TXT-record, https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015898378-Wat-is-de-root-folder-van-mijn-website, https://help.dogado.de/hc/de/articles/25447619916561, https://hilfe.alfahosting.de/hc/de/articles/48784747689233, https://go-acme.github.io/lego/dns/ — fetched 2026-09-11

**Correction to the brief: dansk.net is not a group.one brand.** It appears on neither group.one's history page nor its current brands page, and dansk.net self-describes as DanskNet, an independent Danish registry selling `.co.dk` / `.biz.dk` / `.firm.dk` pseudo-TLDs for an annual "hostmasterafgift" — a registry, not a hoster, claiming no group.one affiliation. Treat the claim as **refuted** unless an official source surfaces.

The official brand list is: **one.com, checkdomain, dogado, Metanet, HEROLD, Hostnet, Zoner, uniweb, Webglobe, veebimajutus**, plus Alfahosting, busymouse, Profihost, easyname and GratisDNS from the acquisition history, and the SaaS brands (Rank Math, WP Rocket, GTmetrix, Termly, Shore, SocialPilot, MiniCRM, BackWPup, Imagify).

**The brands genuinely differ**, and worse, several differ *from themselves* across platform generations. This file covers **one.com** (by far the largest), **Hostnet** (NL) and **dogado / Alfahosting** (DE, one shared platform).

## Where the web root is

There is no group-wide answer, and not one of the four brands uses `public_html`.

**one.com — two answers, split by server generation.**
- *Old servers:* the FTP/SFTP landing directory **is** the web root, and it is called **`httpd.www`**. "When you first log in, you'll find yourself in your public folder, called **httpd.www**. This public folder, also known as the **root folder**, can be accessed via a web browser… You also have a private folder called **httpd.private**." Over SSH the same space is `/www`, with the private home at `/home/yourdomain.com`. The panel's backup download is named `httpd.www.zip`.
- *New servers:* the FTP root sits one level up and holds **hash-named per-domain folders**: "Under **Folder**, you'll see a name, like **`/webroots/5dfa4a5d`**. The series of numbers and letters after `/webroots/` is the root folder name for that specific domain or subdomain."
- Authoritative per-account lookup: Control Panel → **Hosting settings** → **Disk Usage** → **Advanced** → **File system path**, which one.com calls the Document Root.

**Hostnet — `webroot/sites/<domeinnaam.nl>`**, and the absolute form differs from the logical one: "De root-folder vind je binnen de locatie **'/webroot/sites'**. Als je verbinding hebt gemaakt met (S)FTP dan ziet de structuur er iets anders uit: **'/customers/8/8/0/(clusterID)/webroots/sites'**." Note `webroot` (logical) versus `webroot**s**` (absolute) — Hostnet spells it both ways in the same article. `httpdocs` is the *old* name: "Voorheen werd deze map /httpdocs genoemd. Dit is gewijzigd naar /webroot/sites." The root folder is also user-configurable per (sub)domain ("Root-folder wijzigen"), and auto-installed apps live elsewhere again, at `/webspace/siteapps/[app]/htdocs`.

**dogado — a per-domain folder named after the domain with the dots stripped.** "Im folgenden Beispiel ist der Domain **dogado-webhosting.de** das Verzeichnis **`/dogado-webhostingde`** zugeordnet." Absolute form `/var/www/vhosts/<Vertragsname>/<Ordner>/`. Reassignable per domain via "Dokumentenstamm". dogado's own instruction is to trust the panel: "Verwenden Sie für Ihr Hosting **immer die in oneHome angezeigten Pfade**."

**Alfahosting — `/html` on the legacy Confixx/CloudPit generation, `/httpdocs` on the current oneHome one.** Both are documented: "damit laden Sie Ihre Web-Inhalte in des **Hauptverzeichnis „/html"**" for the old, and "Ist die Domain example.de beispielsweise dem Verzeichnis **`/httpdocs`** zugewiesen… müssen sich die dazugehörigen Website-Dateien daher **im Verzeichnis `/httpdocs`** befinden" for the new.

## Steps to install the five files

**one.com:**
1. Control Panel → **Advanced settings** → **SSH & SFTP**. Set **Allow SSH & SFTP access** to **On** — it is off by default.
2. Set the SFTP password via the email round-trip the panel triggers ("Change SSH/SFTP password for the domain…" → Reset password). There is no pre-existing password.
3. Read the connection details from that same **SSH and SFTP Administration** panel. Historically these were `ssh.<yourdomain>` on port **22** with username `<yourdomain>`; the current article has removed the literal values and tells you to read them from the panel, consistent with the new-server migration. Do not hardcode.
4. Find the root folder: **Hosting settings → Disk Usage → Advanced → File system path**. On old servers you simply land in `httpd.www`; on new servers, match the `/webroots/<hex>` name shown under **Subdomains**.
5. Upload the five files there, creating `.well-known/`.
6. Panel alternative: **Hosting settings → File Manager** (or `https://filemanager.one.com`), which has upload, drag-and-drop, a built-in editor, and unzip. It is included on every plan with web space.

**Hostnet:**
1. Mijn Hostnet → **Diensten** → your package → **SSH- en (S)FTP-toegang**. Switch access on and add an SSH key — "Je kunt SSH gebruiken door **de toegang in te schakelen via Mijn Hostnet**, en door een private en public key aan te maken." An IP allowlist applies to FTP too.
2. Read the host from the panel (there is no `ftp.<domain>` pattern). The one published hostname shape appears in an `~/.ssh/config` workaround: `*.lb.shared.prod.hostnet.nl`.
3. SFTP on port **22** with "Inlogtype: '**Sleutelbestand**'" (key file); or FTP on port **21**, which is plaintext by default ("Encryptie: 'Gebruik gewone FTP'").
4. Upload into `webroot/sites/<yourdomain>` — confirm the name under Diensten → domain → Domeinnaam, since it is changeable.

**dogado / Alfahosting:**
1. Get the primary FTP user's credentials from oneHome. On Alfahosting the primary FTP password is **invisible by default and must be set before the first connection**, and "Der primäre FTP-Benutzer ist gleichzeitig der Benutzer für FTP, SFTP und SSH. Es gibt **keine separaten SSH- oder SFTP-Zugangsdaten**."
2. dogado's documented host example is `web312.dogado.net`; Alfahosting says to use "entweder Ihren eigenen Domainnamen… oder den Servernamen" but publishes no sample — **UNVERIFIED** as a pattern.
3. FTP on port **21** with explicit FTP over TLS, or SFTP/SSH on port **22**.
4. On dogado, **only the primary FTP user can use SFTP**: "Für eine SFTP-Verbindung können Sie **nur den primären FTP-Benutzer** verwenden. Zusätzlich angelegte FTP-Benutzer können nicht per SFTP verwendet werden."
5. Upload into the path oneHome shows — `<domain-with-dots-stripped>` on dogado, `/httpdocs` or `/html` on Alfahosting.

## The `.well-known/` problem

**one.com is the only brand in the group that documents creating a dot-entry in its panel, and only for a *file*.** Its `.htaccess` guide is explicit about both the capability and the FTP hazard: "The .htaccess file is a bit special because **it begins with a dot**. This means that in some FTP programs, **it is hidden**… We recommend using our built-in **File Manager**… Click the blue arrow pointing downwards next to the + Upload button. Select **New other file**. Name the file **`.htaccess`** and press Enter."

Whether File Manager can create a dot-named **directory** such as `.well-known` is **UNVERIFIED** — the "Creating a new folder" section says only "Click New folder. Type a name… Press return", and a help-center search for `well-known` and `hidden files` returns nothing relevant.

**Hostnet, dogado and Alfahosting: UNVERIFIED.** Hostnet's entire 574-article Dutch corpus contains zero hits for `well-known` and no hidden-file article. dogado and Alfahosting give a *negative* signal: both route around their own file managers for `.htaccess`, telling you to create it locally and upload it ("Erstellen Sie **lokal auf Ihrem PC** eine Datei namens **`.htaccess`**… Laden Sie jetzt beide Dateien mit dem **FTP Programm Ihrer Wahl** auf Ihren Webspace"), and dogado's only documented way to *see* a dotfile is `ls -a` over SSH.

Indirect evidence that dot-entries survive: Hostnet's own platform places a visible, undeletable **`.keep`** folder in the web root ("op de map '.keep' na. Deze map is geplaatst door Hostnet en kan niet worden verwijderd"), and all four brands document `.htaccess` as an ordinary uploaded file.

**Create `.well-known/` over SFTP, not in any of these file managers** — or skip it and use the apex DNS TXT record, which every brand here supports by hand.

## Gotchas

- **one.com consumes `_acme-challenge` for its own certificates, and will refuse to issue if you occupy it.** Verbatim: "If you are using our name servers but you have set up a record on **`_acme-challenge.yourdomain.com`**, **it's not possible to order an SSL certificate for your domain**. You need to remove this record to make SSL work." For external DNS, one.com asks for a CNAME at `_acme-challenge` pointing to `yourdomain.com.acme.service.one.com`. Any customer-run DNS-01 challenge collides with this.
- **one.com's plan matrix separates SFTP from SSH.** "**SSH access is included in our Enthusiast and Guru plans.** If you have a different hosting plan, you can **use SFTP**." SFTP is on all web-space plans; SSH only on the top two.
- **one.com FTP is being retired.** "For customers on our new servers, FTP is no longer available due to security limitations… If you don't see 'FTP Administration' on your SSH & SFTP page, you are on our new servers."
- **one.com runs Varnish in front of the web space.** Defeatable per directory with a `.htaccess` carrying `Header add "Cache-Control" "no-cache"`. Also note File Manager warns against editing files owned by the Website Builder, blog or Gallery.
- **Website builders own `robots.txt` on some plans.** The classic one.com Website Builder generates `sitemap.xml` but *not* `robots.txt` — one.com's own guide has you create robots.txt by hand in File Manager. The newer **Aida AI Website Builder** lists "Sitemap and robots.txt" as a managed feature on all tiers, so on an Aida site assume the platform owns both files and an uploaded one may be irrelevant or overridden. Hostnet's Website Builder likewise "genereert automatisch een XML-sitemap", with robots.txt uploaded through the builder's own "Webruimte" view rather than FTP; whether a builder sitemap overrides an FTP-uploaded one is **UNVERIFIED**.
- **Hostnet runs a Proof-of-Work interstitial that can block non-browser clients.** "…gebruiken wij een beveiligingssysteem genaamd **PoW (Proof of Work)**… **Tools zoals Google Ads of SEO-crawlers kunnen tijdelijk geen toegang krijgen tot je website.**" A crawler — including a BotCentral or IndexNow fetch — can be challenged rather than served.
- **Hostnet's `8/8/0` shard path is per-account**, printed literally in the docs but not constant. Read the real path from the panel.
- **Alfahosting's legacy TXT records are template-gated.** On the Confixx/CloudPit generation only A, CNAME and MX are freely editable; SRV and TXT are template-only: "Für die Einträge stellen wir **Vorlagen** bereit… **Sollten Sie keine passende Vorlage finden, melden Sie sich bitte im Support.**" A zone-file import is the escape hatch. The newer oneHome generation is free-form.
- **Alfahosting nameserver changes are support-ticket-only** — "Die Änderung der Nameserver… **ist nur über unseren Support möglich**."
- **dogado and Alfahosting both gate free wildcard Let's Encrypt on using their own nameservers**, and neither documents `.well-known/acme-challenge` at all.
- **`metaname` is not Metanet.** lego's `metaname` provider is metaname.net, a New Zealand registrar. group.one's Swiss brand is metanet.ch. Confusing the two would produce a plausible-looking credential set that talks to the wrong company.

## If files cannot be placed

Use the **apex DNS TXT record**. All four brands run their customers' DNS by default and expose a self-service record editor — though each spells the apex differently, which is the usual source of a broken record:

- **one.com** — nameservers `ns01.one.com` / `ns02.one.com`. **Advanced settings → DNS settings → DNS records → TXT**, then: "**Leave the hostname empty**, or add a subdomain." TTL default 3600, minimum **600**, maximum 86400. Moving the nameservers away disables the Website Builder, shop and email.
- **Hostnet** — "Voor **al jouw bij Hostnet geregistreerde domeinen worden standaard de nameservers van Hostnet ingesteld**." DNS wijzigen → **Voeg nieuw record toe** → type **TXT** → "**Laat de recordnaam ongewijzigd**" (leave the record name unchanged — the field carries the bare domain, not `@` and not empty). Propagation "2 tot 24 uur", with a "Versie terugzetten" rollback.
- **dogado** — nameservers `cns1.cloudpit.de` / `cns2.cloudpit.com` / `cns3.cloudpit.io`, self-service. "oneHome ergänzt den Namen Ihrer Domain **automatisch**. Wenn ein Eintrag **direkt für die Hauptdomain** gelten soll, **lassen Sie das Feld `Name` leer**" — otherwise the domain is appended twice.
- **Alfahosting** — same oneHome apex rule ("Für einen Eintrag der Hauptdomain lassen Sie das Feld leer"), but see the template gate above for the legacy generation. Default nameserver *hostnames* are **UNVERIFIED**; only IPs are published (`109.237.142.8`, `148.251.254.105`, `109.237.143.8`).

**Automation: exactly one group.one brand has a lego provider.**

| Brand | lego provider | Credentials |
|---|---|---|
| **Checkdomain** | `checkdomain` | `CHECKDOMAIN_TOKEN`; optional `CHECKDOMAIN_ENDPOINT` (default `https://api.checkdomain.de`), `CHECKDOMAIN_TTL` (300), and the usual timeout variables |
| one.com | **none** | no `onecom` provider |
| GratisDNS | **none** | |
| Hostnet | **none** | |
| dogado / Alfahosting | **none** | |
| Zoner, easyname, Webglobe, Metanet | **none** | `metaname` is a different company |

Verified against the lego repository's `providers/dns` directory on `main` (v5.4.1, 225 packages) as well as the docs index. `hostingde` exists but Hosting.de GmbH is not a group.one brand. Webglobe rolled up Czech hosters, but its own about pages say only "2024 … We became part of group.one" and never claim Active24 or Websupport, so lego's `active24` and `websupport` providers cannot be assumed to reach a group.one customer's zone.

**No brand here publishes a customer-facing DNS API.** one.com's help center has none (searches return only the Online Shop API); Hostnet's only REST API is the **reseller** one at partners.one, with no endpoints, auth scheme or DNS detail published; dogado has an API-token UI in oneHome but the reference is behind login and DNS coverage is **UNVERIFIED**; Alfahosting documents no API at all for shared hosting.

**The one clean automation path on one.com is secondary DNS with a hidden primary:** "Our DNS service supports secondary DNS, often used for a hidden primary. You must allow AXFR requests from **`axfr.one.com` (46.30.211.18)**, which is also the server you should NOTIFY when you update your zones." That moves zone authorship somewhere lego *can* drive, and sidesteps the `_acme-challenge` collision.

Otherwise: place the four plain files over SFTP, and have the customer add the apex TXT record by hand once.

## Sources

- https://www.group.one/brands and https://www.group.one/company/history — the official brand list and acquisition timeline; no dansk.net on either
- https://www.dansk.net — DanskNet is an independent registry for `.co.dk`/`.biz.dk`/`.firm.dk` pseudo-domains; no group.one affiliation claimed
- https://help.one.com/hc/en-us/articles/115005585689-Using-SFTP — "you'll find yourself in your public folder, called httpd.www… also known as the root folder"; "set Allow SSH & SFTP access to On"; the email-driven password reset
- https://web.archive.org/web/20241111213423/https://help.one.com/hc/en-us/articles/115005585689-Using-SFTP — archived version of the same official article carrying the literal `ssh.yourdomain.com`, user `yourdomain.com`, port 22
- https://help.one.com/hc/en-us/articles/115005585649-Using-FTP — `ftp.yourdomain.com`, port 21; "For customers on our new servers, FTP is no longer available"
- https://help.one.com/hc/en-us/articles/115005585709-How-to-connect-to-an-SFTP-server-using-FileZilla — new servers: root folder names like `/webroots/5dfa4a5d`, read from Subdomains
- https://help.one.com/hc/en-us/articles/49251956145681-Where-can-I-find-the-File-System-Path-for-my-domain-or-subdomain — Disk Usage → Advanced → File system path is the Document Root
- https://help.one.com/hc/en-us/articles/115005585729-Using-SSH — "/www" public folder over SSH; "SSH access is included in our Enthusiast and Guru plans"
- https://help.one.com/hc/en-us/articles/360005628857-What-s-included-in-our-plans — SSH only on Enthusiast and Guru
- https://help.one.com/hc/en-us/articles/115005585809-Using-one-com-File-Manager — panel File Manager, also at filemanager.one.com; new folder, upload, editor, unzip
- https://help.one.com/hc/en-us/articles/115005586169-What-is-htaccess — dot-files are hidden in some FTP programs; create `.htaccess` via File Manager → New other file
- https://help.one.com/hc/en-us/articles/360000825478-How-do-I-create-a-TXT-record — DNS settings → DNS records → TXT → "Leave the hostname empty"
- https://help.one.com/hc/en-us/articles/115005595925-Manage-your-DNS-settings — apex convention, TTL default 3600 / min 600 / max 86400, supported record types
- https://help.one.com/hc/en-us/articles/360000841638-How-do-I-change-the-name-servers — `ns01.one.com` / `ns02.one.com`; moving away disables Website Builder, shop and email
- https://help.one.com/hc/en-us/articles/360000297458-Why-is-SSL-HTTPS-not-working-on-my-site — a customer record on `_acme-challenge` blocks one.com's own SSL issuance; external-DNS CNAME to `yourdomain.com.acme.service.one.com`
- https://help.one.com/hc/en-us/articles/4419798111377-Technical-information-about-one-com-s-DNS-infrastructure — secondary DNS / hidden primary, AXFR from `axfr.one.com` (46.30.211.18); anycast, DNSSEC
- https://help.one.com/hc/en-us/articles/115005586269-How-can-I-disable-the-Varnish-cache — Varnish in front of the web space; per-directory `.htaccess` `Cache-Control: no-cache`
- https://help.one.com/hc/en-us/articles/6376706956689-How-to-connect-my-Website-Builder-site-with-marketgoo — Website Builder auto-creates sitemap.xml but not robots.txt; create robots.txt in File Manager
- https://help.one.com/hc/en-us/articles/46894840036113-Aida-AI-Website-Builder-plans-and-feature-overview — Aida manages sitemap.xml and robots.txt on all tiers
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015898378-Wat-is-de-root-folder-van-mijn-website — "/webroot/sites" logical, "/customers/8/8/0/(clusterID)/webroots/sites" over (S)FTP
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/27021703833489 — "Voorheen werd deze map /httpdocs genoemd. Dit is gewijzigd naar /webroot/sites"
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015150698-Root-folder-wijzigen — the root folder is changeable per (sub)domain
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/5690291022737-SSH-en-sftp-gebruiken-op-jouw-webhostingpakket — FTP port 21 plaintext, SFTP port 22 with a key file; `*.lb.shared.prod.hostnet.nl`
- https://www.hostnet.nl/webhosting — SSH must be enabled in Mijn Hostnet with a key pair
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015145998-File-Manager — panel File Manager can create folders and files; Hostnet recommends FTP instead
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015079737-Webhosting-opnieuw-instellen — the platform-placed, undeletable `.keep` folder
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015159138-Aan-de-slag-met-SPF — TXT record steps; "Laat de recordnaam ongewijzigd"
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015087837-DNS-records-die-je-kan-instellen-binnen-Mijn-Hostnet — Hostnet nameservers set by default for Hostnet-registered domains
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/38392008657553-Wat-is-PoW-Proof-of-Work — the Proof-of-Work interstitial can block SEO crawlers
- https://help.dogado.de/hc/de/articles/25447619916561 — the web root is the domain name with dots stripped (`/dogado-webhostingde`)
- https://help.dogado.de/hc/de/articles/20658073679633 — `/opt/plesk/php/VERSION/bin/php`, confirming Plesk underneath oneHome
- https://help.dogado.de/hc/de/articles/30717122410385-FTP-Verbindung-mit-FileZilla — host example `web312.dogado.net`; FTP 21 over explicit TLS; SFTP/SSH 22
- https://help.dogado.de/hc/de/articles/28533569940113-SFTP-im-Webhosting-und-WordPress-Hosting — only the primary FTP user can use SFTP
- https://help.dogado.de/hc/de/articles/18706082418193 — create `.htaccess` locally and upload it by FTP; `/var/www/vhosts/<Vertragsname>/<Ordner>/`
- https://help.dogado.de/hc/de/articles/26004248540177 — nameservers `cns1.cloudpit.de`, `cns2.cloudpit.com`, `cns3.cloudpit.io`
- https://help.dogado.de/hc/de/articles/23450744909969-DNS-Einträge-in-oneHome-verwalten — leave the Name field empty for the apex, or the domain is appended twice
- https://help.dogado.de/hc/de/articles/23195383082385 — free wildcard Let's Encrypt requires dogado nameservers
- https://hilfe.alfahosting.de/hc/de/articles/48784747689233 — current generation serves from `/httpdocs`
- https://hilfe.alfahosting.de/hc/de/articles/31228670698897 — legacy generation uploads to "/html"
- https://hilfe.alfahosting.de/hc/de/articles/48747781563153 — FTP port 21, SFTP/SSH port 22; the primary FTP user is also the SSH/SFTP user
- https://hilfe.alfahosting.de/hc/de/articles/31095446130321 — legacy TXT records are template-gated; contact support if no template matches
- https://hilfe.alfahosting.de/hc/de/articles/48718252723601 — oneHome apex rule: leave the field empty
- https://hilfe.alfahosting.de/hc/de/articles/18733820071825 — nameserver changes only via support
- https://go-acme.github.io/lego/dns/checkdomain/ — `CHECKDOMAIN_TOKEN` and optional variables
- https://go-acme.github.io/lego/dns/ and https://github.com/go-acme/lego/tree/main/providers/dns — the 225-package provider list on `main` (v5.4.1); no `onecom`, `gratisdns`, `hostnet`, `dogado`, `alfahosting`, `easyname`, `zoner` or `webglobe`
- https://go-acme.github.io/lego/dns/metaname/ — `metaname` is metaname.net (New Zealand), not group.one's Metanet
