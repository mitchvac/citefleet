# Hetzner

- **Market share:** 2.1% of all websites (W3Techs, 2026-09-11)
- **Category:** VPS/cloud (Hetzner Cloud servers) + shared hosting with a control panel (Webhosting / konsoleH)
- **File access:** SSH as `root` (Cloud servers) | SFTP/FTPS, WebFTP file manager, SSH on L/XL only (Webhosting)
- **Automatable by the CiteFleet script (rclone):** yes for Cloud servers; partly for Webhosting (SFTP/FTPS always, SSH only on L and XL plans)
- **Docs consulted:** https://docs.hetzner.com/cloud/servers/getting-started/connecting-to-the-server/, https://docs.hetzner.com/managed/webhosting/overview, https://docs.hetzner.com/networking/dns/record-types/txt-record/, https://go-acme.github.io/lego/dns/hetzner/ — fetched 2026-09-11

Hetzner is the **most scriptable** provider in this set. Both of its products give
the customer a real writable filesystem, there is no managed git-deploy platform
in the mix, and — as far as the published product documentation goes — **no CDN
layer to invalidate**. No cached-404 problem, no object-store `Content-Type`
metadata to get right, no build step that can drop a dot-directory.

| Product | Writable filesystem? | Scriptable unattended? |
|---|---|---|
| Hetzner Cloud server | Yes — real Linux disk, SSH as `root` | Yes (SSH/SFTP/rsync) |
| Webhosting L / XL | Yes — SFTP/FTPS **and** SSH | Yes |
| Webhosting S / M | Yes — SFTP/FTPS only, **no SSH** | Yes, over SFTP/FTPS (no remote shell) |

Hetzner also sells Object Storage (S3-compatible, under the Storage docs
section), which would behave like the other object stores in this set. It is out
of scope for this file, which covers Cloud servers and Webhosting.

## Where the web root is

### Hetzner Cloud server

A real writable filesystem, and the simplest access story of any provider here:
you connect as root. The documented command is literally `ssh root@<IP-address>`,
with an IPv6 form `ssh root@<2001:db8:1234::1>` using the first address of the
assigned /64.

The document root depends on the distro image and web server the customer
installed, not on Hetzner — Hetzner publishes no canonical path, because the
Cloud product ships bare OS images. **UNVERIFIED** for any specific path.
(Searched: the Cloud servers getting-started section and
`docs.hetzner.com/cloud/servers/getting-started/connecting-to-the-server/`; the
docs cover connecting and server lifecycle, not web-server layout.) Distro
defaults apply — `/var/www/html/` for Apache and the Debian/Ubuntu nginx package,
`/usr/share/nginx/html/` for the upstream nginx package — but discover it rather
than assume:

```bash
apachectl -S 2>/dev/null | grep -i 'main DocumentRoot'
nginx -T 2>/dev/null | grep -E '^\s*root'
```

### Webhosting (konsoleH)

A real shared-hosting filesystem behind a control panel. The stack is documented:
"Apache (web server), Debian Linux (OS)". Management is through **konsoleH** —
"Conveniently manage your domains, email accounts, backups, and more via our
konsoleH."

Three file-access routes, and which ones you get depends on the plan:

- **SFTP/FTPS** — on every plan: "Create an unlimited number of FTP users and
  access via SFTP/FTPS".
- **WebFTP** — a browser file manager on every plan: "Upload, edit, or delete
  files without additional software".
- **SSH** — "Interactive server login via SSH", and the plan comparison table
  marks SSH Access as **S: No, M: No, L: Yes, XL: Yes**.

**The document root directory name is UNVERIFIED.** Hetzner's published
Webhosting documentation does not name it. I searched: `docs.hetzner.com/`
(top-level index), `docs.hetzner.com/managed/`, the full Webhosting navigation
(`difference-between-webhosting-packages`, `overview`, `fair-use-web-hosting`,
`webhosting-faq`, `old-webhosting-packages`, `webhosting-tutorials`),
`docs.hetzner.com/konsoleh/` and `docs.hetzner.com/konsoleh` (both return only a
landing shell), and
`docs.hetzner.com/konsoleh/account-management/ftp/ftp-accounts/` (404). The
Webhosting FAQ is entirely about whether a domain is required for various
features and says nothing about paths; the tutorials page links out to
community-authored guides on community.hetzner.com, which did not render as text
for retrieval. `public_html/` is the widely-repeated answer for this product but
I will not assert it from an unofficial source.

**Discover it instead — this is reliable and takes one command.** After
connecting over SFTP, the account's home directory listing shows the per-domain
web directories; on an L/XL plan over SSH:

```bash
ls -la ~                      # the account home
grep -ri DocumentRoot /etc/apache2/sites-enabled/ 2>/dev/null   # if readable
```

Or, definitively and without guessing: upload a throwaway file into the candidate
directory and fetch `https://example.com/<that-file>`. If it comes back, that is
the web root.

konsoleH also surfaces the domain's directory in the panel when a domain is
configured, which is the route a non-technical customer should be pointed at.

## Steps to install the five files

### Hetzner Cloud server (scriptable)

```bash
# 1. Connect — root by default
ssh root@<server-ip>

# 2. Find the real document root (do not assume)
apachectl -S 2>/dev/null | grep -i 'main DocumentRoot'
nginx -T 2>/dev/null | grep -E '^\s*root'

# 3. Push the pack (from the CiteFleet machine)
ROOT=/var/www/html
ssh root@<ip> "mkdir -p $ROOT/.well-known"
scp robots.txt sitemap.xml llms.txt '<key>.txt' root@<ip>:$ROOT/
scp botcentral.txt root@<ip>:$ROOT/.well-known/botcentral.txt
ssh root@<ip> "chmod 0644 $ROOT/robots.txt $ROOT/sitemap.xml $ROOT/llms.txt \
  $ROOT/'<key>.txt' $ROOT/.well-known/botcentral.txt"
```

First-login note from the docs: a server created *without* an SSH key gets its
root password by email, and "First-time root password logins require you to
change the password immediately upon connection." An automated push must
therefore use key auth — a password-first server will hang the script on an
interactive password-change prompt. With a key: "If you have not set a password,
you will automatically be connected."

### Webhosting L / XL (scriptable over SSH or SFTP)

Same as above, over SSH, but as the hosting user rather than root, and into the
account's own web directory rather than `/var/www/html`.

### Webhosting S / M (scriptable over SFTP/FTPS only)

No shell, so everything must be expressible as file operations. `lftp` handles
this, including creating the dot-directory:

```bash
lftp -u '<ftp-user>,<password>' -e "
  set ftp:ssl-force true;
  set ssl:verify-certificate true;
  cd <web-root>;
  mkdir -p .well-known;
  put robots.txt;
  put sitemap.xml;
  put llms.txt;
  put <key>.txt;
  put botcentral.txt -o .well-known/botcentral.txt;
  bye" <hostname>
```

Or over SFTP with the same credentials:

```bash
sftp <ftp-user>@<hostname> <<'EOF'
cd <web-root>
-mkdir .well-known
put robots.txt
put sitemap.xml
put llms.txt
put <key>.txt
put botcentral.txt .well-known/botcentral.txt
bye
EOF
```

The `-mkdir` (leading hyphen) tells sftp to continue if the directory already
exists. "Create an unlimited number of FTP users" means CiteFleet can be given a
dedicated, scoped FTP user rather than the customer's main credentials.

**No `Content-Type` step is needed on either product.** Apache serves these files
from disk and derives the type from the extension via `mime.types` — `.txt` →
`text/plain`, `.xml` → `application/xml` or `text/xml`. There is no object-store
metadata field to set and no platform header layer to fight.

## The `.well-known/` problem

### Cloud server — an ordinary directory

`mkdir -p /var/www/html/.well-known` as root just works. The one thing that
silently breaks it is a hardened nginx config carrying
`location ~ /\. { deny all; }`, which blocks every dot-path including
`/.well-known/botcentral.txt`. Apache's stock `<FilesMatch "^\.ht">` does **not**
match `.well-known`, so a default Apache install is fine. Check before declaring
success:

```bash
grep -rn '/\\\.' /etc/nginx/
```

and confirm by fetching the public URL.

### Webhosting — this is the one to watch, and the risk is the file manager

Over SFTP/FTPS the dot-directory is created and written without trouble: `mkdir`
and `put` are protocol operations and neither cares about a leading dot. That is
the route CiteFleet should use, and it is why Webhosting counts as scriptable
even on the plans without SSH.

The hazard is the **WebFTP browser file manager**. Control-panel file managers
across this whole category routinely hide dot-directories from the listing, and
some refuse to create them, so a customer who "checks whether the file is there"
in WebFTP may see nothing and conclude the upload failed when it did not. Whether
Hetzner's WebFTP specifically hides or refuses dotfiles is **UNVERIFIED** — the
konsoleH documentation section did not render any page content for retrieval (see
the trail above), and the Webhosting overview mentions WebFTP only as "Upload,
edit, or delete files without additional software". Do not route the customer
through WebFTP for this file; use SFTP, and verify by fetching the URL.

Apache is the web server on Webhosting, so the nginx dotfile-deny rule does not
apply. A `.htaccess` shipped by the customer's CMS could still block it — WordPress
and some security plugins add rules denying dot-paths. If the URL 403s, look
there first.

Because CiteFleet's apex DNS TXT record proves the same thing and BotCentral
scores it higher, a customer on Webhosting S/M who is uncomfortable handing over
SFTP credentials can skip the proof file entirely and use Hetzner DNS (below).

## Gotchas

- **No CDN to invalidate — but verify that assumption per customer.** Hetzner's
  top-level documentation index lists General, Cloud, Robot, Managed, Network &
  Security (DNS, Networks, Load Balancers) and Storage; no CDN product appears.
  That removes the cached-404 failure mode that dominates AWS, Google, Azure and
  DigitalOcean. It does **not** rule out a third-party CDN (Cloudflare in front
  of a Hetzner origin is extremely common). Check what the apex actually resolves
  to before assuming the origin is what answers.
- **Password-first Cloud servers block automation.** A server created without an
  SSH key forces an interactive password change on first root login. Provision
  with a key, or complete the first login by hand before scripting.
- **SSH is not available on Webhosting S or M.** Any runbook that assumes a
  remote shell fails on the two cheapest plans, which are the most common. SFTP
  is the lowest common denominator — write the automation against SFTP and let
  SSH be an optimisation.
- **Don't verify through WebFTP.** See above.
- **`.htaccess` can block `/.well-known/`.** Apache everywhere on Webhosting
  means customer-supplied `.htaccess` rules are in play.
- **Backups are nightly and kept 14 days** ("Automatically back up your data
  every night… stored for 14 days in a separate Hetzner data center") — useful if
  a push overwrites something, but it is a whole-account restore, not a per-file
  undo.
- **Verify over HTTP, from outside.** A successful `put` proves the bytes landed
  on disk; it does not prove Apache serves them at the URL with the right type.
  Check the status code *and* the `Content-Type`.

## If files cannot be placed

Fall back to the apex DNS TXT record, which BotCentral scores higher anyway.

Hetzner runs its own DNS (documented under **Network & Security → DNS**, now
managed in the Hetzner Console), and apex TXT records are explicitly supported.
Hetzner's TXT record page uses `@` for the zone apex and shows exactly this
shape of record:

- Root domain: name `@`, value `"hello world"`
- Site verification at the apex: name `@`, value
  `"google-site-verification=6P08Ow5E-8Q0m6vQ7FMAqAYIDprkVV8fUf_7hZ4Qvc8"`
- SPF at the apex: name `@`, value `"v=spf1 ip4:192.0.2.0/24 ip4:198.51.100.123 a -all"`

Formatting rules: "The value has to be quoted." A value may consist of multiple
substrings each capped at 255 characters, written as adjacent quoted strings —
Hetzner's example is `"hello " "world"`.

lego has a first-class plugin, and like DigitalOcean it needs exactly one secret:

- Provider code: **`hetzner`**
- Required: **`HETZNER_API_TOKEN`** — an API token
- Optional: `HETZNER_HTTP_TIMEOUT` (default 30s), `HETZNER_POLLING_INTERVAL`
  (default 2s), `HETZNER_PROPAGATION_TIMEOUT` (default 60s), `HETZNER_TTL`
  (default 120s)

One nuance on the token, worth getting right before wiring this up: lego's
current provider page points at `https://docs.hetzner.cloud/reference/cloud#dns`,
i.e. **Hetzner Cloud's API**, which matches Hetzner having folded DNS into the
Hetzner Console under Network & Security. Hetzner's Cloud API-token page
documents the token as created under **Security → API tokens → Generate API
token** (Read or Read & Write), used as `Authorization: Bearer $API_TOKEN`, and
warns "it is not possible to view the token again once the window has been
closed." Historically the lego `hetzner` provider used the separate Hetzner DNS
API with an `Auth-API-Token` header; which of the two a given lego build expects
is **UNVERIFIED** here — I could not retrieve a Hetzner page describing a
DNS-specific token (`docs.hetzner.com/dns-console/dns/general/dns-overview/` and
`.../api-access-token/` both returned Cloud-API content or navigation only).
Generate a Cloud API token with Read & Write first; if lego rejects it, the
legacy DNS-console token is the fallback.

For `robots.txt` / `llms.txt` / sitemap there is no fallback needed on either
Hetzner product — both give real file access, so these always land.

## Sources

- https://docs.hetzner.com/cloud/servers/getting-started/connecting-to-the-server/ — `ssh root@<IP-address>` and the IPv6 form; "If you have not set a password, you will automatically be connected"; root credentials by email and the forced first-login password change for password-only servers
- https://docs.hetzner.com/managed/webhosting/overview — konsoleH as the management tool; "Create an unlimited number of FTP users and access via SFTP/FTPS"; WebFTP ("Upload, edit, or delete files without additional software"); "Interactive server login via SSH" with the S/M/L/XL table showing SSH on L and XL only; Apache on Debian Linux; nightly backups retained 14 days
- https://docs.hetzner.com/managed/webhosting/ — the complete Webhosting documentation navigation (six pages); none names a document root
- https://docs.hetzner.com/managed/webhosting/webhosting-faq — confirmed to contain no path, FTP, SSH or `.htaccess` guidance (basis for the UNVERIFIED document-root note)
- https://docs.hetzner.com/ — the top-level documentation index: General, Cloud, Robot, Managed, Network & Security (DNS, Networks, Load Balancers), Storage — no CDN product listed
- https://docs.hetzner.com/networking/dns/ — the DNS documentation structure and the supported record types (A, AAAA, CAA, CNAME, DS, HTTPS, MX, NS, PTR, SRV, SVCB, TLSA, TXT)
- https://docs.hetzner.com/networking/dns/record-types/txt-record/ — `@` for the zone apex; "The value has to be quoted"; multiple 255-character substrings written as `"hello " "world"`; the apex site-verification and SPF examples
- https://docs.hetzner.com/dns-console/dns/general/api-access-token/ — Cloud API token creation (Security → API tokens → Generate API token; Read or Read & Write), `Authorization: Bearer $API_TOKEN`, and "it is not possible to view the token again once the window has been closed"
- https://go-acme.github.io/lego/dns/hetzner/ — lego provider code `hetzner`; `HETZNER_API_TOKEN` required; `HETZNER_HTTP_TIMEOUT`, `HETZNER_POLLING_INTERVAL`, `HETZNER_PROPAGATION_TIMEOUT`, `HETZNER_TTL` optional; the page references `https://docs.hetzner.cloud/reference/cloud#dns`
