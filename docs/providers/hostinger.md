# Hostinger (hPanel)

- **Market share:** 5.2% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting (hPanel), plus a separate SaaS site builder (Hostinger AI Builder)
- **File access:** SFTP + FTP + control-panel file manager on Web/Cloud hosting (SFTP requires Web Premium plan or above); AI Builder agentic mode has a code editor but no FTP, SFTP, SSH, standard File Manager, or manual code-file creation.
- **Automatable by CiteFleet:** the current Hosting Files API offers a direct upload URL for Web/Cloud sites, with no SFTP setup. This is a candidate path, not a verified customer installer yet; Hostinger Website Builder has no writable web root. The older SFTP path below remains an alternative.
- **Docs consulted:** https://www.hostinger.com/support/1583494-what-is-the-path-to-your-website-s-root-home-directory-and-how-to-change-it-in-hostinger/, https://www.hostinger.com/support/1583647-is-sftp-access-enabled-at-hostinger, https://www.hostinger.com/support/5972689-how-to-connect-to-your-hosting-using-sftp-in-hostinger/, https://www.hostinger.com/support/10442158-how-to-connect-to-your-hosting-plan-using-sftp-in-hostinger/, https://www.hostinger.com/support/10657418-hostinger-agency-hosting-plans-how-to-use-remote-access-ssh-sftp/, https://www.hostinger.com/support/1583645-how-to-enable-ssh-access-in-hostinger/, https://www.hostinger.com/support/5634532-how-to-generate-ssh-keys-and-add-them-to-hostinger-hpanel/, https://www.hostinger.com/support/1714427-how-to-find-ftp-details-on-hpanel-at-hostinger/, https://www.hostinger.com/support/1869164-how-to-upload-backups-with-ftp-in-hostinger/, https://docs.hostinger.com/websites/ftp-ssh, https://docs.hostinger.com/websites/file-manager, https://www.hostinger.com/support/4548688-basic-actions-in-the-file-manager-in-hostinger/, https://www.hostinger.com/support/1583307-how-to-create-an-htaccess-file-at-hostinger/, https://www.hostinger.com/support/4622407-how-to-show-hidden-files-htaccess-in-cpanel-file-manager-at-hostinger/, https://docs.hostinger.com/websites/ip-access-rules, https://www.hostinger.com/support/1583664-how-to-manage-txt-records-at-hostinger/, https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/, https://docs.hostinger.com/domains/dns, https://www.hostinger.com/ai-builder/features/built-in-seo, https://www.hostinger.com/support/6491673-hostinger-website-builder-website-s-sitemap, https://www.hostinger.com/support/how-to-enable-llms-txt-on-your-website/, https://www.hostinger.com/tutorials/wordpress-robots-txt/, https://go-acme.github.io/lego/dns/hostinger/ — fetched 2026-09-11

## Current API and sign-in path (rechecked 2026-09-22)

Hostinger's official API now exposes `GET /api/hosting/v1/websites`, whose exact-domain result includes `username`, `website_type`, and `root_directory` for CloudLinux sites. The Hosting Files API lists files, reads text file content, and generates an upload URL for a selected `username` and `domain`. The returned URL uses TUS with `X-Auth` and `X-Auth-Rest` headers; the documented destination is the selected website's `public_html`. This is a safer account and site discovery path than guessing a directory from the hPanel layout. Existing file content must still be checked before overwriting, and a live audit must check whether WordPress or the builder already serves a virtual robots or sitemap route.

The REST API documents bearer API tokens. Hostinger separately offers browser OAuth for its hosted MCP server at `https://mcp.hostinger.com`, including a login and consent step. A local loopback OAuth callback was exercised with the operator's normal browser: consent and code exchange succeeded, `GET /api/hosting/v1/websites` returned HTTP 200, and the access token was revoked. A production HTTPS callback registration for `https://citefleet.app/api/hosting/hostinger/callback` returned HTTP 400 `invalid_redirect_uri`; Hostinger approval/allowlisting remains necessary. No Web/Cloud upload has been exercised. Do not mark the Hostinger flow `ready` or tell a customer that login alone installs files until a Web/Cloud test account demonstrates the full sequence: exact site selection, ownership-safe upload, live file checks, DNS or origin proof, and IndexNow notification. AI Builder remains unsupported for root-file uploads.

On 2026-09-22, a second read-only local OAuth inspection after the operator created an AI Builder agentic-mode test site returned one record from `GET /api/hosting/v1/websites`: `website_type=horizons`, with no `username` or `root_directory`. `GET /api/horizons/v1/websites` returned one `active` record. Both calls succeeded; the token was revoked. The account now has a site, but it cannot exercise the Web/Cloud five-file uploader. `active` alone does not establish that the public site has been published or that any files are live.

CiteFleet now has a server-side Files API adapter (`src/lib/citefleet/hostinger-files.server.ts`) with exact-domain checks, existing-file inspection, ownership guards, TUS upload, and live-byte verification. A customer sign-in and one-use Bot job route are now wired to the campaign UI. The delegated web OAuth redirect, REST permission, Grok Bot routine callback, and real Web/Cloud upload still need end-to-end validation with a customer account. The adapter refuses a missing `.well-known` directory until Hostinger directory creation is verified on a live account.

### CiteFleet assisted install (built, live validation pending)

The customer picks Hostinger for their own site and clicks **Connect Hostinger and install files**. CiteFleet registers a short-lived OAuth client using Hostinger's published PKCE contract, binds the state to the logged-in customer and exact site, inspects all five target paths, and stores the temporary access token encrypted in a tenant-scoped job. It POSTs a one-use job capability to the operator's webhook-triggered Grok Bot routine. The Bot POSTs the capability to CiteFleet's exact install endpoint; CiteFleet uses the customer grant for the guarded TUS uploads and verifies every file from the public origin. Webhook 200 means the Bot started, not that the files are installed. After the five live byte matches, CiteFleet submits URLs to IndexNow through the existing key-and-sitemap gate. The status panel reports file `verified` only after five live byte matches and states the separate IndexNow result; receipt by IndexNow does not guarantee search indexing. It never accepts a customer's Hostinger password.

After Hostinger confirms that CiteFleet's HTTPS callback is allowed and a live registration succeeds, set `CITEFLEET_HOSTINGER_OAUTH_APPROVED=on`. Until then the customer action stays disabled. Deployment also requires `CITEFLEET_HOSTINGER_TOKEN_KEY` (32 random bytes, standard base64), `CITEFLEET_GROK_BOT_WEBHOOK_URL`, and `CITEFLEET_GROK_BOT_WEBHOOK_KEY`. Create one Active Grok Bot routine with a webhook trigger. Its instruction must require one POST to the supplied `endpoint` using the supplied `authorization` header, report the response, and never request or display customer credentials. Store the URL/key in deployment secrets; never place them in browser settings or chat. Apply migration `20260921120000_citefleet_hostinger_installs.sql` before deploying the routes.

**Live status remains unverified:** Hostinger's open-source OAuth example registers a local loopback callback. [Hostinger issue #53](https://github.com/hostinger/api-mcp-server/issues/53) reports that a third-party production HTTPS callback was rejected with `invalid_redirect_uri` until allowlisting; CiteFleet's own HTTPS callback registration returned that error. The local OAuth grant did authorize read access to the Hosting Websites and Horizons REST endpoints; Hosting Files permissions and upload remain untested on a Web/Cloud site. The current Files API lacks a verified folder-creation call; a new site without `.well-known` stops before upload. Builder sites and conflicting live routes also stop. A real Web/Cloud customer test must prove registration, consent, exact-site selection, upload, all five public reads, and token revocation before calling this fully automatic.

Official sources: [Hosting Files API](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingFilesApi.md), [website listing API](https://github.com/hostinger/api-python-sdk/blob/main/docs/HostingWebsitesApi.md), [Horizons website API](https://github.com/hostinger/api-python-sdk/blob/main/docs/HorizonsWebsitesApi.md), [Hostinger MCP OAuth](https://www.hostinger.com/support/11079316-hostinger-api-mcp-server/), [AI Builder file limits](https://www.hostinger.com/support/hostinger-ai-builder-agentic-mode-manage-files-and-data/), [File Manager availability](https://support.hostinger.com/en/articles/4548688-basic-actions-in-the-file-manager).

## Where the web root is

By default the web root is **`public_html`**, under the customer's home
directory. Hostinger documents two path shapes depending on whether the
target is the plan's primary domain or an addon/secondary/parked domain:

```
/home/u12345678/public_html                       # primary domain
/home/u12345678/domains/<domain.tld>/public_html  # addon / secondary / parked domain
```

`u12345678` is the account's own numeric username and differs per customer —
an installer must discover it (or the resolved path) rather than assume it.

**How to find the exact path:** hPanel → **Websites** → **Dashboard** for the
site → **FTP Accounts** in the sidebar → the **Create New FTP account**
section displays the live root folder path for that domain.

**Equivalent File Manager click-path** to an addon domain's root: **Files →
File Manager → Access all files of Your Hosting → domains →
`<domain.tld>` → `public_html`.**

The home directory location cannot be changed on Web, WordPress and Cloud
hosting plans — Hostinger documents this as a control-panel restriction, with
an `.htaccess` redirect or a VPS upgrade as the only workarounds. So the path
shape above can be treated as fixed for these plans.

Note Hostinger also resells a separate **cPanel hosting** product line
alongside hPanel; that product behaves like stock cPanel, not like hPanel —
called out specifically in the dotfile section below, where the two differ.

## Steps to install the five files

### Unattended, via rclone over SFTP (Web Premium plan and above)

1. Enable remote access: hPanel → **Websites → Dashboard → Advanced → SSH
   Access** (also surfaced as **Advanced → Remote Access** on newer/Agency
   pages) → toggle **SSH/SFTP Remote Access** ON. It is **off by default** on
   a new plan; the connection is refused until enabled. Hostinger's own answer
   to "Is SFTP access enabled at Hostinger?" is: "We do provide Secure File
   Transfer Protocol (SFTP) access with our Web Premium hosting plans and
   above" — the entry-level Single plan does not qualify.
2. On the same page, add the CiteFleet public key (**Add SSH key**, paste the
   contents of the `.pub` file). Hostinger states that "an SSH password won't
   be needed when logging in to your server" once a key is added — this is
   what makes the run unattended rather than needing an interactive password.
3. Read the connection details from that page:
   - **Host:** the FTP IP shown there (e.g. `185.185.185.185`)
   - **Port:** **65002** — confirmed identically across three separate
     Hostinger support articles (SFTP-connect guide, the Agency remote-access
     guide, and a second SFTP-connect article under a different support ID).
     Not 22 — see Gotchas.
   - **Username:** the FTP/SSH username shown on the page
4. Configure rclone, e.g. an `sftp` remote: `type = sftp`, `host = <FTP IP>`,
   `port = 65002`, `user = u12345678`, `key_file = <path to private key>`.
5. Upload into the resolved root — `public_html/` (primary domain) or
   `domains/<domain.tld>/public_html/` (addon domain):
   `robots.txt`, `sitemap.xml`, `llms.txt`, `<indexnow-key>.txt`, and
   `.well-known/botcentral.txt` (create the `.well-known` directory first if
   it does not exist — ordinary `mkdir` over SFTP works, see below).
6. No IP allowlisting is documented as a prerequisite for SFTP itself.
   Hostinger's separate **IP Manager** (`Advanced → IP Manager`) is documented
   as a website (HTTP) access-control feature — allow/block rules for
   visitors reaching the site — not as a gate in front of SSH/SFTP.

### Plain FTP (any Web/Cloud plan, not recommended for unattended use)

Available on "web and cloud hosting plans," but **not** on Agency plans
(which use SFTP instead) and **not** at all on Hostinger AI Builder sites
("non-file-based platform"). **Host:** the FTP IP shown in hPanel's FTP
Accounts section (Hostinger's docs do not give a `ftp.<domain>` hostname
form anywhere searched — only "FTP IP" or "your domain" as alternatives).
**Port:** 21. FTP transmits credentials unencrypted, which is a poor fit for
an unattended script holding stored credentials; use it only as a manual
fallback.

### By hand, via the hPanel File Manager (Web/Cloud hosting only)

1. hPanel → **Websites → Dashboard** (for the site) → **File Manager**.
2. Navigate into **`public_html`** (primary domain) or **`domains` →
   `<domain.tld>` → `public_html`** (addon domain).
3. Click **Upload** and select the file, or drag-and-drop it into the window
   (documented site-size upload limit: under 100 GB).
4. To create the `.well-known` folder: use **New folder** in the left-hand
   action menu, type the name (including the leading dot — see below),
   confirm, then upload `botcentral.txt` inside it.

## The `.well-known/` problem

**Confirmed creatable and confirmed visible — this is not a problem on
hPanel's own File Manager.**

Hostinger's official `.htaccess`-creation article states directly: "Since the
Hostinger File Manager displays all files (including hidden dotfiles) by
default, a missing `.htaccess` file means it does not exist yet and needs to
be generated." The documented creation flow is simply **New File** → type the
name with the leading period → **Create**, with the explicit warning to
"Always include the period at the beginning of the filename (`.htaccess`), or
the server will not recognize it." The same **New folder** control is used
for directories, so `.well-known/` can be created and populated directly in
the browser, with no hidden-files toggle to find first.

**The exception is Hostinger's separate cPanel hosting product line.** There,
stock cPanel behavior applies and dotfiles are hidden until the customer
enables them — documented separately as "How to show hidden files (.htaccess)
in cPanel file manager at Hostinger": File Manager → **Settings** (top right)
→ check **Show Hidden Files (dotfiles)** → save. If a support conversation is
unsure which product a customer is on, ask them to check Settings for that
toggle; if it's present, they're on the cPanel product line, not hPanel.

Either way, this file is optional. An apex DNS TXT record proves the same
thing, BotCentral scores it higher, and Hostinger runs the DNS zone for most
of its customers anyway (see below) — so for a Hostinger customer the TXT
record is both the easier and the higher-scoring route, and
`.well-known/botcentral.txt` is worth placing only as a belt-and-braces
second proof, not as the primary one.

## Gotchas

- **SFTP port is 65002, not 22.** Confirmed identically across three separate
  official Hostinger support articles. An installer that hardcodes port 22
  for Hostinger will simply time out; a separate generic
  docs.hostinger.com overview page states "port 22" without an
  account-specific example — treat 65002 as the confirmed, account-facing
  value.
- **SSH/SFTP is off by default and gated by plan.** It must be turned on in
  hPanel (Advanced → SSH Access / Remote Access) before any connection
  succeeds, and it requires a Web Premium plan or higher — the Single plan
  has no SFTP/SSH at all, so `rclone` over SFTP cannot work there; the
  customer is limited to plain FTP or File Manager on that tier.
- **Root path differs between primary and addon domains.** A script that
  assumes plain `public_html` will silently write into the wrong domain's
  root if the actual target is an addon/parked domain; always resolve
  `domains/<domain.tld>/public_html` for anything other than the account's
  primary domain. The `u<id>` home-directory segment is also per-account —
  never hardcode it.
- **Hostinger AI Builder generates and owns robots.txt, sitemap.xml, and
  llms.txt.** Hostinger's own AI Builder SEO page states these are "created
  automatically" once a site on a custom domain goes live, "no setup needed,"
  and a separate article confirms the sitemap specifically is "automatically
  updated each time you update your website." No fetched doc describes a way
  to upload a replacement on an AI Builder site — for these customers, the
  auto-generated files are authoritative and file placement is not possible.
- **WordPress's virtual robots.txt is silently overridden by a physical
  file.** Hostinger's own WordPress robots.txt guide documents that WordPress
  generates a virtual robots.txt by default, and that creating a physical
  `robots.txt` in `public_html` (via File Manager or FTP) overrides it — safe
  for the installer, but it also means WordPress's Settings → Reading toggle
  stops doing anything once the physical file exists.
- **A "Hostinger Tools" WordPress plugin toggle can also generate
  `llms.txt`.** Hostinger's llms.txt article documents a **Hostinger → Tools
  → LLM Optimization → "Create LLMs.txt file"** toggle inside the WordPress
  admin, separate from AI Builder's own **Web2Agent settings** toggle. If
  that plugin toggle is on, it manages `llms.txt` itself; **UNVERIFIED**
  whether a hand-uploaded `llms.txt` survives with the toggle also on — no
  fetched doc states the precedence. Safest advice: turn the toggle off, then
  upload CiteFleet's file, or leave Hostinger to generate it and don't
  upload one.

## If files cannot be placed

For **Hostinger AI Builder** sites (no FTP, no SFTP, no filesystem, files
auto-generated), and as the generally preferred route for the `.well-known/`
proof file on any Hostinger plan, use DNS instead.

Hostinger **runs its own nameservers and DNS zone** for domains registered or
pointed at it: "If your main domain has hosting connected..." confirms
per-hosting DNS management, and docs.hostinger.com states plainly, "Manage
DNS records on Hostinger nameservers from hPanel — add or edit A, CNAME, MX,
and TXT records." Click-path: **hPanel → Domains → DNS** → select the domain
(the same path for both a domain with hosting attached and a domain-only
account). Add a **TXT** record with **Host/Name** `@` (domain apex) and the
verification string in the **TXT value** field; Hostinger's documented
default TTL is **14400 seconds (4 hours)**, with propagation "up to 24
hours."

For persistent automation, use Entri Connect or call Hostinger's DNS Zone API
directly. lego (the ACME client) ships a **`hostinger`** DNS-01 provider
(https://go-acme.github.io/lego/dns/hostinger/), which corroborates the API
credential and tuning surface but only creates and removes temporary
`_acme-challenge` records:

- Required: `HOSTINGER_API_TOKEN`
- Optional: `HOSTINGER_HTTP_TIMEOUT` (default 30s), `HOSTINGER_POLLING_INTERVAL`
  (default 2s), `HOSTINGER_PROPAGATION_TIMEOUT` (default 60s), `HOSTINGER_TTL`
  (default 120s)
- Any variable may be suffixed `_FILE` to load the value from a file instead
- Lego's provider page links Hostinger's own API docs at
  **https://developers.hostinger.com/#tag/dns-zone** (DNS Zone tag)

No fetched hPanel-facing support article mentions this API directly — the DNS
Zone Editor articles describe only the manual hPanel flow. The API's existence
is confirmed by Hostinger's own developer portal (`developers.hostinger.com`)
and the
public `hostinger/api-php-sdk` GitHub repository, whose `DNSZoneApi.md`
states "All URIs are relative to https://developers.hostinger.com." This is
the recommended unattended route for proof-of-control on Hostinger — it works
on every plan tier including Single and AI Builder, where file-level access
does not exist or does not qualify for SFTP. The implementation must call that
API, not run lego.

## Sources

- https://www.hostinger.com/support/1583494-what-is-the-path-to-your-website-s-root-home-directory-and-how-to-change-it-in-hostinger/ — the two documented root paths (`/home/u12345678/public_html` and `/home/u12345678/domains/domain.tld/public_html`), the Websites → Dashboard → FTP Accounts route to find it live, and that the home directory cannot be changed on Web/WordPress/Cloud plans
- https://www.hostinger.com/support/1583647-is-sftp-access-enabled-at-hostinger — exact quote: "We do provide Secure File Transfer Protocol (SFTP) access with our Web Premium hosting plans and above"
- https://www.hostinger.com/support/5972689-how-to-connect-to-your-hosting-using-sftp-in-hostinger/ — SFTP port 65002, host = FTP IP, username = FTP/SSH user, confirms SSH access must be enabled first
- https://www.hostinger.com/support/10442158-how-to-connect-to-your-hosting-plan-using-sftp-in-hostinger/ — independently reconfirms SFTP host/port 65002 and the `sftp://` scheme via FileZilla Quickconnect/Site Manager
- https://www.hostinger.com/support/10657418-hostinger-agency-hosting-plans-how-to-use-remote-access-ssh-sftp/ — Advanced → Remote Access → SSH/SFTP Remote Access toggle and "SFTP only" mode; third independent confirmation of port 65002
- https://www.hostinger.com/support/1583645-how-to-enable-ssh-access-in-hostinger/ — SSH requires Premium Web plan or higher (Single excluded); access is scoped to the home directory and below
- https://www.hostinger.com/support/5634532-how-to-generate-ssh-keys-and-add-them-to-hostinger-hpanel/ — Websites → Dashboard → SSH Access → Add SSH key; "an SSH password won't be needed when logging in" once a key is added; requires Premium or above
- https://www.hostinger.com/support/1714427-how-to-find-ftp-details-on-hpanel-at-hostinger/ — FTP host = server IP (not a `ftp.<domain>` form); FTP available on web/cloud plans, not Agency, not AI Builder
- https://www.hostinger.com/support/1869164-how-to-upload-backups-with-ftp-in-hostinger/ — reconfirms FTP available on web/cloud plans only, port 21, host = FTP IP
- https://docs.hostinger.com/websites/ftp-ssh — confirms FTP port 21; states (unconfirmed for the actual account-facing value) SFTP/SSH "port 22" generically
- https://docs.hostinger.com/websites/file-manager — File Manager click path (Website dashboard → File Manager); upload via drag-and-drop or Upload button into `public_html`
- https://www.hostinger.com/support/4548688-basic-actions-in-the-file-manager-in-hostinger/ — confirms a "New folder" action exists in hPanel's File Manager
- https://www.hostinger.com/support/1583307-how-to-create-an-htaccess-file-at-hostinger/ — the key confirmation: "the Hostinger File Manager displays all files (including hidden dotfiles) by default"; dot-prefixed files created via New File with the leading period required
- https://www.hostinger.com/support/4622407-how-to-show-hidden-files-htaccess-in-cpanel-file-manager-at-hostinger/ — confirms the separate cPanel product line hides dotfiles until Settings → "Show Hidden Files (dotfiles)" is checked
- https://docs.hostinger.com/websites/ip-access-rules — confirms the IP Manager/access-rules feature is scoped to website (HTTP) access control, not SSH/SFTP gating
- https://www.hostinger.com/support/1583664-how-to-manage-txt-records-at-hostinger/ — TXT record steps: host `@` for apex, default TTL 14400 seconds, propagation up to 24 hours
- https://www.hostinger.com/support/1583249-how-to-manage-dns-records-at-hostinger/ — DNS Zone Editor click-path: hPanel → Domains → DNS → select domain
- https://docs.hostinger.com/domains/dns — "Manage DNS records on Hostinger nameservers from hPanel — add or edit A, CNAME, MX, and TXT records," i.e. Hostinger runs the DNS zone; no API endpoint given on this page
- https://www.hostinger.com/ai-builder/features/built-in-seo — AI Builder auto-creates sitemap.xml, robots.txt, and llms.txt on publish to a custom domain, "no setup needed"; no override/upload path documented
- https://www.hostinger.com/support/6491673-hostinger-website-builder-website-s-sitemap — "Hostinger AI Builder configures your sitemap automatically, so no manual setup is needed," and it "is also automatically updated each time you update your website"
- https://www.hostinger.com/support/how-to-enable-llms-txt-on-your-website/ — two managed toggles that create llms.txt: AI Builder's Website Settings → General → Web2Agent "Enable LLMs.txt," and WordPress's Hostinger → Tools → LLM Optimization → "Create LLMs.txt file"
- https://www.hostinger.com/tutorials/wordpress-robots-txt/ — confirms WordPress's default virtual robots.txt is overridden by a physical robots.txt placed in `public_html` via File Manager or FTP
- https://go-acme.github.io/lego/dns/hostinger/ — lego's `hostinger` DNS provider: env vars `HOSTINGER_API_TOKEN` (required), `HOSTINGER_HTTP_TIMEOUT`, `HOSTINGER_POLLING_INTERVAL`, `HOSTINGER_PROPAGATION_TIMEOUT`, `HOSTINGER_TTL` (optional, with defaults), `_FILE` suffix support, and a link to Hostinger's own API docs at `https://developers.hostinger.com/#tag/dns-zone`
