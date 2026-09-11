# Aruba S.p.A. (Italy)

- **Market share:** 0.9% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting (Hosting Linux / Hosting Windows / Hosting per WordPress), plus SuperSite and Swite site builders, which are a different and much worse case
- **File access:** FTP and FTPS on every plan; a browser File Manager in the panel; **SFTP only on Linux Advanced/Professional and the managed/Hyper tiers**, key-only
- **Automatable by the CiteFleet script (rclone):** partly — rclone's `ftp` backend works everywhere; the `sftp` backend only on the SSH-capable tiers, and only after a key is imported in the panel
- **Docs consulted:** https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/pubblicazione-gestione-sito/configurazione-client-ftp-pubblicazione-ftp-ftps, https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/file-manager/come-accedere, https://guide.aruba.it/hosting-e-domini/hosting/hosting-linux/pannello-controllo-linux/gestione-chiavi-ssh, https://guide.aruba.it/hosting-e-domini/gestione-dns/gestione-name-server-e-record/gestire-record-txt-dmarc-dkim-spf, https://go-acme.github.io/lego/dns/ — fetched 2026-09-11. Documentation is Italian; translations below are ours, with the Italian quoted.

**Panel:** proprietary, at **`admin.aruba.it`**, logging in with an account of the form `123456@aruba.it`. Not cPanel, not Plesk. (`managehosting.aruba.it` is real but is the billing *area clienti*, redirecting through `mylogin.aruba.it` SSO — it is not where files or DNS are managed.) cPanel and Plesk *do* exist inside the Aruba group, but on the separate **Aruba Business** reseller line, documented at `guide.arubabusiness.it`, where the Plesk Windows web root is `httpdocs`. Consumer aruba.it Hosting Linux has neither.

Note also that `guide.hosting.aruba.it` now 301-redirects to `guide.aruba.it`, and `kb.aruba.it` redirects to the Italian support portal `assistenza.aruba.it`. There is no English-language Aruba hosting KB.

## Where the web root is

**Aruba never publishes one authoritative directory name, and the FTP login root is *not* the web root.** Its own FAQ is explicitly hedged: make sure you are in "la **directory corretta del dominio, per esempio /web o /htdocs, a seconda della configurazione**" — "the correct directory of the domain, **for example /web or /htdocs, depending on the configuration**" — and "**non caricare file nella root superiore**, dove si trovano cartelle di sistema o di backup" ("do not upload files into the upper root, where system or backup folders are").

Three further facts pin down the shape:

- One FTP login can expose several domains at once: "Se hai **più domini** gestiti con lo stesso account Aruba, accedendo con FTP, **visualizzerai tutte le cartelle degli stessi**." A login directory that contains N domains cannot itself be any one domain's document root.
- `Backup Giornaliero` and `Backup Settimanale` are created automatically *beside* the site folder, and File Manager describes pasting restored content into "la **cartella principale del dominio (root)**".
- Uploading at the wrong level fails visibly with **550 Permission denied**.

So the shape is: **log in by FTP → you land one level above → enter the folder for your domain → that is the web root.** The name is `/web`, `/htdocs`, or the domain's own name depending on plan vintage. **`public_html` appears nowhere in Aruba's documentation.** This is the one fact to confirm against the live account rather than assume — Aruba's own docs decline to commit.

The `robots.txt` guide corroborates the target: "Il file **robots.txt si trova nella cartella principale del dominio**."

## Steps to install the five files

**Via FTP/FTPS (works on every Hosting Linux plan):**
1. Host: **`ftp.<nomedominio>.<estensione>`** — a per-domain hostname, not a shared server name. On a combined Windows+Linux product use `ftplnx.<domain>` for the Linux space and `ftpwin.<domain>` for the Windows space.
2. Port **21**, protocol FTP, encryption "usa se disponibile FTP esplicito su TLS", access type `Normale`. For implicit FTPS use `ftps://ftp.<domain>` on port **990**.
3. Username is the **Aruba account** — `123456@aruba.it` — with the account password. There is exactly one: "un dominio può essere gestito con un solo account: **non è possibile in alcun modo creare ulteriori account FTP**."
4. Navigate *into* the domain's folder (see above). Do not drop files next to `Backup Giornaliero`.
5. Upload the five files, creating `.well-known/` as a subdirectory — but read the dot-directory warning below first.
6. Purge the cache (below), or the new files may not be visible for up to 12 hours.

**Via the panel File Manager (no client needed):**
1. Log in at `admin.aruba.it` → left menu → the service name (e.g. **Hosting Linux**) → **Gestisci** under **File Manager**. Aruba: "lo strumento integrato nel pannello di controllo che ti permette di gestire file e cartelle dello spazio web direttamente dal browser, **senza utilizzare un client FTP**."
2. Use **Nuova cartella** / create-file to build the tree, and the built-in editor for the text files.

**Via SFTP (Linux Advanced/Professional, Hosting Gestito Premium/Top, WooCommerce, Hyper only):**
1. Panel → **Strumenti e Impostazioni** → **Chiavi SSH** → **Gestisci**. Import an RSA/ECDSA/EdDSA public key — "Prima di tutto occorre creare una chiave SSH e importarla all'interno del pannello di controllo." A user cannot be created before a key exists; up to five keys and five users.
2. Read **Host** and **Utente** from that same Chiavi SSH section.
3. Connect over SFTP with the key. Password-based SFTP is not offered.

## The `.well-known/` problem

**The string `.well-known` appears nowhere in Aruba's documentation — UNVERIFIED as a documented capability.** Two officially documented facts bracket it:

- **Dot-names are supported.** Aruba's own cache guide instructs customers to place a **`.htaccess`** in the web space "tramite FTP o File Manager". A leading dot is not rejected by either upload path.
- **But dot-entries become invisible and undeletable over FTP.** Verbatim: "**Usando i client FTP, infatti, i file nascosti non vengono visualizzati** quindi, una volta pubblicati, **non possono essere eliminati manualmente**. Se desideri rimuovere i file nascosti, puoi **aprire una richiesta di assistenza**" — hidden files are not displayed by FTP clients, so once published they cannot be deleted manually; removing them requires a support ticket.

Whether the web File Manager can *create* a dot-named **directory** is **UNVERIFIED**: the create-folder guide says only "inserisci il nome della cartella… vai su Invio", with no stated character restrictions, and no Aruba page addresses hidden-file visibility inside File Manager.

**Recommendation: skip the file on Aruba and use the apex DNS TXT record instead.** BotCentral scores it higher anyway, and it avoids writing something Aruba's own documentation says you will not be able to see or delete afterwards. If you do write `.well-known/botcentral.txt`, treat it as write-once.

## Gotchas

- **HiSpeed Cache is pre-enabled with a 12-hour TTL on anything bought after 2024-05-09.** "Una pagina standard di un sito su **Hosting Linux** … viene conservata per **12 ore** nella cache" and "Per i pacchetti Hosting Linux acquistati dopo il 09/05/2024 la funzione HiSpeed Cache è **preattivata**." A freshly uploaded `robots.txt` or `llms.txt` can serve stale for half a day. Clear it: panel → **HiSpeed Cache** → **Cancella cache**, which "consente di mostrare modifiche recenti, **senza attendere le 12 ore**". Header- and `.htaccess`-based control also works.
- **The cache bypass list matches bare substrings.** URLs containing `user`, `info`, `contact`, `flag`, `cart`, `ajax` and others skip the cache. A path such as `/userinfo.txt` would incidentally bypass it — surprising, and worth knowing when a file mysteriously *is* fresh.
- **SuperSite and Swite have no file access at all.** "servizi come **SuperSite o Swite non permettono la gestione del sito tramite FTP**." If the domain is on one of those rather than on Hosting Linux, none of the steps above exist. Check the product first. SuperSite generates its own `robots.txt` and `sitemap.xml`; plain Hosting Linux does not ("Se il servizio non lo genera, puoi creare il file manualmente"), so on Linux the customer owns both files.
- **One FTP credential per Aruba *account*, spanning every domain on it.** No scoped or per-site FTP users can be created. A credential handed to an installer is a credential to everything.
- **"Limita accesso FTP" is an IP allowlist** that will silently refuse connections from an unlisted address — a likely cause of a mystery FTP failure from a CI runner.
- **Entry-level plans have no SSH and no SFTP.** SFTP exists only "per i servizi che prevedono la funzionalità **Chiavi SSH**": Hosting Linux Advanced/Professional, Hosting Gestito Premium/Top per WordPress, Hosting Gestito per WooCommerce, Hyper Hosting Linux, Hyper Hosting Gestito per WordPress. Below those, FTP/FTPS only.
- **Aruba can put a domain into "Sito web in manutenzione"**, replacing the site administratively; and **Reset spazio web** wipes the space back to default (self-service on Linux, but Hosting Windows requires a signed PDF plus an ID document).

## If files cannot be placed

Use the **apex DNS TXT record** — it is fully supported by hand, and it is the recommended route on Aruba.

Aruba runs the DNS by default: "Quando un dominio viene attivato gli vengono **automaticamente assegnati i Name Server di Aruba**." The nameservers are `dns.technorail.com`, `dns2.technorail.com`, `dns3.arubadns.net` and `dns4.arubadns.cz`. Switching away is all-or-nothing ("o usi tutti i Name Server di Aruba, oppure usi tutti i Name Server esterni ad Aruba") and moves mail off Aruba too.

To add the apex TXT record: DNS panel → **Aggiungi record** → type **TXT (Text)** → **leave "Nome host" empty** (Aruba states this explicitly for apex-level records such as SPF or a Google/Microsoft verification string) → put the string in **Valore** → set TTL → **Aggiungi**. Records can also be imported/exported, and operations can be scheduled.

**lego cannot automate this. There is no `aruba` provider.** Confirmed two ways: a case-insensitive search of the lego provider index returns zero occurrences of `aruba`, and the repository's `providers/dns` directory on `main` (v5.4.1, 225 entries) contains no `aruba` package. **Nor is there any public Aruba DNS API** — `api.aruba.it`, `developers.aruba.it`, `apidocs.aruba.it` and `apidoc.cloud.it` all fail to resolve, and no Aruba DNS guide mentions a token, an API or programmatic record management. Every documented DNS operation is manual clicking. **UNVERIFIED that any Aruba DNS API exists at all.**

Practical consequences for automated ACME/DNS-01 on Aruba DNS: it is not possible with lego directly. The workable routes are (a) a manual TXT entry per renewal, (b) `acme-dns` or another delegation target reached by a **CNAME** on `_acme-challenge` — Aruba does support CNAME records — or (c) HTTP-01 under `.well-known/acme-challenge/`, which runs straight back into the dot-directory caveat above.

For the CiteFleet pack specifically: put `robots.txt`, `sitemap.xml`, `llms.txt` and `<indexnow-key>.txt` in place over FTP or the File Manager, prove BotCentral with the apex TXT record, and skip `.well-known/botcentral.txt` entirely.

## Sources

- https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/pubblicazione-gestione-sito/configurazione-client-ftp-pubblicazione-ftp-ftps — host `ftp.nomedominio.estensione`, port 21, explicit FTP over TLS, `ftpwin.`/`ftplnx.` variants, FTPS on 990; username `123456@aruba.it` and "non è possibile in alcun modo creare ulteriori account FTP"; multiple domains visible from one login; hidden files invisible over FTP and removable only via support; SuperSite/Swite have no FTP
- https://guide.aruba.it/faq/hosting-e-domini/pubblicazione-sito — the 550 Permission denied FAQ: "per esempio /web o /htdocs, a seconda della configurazione"; "non caricare file nella root superiore"
- https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/file-manager/come-accedere — File Manager is built into the panel, "senza utilizzare un client FTP"; panel path and eligible products
- https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/file-manager/creare-cartella-file — creating a folder: enter the name and press Invio; no character restrictions stated
- https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/file-manager/ripristino-file-cartelle-backup — automatic `Backup Giornaliero` / `Backup Settimanale` folders; "la cartella principale del dominio (root)"
- https://guide.aruba.it/risorse/accesso-pannello-di-controllo-dominio — panel is `admin.aruba.it`, username `123456@aruba.it`
- https://guide.aruba.it/hosting-e-domini/hosting/hosting-linux/pannello-controllo-linux/gestione-chiavi-ssh — SSH/SFTP is key-only, imported in the panel; eligible plans (Linux Advanced/Professional, Gestito Premium/Top, WooCommerce, Hyper); five keys and five users; git clone over GIT/SSH not permitted
- https://guide.aruba.it/hosting-e-domini/hosting/strumenti-consigli-cms/gestire-cache-sito — HiSpeed Cache 12-hour TTL, pre-enabled after 2024-05-09, "Cancella cache" button, `.htaccess`/`mod_headers` control, the substring-matched bypass list, Redis at `/aruba/redis/redis.sock`
- https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/pubblicazione-gestione-sito/indicizzare-sito — "Il file robots.txt si trova nella cartella principale del dominio"; auto-generated only on SuperSite, otherwise "puoi creare il file manualmente"
- https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/pubblicazione-gestione-sito/limita-accesso-ftp — the FTP IP allowlist
- https://guide.aruba.it/hosting-e-domini/hosting/gestione-strumenti-hosting/pubblicazione-gestione-sito/reset-spazio-web — Reset spazio web; Windows requires a signed form plus ID
- https://guide.aruba.it/hosting-e-domini/gestione-dns/gestione-name-server-e-record/gestire-name-server — nameservers assigned automatically; `dns.technorail.com`, `dns2.technorail.com`, `dns3.arubadns.net`, `dns4.arubadns.cz`; all-or-nothing switching
- https://guide.aruba.it/hosting-e-domini/gestione-dns/gestione-name-server-e-record/gestire-record-txt-dmarc-dkim-spf — Aggiungi record → TXT → leave "Nome host" empty for the apex → Valore → TTL → Aggiungi
- https://guide.aruba.it/hosting-e-domini/gestione-dns/gestione-name-server-e-record/gestire-record-cname — CNAME records are supported (the `_acme-challenge` delegation route)
- https://guide.arubabusiness.it/hosting/hosting-windows/pannello-plesk-windows/gestorefile — the separate Aruba Business line does use Plesk/cPanel; its Plesk Windows root is `httpdocs`
- https://go-acme.github.io/lego/dns/ and https://github.com/go-acme/lego/tree/main/providers/dns — no `aruba` provider among the 225 packages on `main` (v5.4.1)
