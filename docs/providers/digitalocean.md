# DigitalOcean

- **Market share:** 1.5% of all websites (W3Techs, 2026-09-11)
- **Category:** VPS/cloud (Droplets) + object storage with a built-in CDN (Spaces) + git-deploy platform (App Platform)
- **File access:** SSH/SFTP as `root` (Droplets) | S3-compatible API/CLI/rclone (Spaces) | none — git or container redeploy only (App Platform)
- **Automatable by the CiteFleet script (rclone):** partly — yes for Droplets and Spaces; no for App Platform
- **Docs consulted:** https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/, https://docs.digitalocean.com/products/spaces/details/features/, https://docs.digitalocean.com/products/spaces/how-to/set-file-metadata/, https://docs.digitalocean.com/products/spaces/how-to/manage-cdn-cache/, https://docs.digitalocean.com/products/app-platform/details/limits/, https://docs.digitalocean.com/products/app-platform/reference/app-spec/, https://go-acme.github.io/lego/dns/digitalocean/ — fetched 2026-09-11

| Product | Writable filesystem? | Scriptable unattended? |
|---|---|---|
| Droplet | Yes — real Linux disk, SSH as `root` | Yes (SSH/SFTP/rsync) |
| Spaces | No filesystem — S3-compatible object store | Yes (`aws s3 --endpoint-url`, `s3cmd`, rclone `s3` with provider `DigitalOcean`) |
| App Platform (static site or service) | **No** — "Data in the host instance's local filesystem is permanently lost after deployments" | **No** — git/container redeploy |
| Spaces CDN | N/A — cache in front of a Space | Yes, but needs a flush after upload |

## Where the web root is

### Droplet

A real writable filesystem, with the friendliest root access of any provider in
this set: "The default username on initial creation is `root` on most operating
systems, like Ubuntu and CentOS." No sudo dance, no per-distro username table.

The document root depends entirely on which web server the customer (or a 1-Click
image) installed, not on DigitalOcean. DigitalOcean does not publish a canonical
document-root path in its Droplets product docs — **UNVERIFIED** for any specific
path (I fetched `docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/`
and tried `.../how-to/web-servers/`, which 404s). In practice the distro defaults
apply: Apache and nginx on Ubuntu/Debian use `/var/www/html/`, nginx from the
upstream package uses `/usr/share/nginx/html/`. Do not assume — discover it on
the box:

```bash
apachectl -S 2>/dev/null | grep -i 'main DocumentRoot'
nginx -T 2>/dev/null | grep -E '^\s*root'
```

### Spaces

**No filesystem, and — importantly — no static website hosting feature either.**
Spaces "is an S3-compatible service for storing and serving large amounts of
data", built on Ceph: "Ceph is compatible with a large subset of the S3 RESTful
API, so you can use many S3 tools and SDKs with Spaces." But the feature page
does not list static website hosting, index documents, or a website endpoint, and
the Spaces how-to index has no guide for hosting a site (the guides cover bucket
creation, uploads, folders, sharing links, metadata, CDN, access logs,
versioning, bucket policies, lifecycle rules and CORS — nothing about website
hosting). `docs.digitalocean.com/products/spaces/how-to/host-a-static-site/`
returns 404.

So the "site root" of a Space is the root of its object-key namespace, reachable
at `https://<bucket>.<region>.digitaloceanspaces.com/<key>` (endpoint format:
"Use the format `$<your-region>.digitaloceanspaces.com`, where `$<your-region>`
is the DigitalOcean datacenter region, such as `nyc3`") or through the CDN at
`<spacename>.<region>.cdn.digitaloceanspaces.com`. An object at key
`robots.txt` is reachable at `/robots.txt` on those hosts; an object at
`.well-known/botcentral.txt` at `/.well-known/botcentral.txt`.

The catch for CiteFleet is the **apex**. A custom domain on the Spaces CDN is a
subdomain: "For security, any subdomain you use with the Spaces CDN must have an
SSL certificate", and "We automatically create a CNAME record if required and
begin serving content from the custom subdomain." The docs "only discuss
subdomains (like `images.example.com`)" and say nothing about apex support —
**UNVERIFIED** whether an apex domain can be pointed at a Spaces CDN endpoint;
DNS itself forbids a CNAME at the apex, so assume not. That means a bare Space
is usually *not* the thing serving `https://example.com/robots.txt`. Confirm what
the apex actually resolves to before treating Spaces as the target.

### App Platform

No web root the customer can write to. Deployment source is "either a Git
repository or a container image". For a static site the served content is the
build output: "An optional path to where the build assets are located, relative
to the build context. If not set, App Platform automatically scans for these
directory names: `_static`, `dist`, `public`, `build`."

The filesystem is explicitly ephemeral: "Data in the host instance's local
filesystem is permanently lost after deployments and other container
replacements", and "The local filesystem is additionally limited to 4 GiB".
There is nothing to SSH into and nothing to write.

## Steps to install the five files

### Droplet (scriptable)

```bash
# 1. Connect — root by default
ssh root@<droplet-ip>

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

Because the default account *is* root, there is no sudo/ownership dance — but
also no safety net: match the existing owner (`www-data`, `nginx`, `apache`) if
the site's files are owned by the web user.

### Spaces (scriptable)

DigitalOcean documents both `s3cmd` and the AWS CLI against Spaces, and names the
override explicitly: Content-Type "Specifies the file's MIME type so browsers and
other clients can handle the content correctly … Spaces usually detects this
automatically, but you can override it when needed." The documented CLI forms are
`--mime-type=image/jpeg` for s3cmd and `--content-type image/jpeg` for the AWS
CLI.

```bash
EP=https://nyc3.digitaloceanspaces.com   # substitute the Space's region
aws s3 cp robots.txt     s3://BUCKET/robots.txt              --endpoint-url $EP --content-type "text/plain; charset=utf-8" --acl public-read
aws s3 cp llms.txt       s3://BUCKET/llms.txt                --endpoint-url $EP --content-type "text/plain; charset=utf-8" --acl public-read
aws s3 cp '<key>.txt'    "s3://BUCKET/<key>.txt"             --endpoint-url $EP --content-type "text/plain; charset=utf-8" --acl public-read
aws s3 cp botcentral.txt s3://BUCKET/.well-known/botcentral.txt --endpoint-url $EP --content-type "text/plain; charset=utf-8" --acl public-read
aws s3 cp sitemap.xml    s3://BUCKET/sitemap.xml             --endpoint-url $EP --content-type "application/xml" --acl public-read
```

Metadata can also be set via the API by including the headers on the upload
("upload the object and include metadata headers in the request" — standard
`Content-Type` and `Cache-Control`, plus custom `x-amz-meta-` headers), or edited
afterwards in the control panel's **Manage Metadata** editor (bucket → Files tab
→ file → options menu).

rclone reaches Spaces through its **`s3`** backend with provider **`DigitalOcean`**
and a regional endpoint (`nyc3.digitaloceanspaces.com`, `fra1…`, `ams3…`,
`sgp1…`, `lon1…`, `tor1…`, `blr1…`, `sfo2/sfo3…`, `syd1…`). DigitalOcean itself
publishes an rclone guide ("How to Transfer DigitalOcean Spaces Buckets Between
Regions Using rclone"), so rclone is a first-class path here.

```bash
rclone copyto ./botcentral.txt spaces:BUCKET/.well-known/botcentral.txt \
  --header-upload "Content-Type: text/plain; charset=utf-8"
```

### Spaces CDN (scriptable, and required whenever the CDN is on)

```bash
doctl compute cdn flush <cdn-id> --files /robots.txt /sitemap.xml /llms.txt \
  /'<key>.txt' /.well-known/botcentral.txt
# or flush everything:
doctl compute cdn flush <cdn-id> --files "*"
```

The documented form is `doctl compute cdn flush <cdn-id> [flags]`, with the
example `doctl compute cdn flush 418b7972-fc67-41ea-ab4b-6f9477c4f7d8 --files /path/to/assets/*`.
"To purge all files, use a wildcard or omit the flag. For example, `--files "*"`,
or run the command without `--files`." In the control panel: bucket → Settings →
CDN → Edit → **Purge CDN Cache**, then "Select the directories or the entire
bucket to purge the cache for, and then click **Purge Cache in Selected
Directories**"; single files can be purged from the Files tab via the row's menu.

### App Platform (NOT scriptable)

There is no per-file write path and no persistent filesystem. The five files must
be committed into the repo inside the directory that becomes the build output
(`_static`, `dist`, `public`, `build`, or whatever `output_dir` names), and a
deploy must run.

Then check the fallback settings in the app spec, because they decide what a
*missing* file returns:

- `index_document` — "The name of the index document to use when serving this
  static site. Default: index.html"
- `error_document` — "The name of the error document to use when serving this
  static site. Default: 404.html."
- `catchall_document` — "The name of the document to use as the fallback for any
  requests to documents that are not found."
- "Only 1 of `catchall_document` or `error_document` can be set."

Setting `catchall_document` (the usual SPA setup) is what turns a missing
`.well-known/botcentral.txt` into an HTML page instead of a 404 — see Gotchas.

App Platform static sites have **no documented way to set a per-file
`Content-Type` or custom response header**. The app spec's static-site `routes`
and `cors` entries are both marked deprecated, and neither sets response
content types. **UNVERIFIED** that any header override exists (fetched the full
app-spec reference; nothing matching). If App Platform serves `llms.txt` or the
proof file as the wrong type, the remedy is the file extension itself, or moving
the site behind something that can set headers.

## The `.well-known/` problem

### Droplet — an ordinary directory, with the usual nginx caveat

`mkdir -p /var/www/html/.well-known` as root just works. The one thing that
silently breaks it is a hardened nginx config carrying
`location ~ /\. { deny all; }`, which blocks every dot-path including
`/.well-known/botcentral.txt`. Check before declaring success:

```bash
grep -rn '/\\\.' /etc/nginx/
```

and confirm by fetching the public URL, not by `ls`-ing the file.

### Spaces — an ordinary object key

There is no directory to create; `.well-known/botcentral.txt` is one object key.
DigitalOcean does not publish its own object-key naming rules — **UNVERIFIED**
against a DO doc (the Spaces feature and how-to pages cover folders and metadata,
not key character rules). What is documented is that Spaces is S3-compatible via
Ceph's "large subset of the S3 RESTful API", and leading dots in a path segment
are valid in the S3 key model that Ceph implements. In practice `aws s3 cp` and
rclone both write the key without complaint. Verify by fetching the URL.

Note that the control panel presents keys as "folders" (there is a "How to
Organize Files in Folders" guide); a UI that hides dot-prefixed folders would not
change what the API stored or what the CDN serves. Use the CLI.

### App Platform — the file must survive the build, and a catchall hides failure

Whether the build step copies a dot-directory out of the source tree is a
property of the framework (Vite, Hugo, Next.js do; some `copy-webpack-plugin`
globs don't), not of App Platform. DigitalOcean documents no ignore list for the
output directory — **UNVERIFIED** (fetched the app-spec reference and the static
sites how-to; neither mentions dotfiles).

The dangerous part is what happens when it *didn't* survive: with
`catchall_document` set, a request for a file that isn't there is answered with
the catchall document — an HTML page, quite possibly with a 200. BotCentral
rejects an HTML response for the proof file, and a status-code-only check passes.
Prefer `error_document` over `catchall_document` while verifying, or verify the
`Content-Type` and body, not the status.

Because CiteFleet's apex DNS TXT record proves the same thing and BotCentral
scores it higher, the recommended route for an App Platform customer is to skip
the proof file and use DigitalOcean DNS (below).

## Gotchas

- **App Platform static sites are always behind the Spaces CDN, and you cannot
  turn it off.** "App Platform deploys and serves static sites using
  DigitalOcean's Spaces CDN", and "You cannot disable the CDN cache for apps with
  static sites. As a workaround, you can either create a new app for the static
  site or serve the static site from a web service." So a stale response — a
  cached 404, or a cached old `robots.txt` — is a first-class concern on every
  App Platform static site, and there is no per-app off switch. The Spaces CDN's
  edge cache TTL defaults to 1 hour.
- **The Spaces CDN default Edge Cache TTL is 1 hour.** A cached 404 for
  `/.well-known/botcentral.txt` therefore persists for up to an hour after the
  upload unless flushed. Always run `doctl compute cdn flush`.
- **Purging is edge-only.** Browser and proxy caches downstream are unaffected.
- **A Space usually isn't the apex.** Spaces CDN custom domains are subdomains
  behind a CNAME. If `example.com` is what needs the five files, the Space is
  probably not what answers it. Resolve the apex first.
- **Spaces has no index document.** Unlike S3, there is no website-hosting mode
  turning `/` into `index.html`. That does not block the five files (each is
  requested by exact path), but it means a Space is rarely the whole site.
- **Droplet default user is root.** Convenient, and easy to leave a file owned by
  root that the web server can serve but the customer's own deploy user can't
  replace. Match the existing ownership.
- **DigitalOcean publishes no canonical Droplet document root.** Discover it;
  never hardcode.
- **`catchall_document` masks a missing file.** See above.
- **App Platform's filesystem is wiped on every deploy.** "Data in the host
  instance's local filesystem is permanently lost after deployments and other
  container replacements." Anything written out of band does not survive.
- **Verify over HTTP, from outside.** A successful `aws s3 cp` and a green App
  Platform deploy both prove nothing about what a crawler sees. Check the status
  code *and* the `Content-Type`.

## If files cannot be placed

For App Platform customers who cannot get a build change merged — and for any
site where the apex isn't something CiteFleet can write to — fall back to the
apex DNS TXT record, which BotCentral scores higher anyway.

DigitalOcean runs its own DNS, and apex records are explicitly supported: the
**Hostname** field for a TXT record "can be: The **apex of a domain** (`@`)", and
"A TXT record is used to associate a string of text with a hostname. These are
primarily used to verify that you own a domain" — which is exactly this use case.

lego has a first-class plugin, and it is the simplest of the five in this set:

- Provider code: **`digitalocean`**
- Required: **`DO_AUTH_TOKEN`** — a single DigitalOcean API token, nothing else
- Optional: `DO_API_URL` ("The URL of the API"), `DO_HTTP_TIMEOUT` (default 30s),
  `DO_POLLING_INTERVAL` (default 5s), `DO_PROPAGATION_TIMEOUT` (default 60s),
  `DO_TTL` (default 30s)
- Documented usage:
  `DO_AUTH_TOKEN=xxxxxx lego run --dns digitalocean -d '*.example.com' -d example.com`

The same `DO_AUTH_TOKEN` works against the DigitalOcean API for writing
CiteFleet's own apex TXT record directly, and for `doctl compute cdn flush` —
one credential covers DNS and cache invalidation on this provider.

For `robots.txt` / `llms.txt` / sitemap on App Platform there is no admin-panel
editor and no plugin: they must go through the repo and a redeploy.

## Sources

- https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/ — "The default username on initial creation is `root` on most operating systems, like Ubuntu and CentOS"
- https://docs.digitalocean.com/products/spaces/ — Spaces is "an S3-compatible service for storing and serving large amounts of data"; "the built-in Spaces CDN"
- https://docs.digitalocean.com/products/spaces/details/features/ — "Ceph is compatible with a large subset of the S3 RESTful API, so you can use many S3 tools and SDKs with Spaces"; no static website hosting, index document or website endpoint in the feature list
- https://docs.digitalocean.com/products/spaces/how-to/ — the complete how-to index: no guide for hosting a static website from a Space (`.../how-to/host-a-static-site/` returns 404)
- https://docs.digitalocean.com/products/spaces/how-to/use-aws-sdks/ — endpoint format "`$<your-region>.digitaloceanspaces.com`, where `$<your-region>` is the DigitalOcean datacenter region, such as `nyc3`"; bucket creation needs an AWS region such as `us-east-1` in client config
- https://docs.digitalocean.com/products/spaces/how-to/set-file-metadata/ — Content-Type "Specifies the file's MIME type so browsers and other clients can handle the content correctly"; "Spaces usually detects this automatically, but you can override it when needed"; the s3cmd `--mime-type=` and AWS CLI `--content-type` forms; control panel **Manage Metadata**; API headers including `x-amz-meta-`
- https://docs.digitalocean.com/products/spaces/how-to/enable-cdn/ — CDN URL format `<spacename>.<region>.cdn.digitaloceanspaces.com`; Edge Cache TTL "The default of **1 hour**"; "any subdomain you use with the Spaces CDN must have an SSL certificate"; "We automatically create a CNAME record if required"
- https://docs.digitalocean.com/products/spaces/how-to/manage-cdn-cache/ — `doctl compute cdn flush <cdn-id> [flags]`, the `--files /path/to/assets/*` example, `--files "*"` for everything; the control-panel purge path
- https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/ — "Select your deployment source, either a Git repository or a container image"; auto-scanned output directories `_static`, `dist`, `public`, `build`
- https://docs.digitalocean.com/products/app-platform/reference/app-spec/ — `output_dir`, `index_document` (default `index.html`), `error_document` (default `404.html`), `catchall_document`, and "Only 1 of `catchall_document` or `error_document` can be set"; static-site `routes` and `cors` are deprecated; no per-file header/Content-Type option
- https://docs.digitalocean.com/products/app-platform/details/limits/ — "Data in the host instance's local filesystem is permanently lost after deployments and other container replacements"; 4 GiB local filesystem limit; "App Platform deploys and serves static sites using DigitalOcean's Spaces CDN"; "You cannot disable the CDN cache for apps with static sites"
- https://docs.digitalocean.com/products/networking/dns/how-to/manage-records/ — TXT records; the Hostname field "can be: The **apex of a domain** (`@`)"
- https://rclone.org/s3/ — rclone's `s3` backend with provider `DigitalOcean` and the regional Spaces endpoints
- https://rclone.org/docs/ — `--header-upload` for setting `Content-Type` on upload
- https://go-acme.github.io/lego/dns/digitalocean/ — lego provider code `digitalocean`; `DO_AUTH_TOKEN` required; `DO_API_URL`, `DO_HTTP_TIMEOUT`, `DO_POLLING_INTERVAL`, `DO_PROPAGATION_TIMEOUT`, `DO_TTL` optional; the documented `lego run --dns digitalocean` example
