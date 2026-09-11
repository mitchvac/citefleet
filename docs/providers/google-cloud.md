# Google (Google Cloud / Firebase)

- **Market share:** 1.6% of all websites (W3Techs, 2026-09-11)
- **Category:** object storage static hosting (Cloud Storage) + git/CLI-deploy platform (App Engine, Firebase Hosting)
- **File access:** Cloud Storage API/CLI/rclone (GCS static site) | none — `gcloud app deploy` / `firebase deploy` redeploy only (App Engine, Firebase Hosting)
- **Automatable by the CiteFleet script (rclone):** partly — yes for Cloud Storage; no for App Engine or Firebase Hosting
- **Docs consulted:** https://docs.cloud.google.com/storage/docs/hosting-static-website, https://docs.cloud.google.com/storage/docs/objects, https://docs.cloud.google.com/storage/docs/metadata, https://docs.cloud.google.com/appengine/docs/standard/serving-static-files, https://firebase.google.com/docs/hosting/full-config, https://docs.cloud.google.com/cdn/docs/invalidating-cached-content, https://go-acme.github.io/lego/dns/gcloud/ — fetched 2026-09-11

Three very different products. Only one of them lets a script put a file on the
site.

| Product | Writable filesystem? | Scriptable unattended? |
|---|---|---|
| Cloud Storage static website | No filesystem — object store | Yes (`gcloud storage` or rclone `google cloud storage` backend) |
| App Engine (standard) | **No** — static files are baked into the deployed version | **No** — `gcloud app deploy` redeploys the app |
| Firebase Hosting | **No** — atomic release from a local directory | **No** — `firebase deploy` redeploys the site |
| Cloud CDN / external HTTPS LB | N/A — cache in front of an origin | Yes, but needs an invalidation after upload |

Note: Compute Engine VMs are a real VPS with SSH and `/var/www/html/`, and are
trivially scriptable — but they are outside the three products this file covers.

## Where the web root is

### Cloud Storage static website hosting

**No filesystem and no web root.** The site root is the root of the bucket's
object-name namespace. Cloud Storage has no directories at all: in a flat
namespace bucket, "the slash (`/`) character in an object's name" is interpreted
by tools as a delimiter to simulate folders, but the `/` is literally part of the
object name. So `.well-known/botcentral.txt` is one object name, not a file
inside a directory that must first exist.

Serving path matters here. Cloud Storage on its own serves the bucket over HTTP
only: "Cloud Storage doesn't support custom domains with HTTPS on its own, so you
also need to set up an SSL certificate attached to an HTTPS load balancer." In
practice a real customer site is *bucket → external HTTPS load balancer →
(usually) Cloud CDN → the domain's A record*. That changes the install procedure
— see Gotchas.

Objects must also be readable by the world: grant `allUsers` the Storage Object
Viewer role. An upload to a private bucket succeeds and still 403s to a crawler.

### App Engine (standard environment)

No web root the customer can write to. Static assets are uploaded as part of a
deployed *version* and served by App Engine's front end, not by the app:
"Requests to static files or static directories are handled by the App Engine
infrastructure directly, and do not reach the language runtime of the
application." They are declared in `app.yaml`:

```yaml
handlers:
  - url: /favicon\.ico
    static_files: favicon.ico
    upload: favicon\.ico

  - url: /static
    static_dir: public

  - url: /.*
    secure: always
    redirect_http_response_code: 301
    script: auto
```

Handler order is significant: "URL path patterns are tested in the order they
appear in `app.yaml`, therefore the pattern for your static files should be
defined before the `/.*` pattern." And static handlers require an entrypoint:
"To use static handlers, you must either specify the `entrypoint` element in
`app.yaml` or specify a handler with `script` set to `auto`."

### Firebase Hosting

No web root the customer can write to either. Firebase Hosting deploys the
contents of one local directory, named by the `public` key in `firebase.json`
(`"public": "public"` by default), as an atomic release. A file at
`public/robots.txt` is served at `/robots.txt`.

## Steps to install the five files

### Cloud Storage (scriptable)

```bash
# text/plain for the four text files
gcloud storage cp robots.txt     gs://BUCKET/robots.txt              --content-type="text/plain; charset=utf-8"
gcloud storage cp llms.txt       gs://BUCKET/llms.txt                --content-type="text/plain; charset=utf-8"
gcloud storage cp <key>.txt      gs://BUCKET/<key>.txt               --content-type="text/plain; charset=utf-8"
gcloud storage cp botcentral.txt gs://BUCKET/.well-known/botcentral.txt --content-type="text/plain; charset=utf-8"
# XML for the sitemap
gcloud storage cp sitemap.xml    gs://BUCKET/sitemap.xml             --content-type="application/xml"

# make them world-readable (if the bucket is not already public)
gcloud storage buckets add-iam-policy-binding gs://BUCKET \
  --member=allUsers --role=roles/storage.objectViewer
```

`--content-type` is documented as "Type of data contained in the object (e.g.
`text/html`)."

**Setting it explicitly is not optional here.** Cloud Storage's default when
nothing is set is hostile: "if the `Content-Type` is not specified by the
uploader and cannot be determined, it is set to `application/octet-stream` or
`application/x-www-form-urlencoded`, depending on how you uploaded the object."
An `application/octet-stream` response makes a browser download the file rather
than display it, and is not `text/plain`. `gcloud storage` does try to help —
"some tools, such as `gcloud storage`, attempt to automatically set
`Content-Type` at the time of upload based on the extension of the file being
uploaded; however, any explicit value that you set for `Content-Type` overrides
this mechanism" — but the guess is only as good as the extension, and a
raw-API/REST upload gets no guess at all. Set it.

With rclone, the backend is documented at rclone.org/googlecloudstorage/ with
config type `google cloud storage`, and it supports `--header-upload`:

```bash
rclone copyto ./botcentral.txt gcs:BUCKET/.well-known/botcentral.txt \
  --header-upload "Content-Type: text/plain; charset=utf-8"
```

The rclone GCS page states: "You can set custom upload headers with the
`--header-upload` flag. Google Cloud Storage supports the headers as described
in the working with metadata documentation" (`Content-Type` among them), with
the example `--header-upload "Content-Type text/potato"`.

### Cloud CDN / external HTTPS load balancer (scriptable, and required if present)

```bash
gcloud compute url-maps invalidate-cdn-cache URL_MAP_NAME \
    --host example.com \
    --path "/.well-known/botcentral.txt"
# repeat per path, or invalidate the lot:
gcloud compute url-maps invalidate-cdn-cache URL_MAP_NAME --host example.com --path "/*"
```

"By default, the Google Cloud CLI waits until the invalidation has completed";
add `--async` to return immediately.

### App Engine (NOT scriptable)

There is no way to write a single file into a running App Engine version. The
customer must add the files to the source tree, declare them, and redeploy:

1. Put the five files in the directory the static handler serves (e.g.
   `public/`, including `public/.well-known/botcentral.txt`).
2. Add handlers that map them to the site root — a `static_dir` at `/static`
   will *not* put `robots.txt` at `/robots.txt`. Each root-level file needs its
   own `static_files` handler, above the catch-all `/.*`:

```yaml
handlers:
  - url: /robots\.txt
    static_files: public/robots.txt
    upload: public/robots\.txt
    mime_type: text/plain

  - url: /\.well-known/botcentral\.txt
    static_files: public/.well-known/botcentral.txt
    upload: public/\.well-known/botcentral\.txt
    mime_type: text/plain

  - url: /.*
    script: auto
```

3. `gcloud app deploy`.

The `mime_type` element under `handlers` is the documented way to force the
served MIME type when used with `static_files`/`static_dir`, and App Engine
otherwise serves static files with a MIME type derived from the filename
extension. **UNVERIFIED verbatim**: the app.yaml reference page
(`https://docs.cloud.google.com/appengine/docs/standard/reference/app-yaml`)
renders its body client-side and could not be fetched as text — I retrieved only
its navigation shell, on four attempts across the current, `?tab=python`,
legacy-Python and legacy-PHP variants. What *is* directly confirmed from a
fetched page is the handler shape above, from
`docs.cloud.google.com/appengine/docs/standard/serving-static-files`. Confirm the
`mime_type` spelling against the live reference before shipping generated
`app.yaml` fragments.

### Firebase Hosting (NOT scriptable, and it silently drops the proof file)

1. Put the five files in the `public` directory named in `firebase.json`.
2. **Fix the `ignore` array** — see the next section. This is the step everyone
   misses.
3. Optionally pin the `Content-Type` with a `headers` rule:

```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/node_modules/**"],
    "headers": [
      {
        "source": "/.well-known/botcentral.txt",
        "headers": [
          { "key": "Content-Type", "value": "text/plain; charset=utf-8" }
        ]
      }
    ]
  }
}
```

4. `firebase deploy --only hosting`.

## The `.well-known/` problem

### Cloud Storage — fine, with one exact carve-out worth knowing

There is no directory to create; `.well-known/botcentral.txt` is just an object
name. Cloud Storage's naming rules are permissive — "Object names can contain
any sequence of valid Unicode characters" — and the only hard restrictions that
touch a leading dot are:

- "Objects cannot be named `.` or `..`." (`.well-known` is neither.)
- **"Object names cannot start with `.well-known/acme-challenge/`."** This is a
  real, documented, `.well-known`-specific restriction — Google reserves that
  prefix for ACME HTTP-01 challenges. It bans `.well-known/acme-challenge/…`
  only. `.well-known/botcentral.txt` is unaffected.

Google additionally *discourages* (does not forbid) "the character sequences
`./` and `../`. These character sequences create simulated folders" and can
cause objects to be overwritten or fail to download. That warning is about a
path segment that is only a dot — `.well-known/` is a name that begins with a
dot, which is a different thing and is not covered by the warning.

So: yes, an object can be stored at the key `.well-known/botcentral.txt`. No
workaround needed.

### App Engine — fine, but the handler regex must escape the dot

`static_files` paths and `url` patterns are regexes. `/.well-known/...`
unescaped would match `/Xwell-known/...` too. Write `/\.well-known/`. Whether
`gcloud app deploy` uploads a dot-directory from the source tree is
**UNVERIFIED** — App Engine documents `skip_files` but I found no published
statement about dotfile handling on upload (searched docs.cloud.google.com for
"skip_files", ".well-known", "dotfiles"). Verify by fetching the URL after the
deploy, not by looking at the source tree.

### Firebase Hosting — **broken by default. This is the headline finding.**

The `firebase.json` that `firebase init` writes contains:

```json
"hosting": {
  "public": "public",
  "ignore": [
    "firebase.json",
    "**/.*",
    "**/node_modules/**"
  ]
}
```

`**/.*` is documented as the pattern for "files with a leading period should be
hidden from the system", and `ignore` "specifies the files to ignore on deploy"
and "can take globs the same way that Git handles `.gitignore`". `**/.*`
therefore matches `.well-known` and everything under it. **The proof file is
silently not deployed.** `firebase deploy` reports success, the file exists
locally, and `https://example.com/.well-known/botcentral.txt` returns the
hosting 404 page — an HTML body, which is precisely the response BotCentral
rejects.

Firebase's own docs do **not** document a `.well-known` exemption:
**UNVERIFIED** that any such exemption exists (searched firebase.google.com for
".well-known", "dotfiles", "leading period"; the only statement found is the
blanket `**/.*` ignore). Do not assume the CLI special-cases it.

The fix is to narrow the ignore so the dot-directory survives. Either drop
`**/.*` entirely (the safest is to replace it with the specific noise you
actually want excluded):

```json
"ignore": ["firebase.json", "**/node_modules/**", "**/.git/**", "**/.DS_Store"]
```

Because CiteFleet's apex DNS TXT record proves the same thing and BotCentral
scores it higher, the simpler recommendation for a Firebase Hosting customer is
to skip the proof file and use Cloud DNS (below). The other four files have no
leading dot and deploy normally.

## Gotchas

- **Firebase's `**/.*` ignore** — see above. It is the single most likely cause
  of a "the file is definitely there" support ticket on this provider.
- **GCS default Content-Type is `application/octet-stream`.** Not `text/plain`,
  not HTML — a download. Always pass `--content-type`.
- **Cloud Storage alone is HTTP-only for custom domains.** If the customer's
  site is HTTPS on a custom domain, there is a load balancer in the path, and
  probably Cloud CDN. Uploading to the bucket is not the last step.
- **Cloud CDN caches.** Google does not publish a default negative-caching TTL
  for Cloud CDN on the invalidation page I fetched, so whether a stale 404
  persists and for how long is **UNVERIFIED** (searched
  docs.cloud.google.com/cdn for "negative caching", "404"). Treat it as: assume
  it does, and always run `invalidate-cdn-cache` for the five paths after
  upload. The command is cheap and idempotent.
- **App Engine handler order.** A `- url: /.*` catch-all placed above the
  static handlers swallows every request; the docs state patterns "are tested in
  the order they appear."
- **A `static_dir` does not serve at the root.** `static_dir: public` mounted at
  `/static` serves `/static/robots.txt`, not `/robots.txt`. Each of the five
  files needs its own root-level `static_files` handler.
- **App Engine and Firebase deploys are whole-version replacements.** Anything
  added out of band is gone on the next deploy.
- **Verify over HTTP, from outside.** `gcloud storage ls` and a green
  `firebase deploy` both prove nothing about what a crawler sees. Check the
  status code *and* the `Content-Type` header on the public URL.

## If files cannot be placed

For App Engine and Firebase Hosting customers who cannot get a build change
merged, fall back to the apex DNS TXT record — which BotCentral scores higher
anyway.

Google runs its own DNS — **Cloud DNS** — and lego has a first-class plugin:

- Provider code: **`gcloud`**
- Required: `GCE_PROJECT` — "Project name (by default, the project name is
  auto-detected by using the metadata service)"
- Authentication, choose one: Application Default Credentials (per Google's
  authentication documentation); or `GCE_SERVICE_ACCOUNT_FILE` ("Account file
  path"); or `GCE_ACCESS_TOKEN` ("The OAuth2 access token used by the client to
  authenticate against the Google Cloud API"); or
  `GCE_IMPERSONATE_SERVICE_ACCOUNT` ("Service account email to impersonate")
- Tuning: `GCE_ALLOW_PRIVATE_ZONE` (default false), `GCE_POLLING_INTERVAL`
  (default 5s), `GCE_PROPAGATION_TIMEOUT` (default 180s), `GCE_TTL` (default
  120s), `GCE_ZONE_ID`
- Any variable may be suffixed `_FILE` to read the value from a file path.

For CiteFleet's own apex TXT (not an ACME challenge) the same credentials work
through the Cloud DNS API directly. TXT rdata follows RFC 1035: "The `TXT`
record consists of a list of character strings (RFC 1035). In zone file format,
you write this as a sequence of white space separated strings", "Each string can
be quoted or unquoted. If one of your strings contains embedded white space, you
must use the quoted form" — and in the JSON representation the quotes are
escaped, e.g. `"rrdatas": ["\"v=spf1 include:_spf.google.com ~all\""]`.

Whether Cloud DNS permits TXT at the zone apex is **UNVERIFIED** from a direct
quote (the records overview only states that Cloud DNS auto-creates NS and SOA
at the apex and that they "can't be deleted by using the Cloud DNS API"); it
does not say TXT is excluded, and lego's `gcloud` plugin writes
`_acme-challenge.<domain>` records into the same zone. Verify with a `dig TXT
example.com` after writing.

For `robots.txt` / `llms.txt` / sitemap on App Engine or Firebase there is no
admin-panel editor and no plugin — they must go through the repo and a redeploy.

## Sources

- https://docs.cloud.google.com/storage/docs/hosting-static-website — "Cloud Storage doesn't support custom domains with HTTPS on its own, so you also need to set up an SSL certificate attached to an HTTPS load balancer"; grant `allUsers` the Storage Object Viewer role; the upload/specialty-pages/LB/DNS step order
- https://docs.cloud.google.com/storage/docs/objects — "Object names can contain any sequence of valid Unicode characters"; "Object names cannot start with `.well-known/acme-challenge/`"; "Objects cannot be named `.` or `..`"; the discouraged `./` and `../` sequences; the slash as a simulated-folder delimiter in a flat namespace
- https://docs.cloud.google.com/storage/docs/metadata — Content-Type default is `application/octet-stream` (or `application/x-www-form-urlencoded`) when unspecified; `gcloud storage` guesses from the extension and an explicit value overrides the guess
- https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp — `--content-type`: "Type of data contained in the object (e.g. `text/html`)."
- https://rclone.org/googlecloudstorage/ — rclone's GCS backend, config type `google cloud storage`, and `--header-upload` for `Content-Type`
- https://rclone.org/docs/ — `--header-upload` "Add an HTTP header for all upload transactions. The flag can be repeated to add multiple headers."
- https://docs.cloud.google.com/cdn/docs/invalidating-cached-content — `gcloud compute url-maps invalidate-cdn-cache URL_MAP_NAME --host host1.com --path "/images/file.jpg"`; `"/*"` wildcard; "By default, the Google Cloud CLI waits until the invalidation has completed"; `--async`
- https://docs.cloud.google.com/appengine/docs/standard/serving-static-files — the `static_files` / `upload` / `static_dir` handler example; "Requests to static files or static directories are handled by the App Engine infrastructure directly, and do not reach the language runtime of the application"; "URL path patterns are tested in the order they appear in `app.yaml`"; the `entrypoint` / `script: auto` requirement
- https://docs.cloud.google.com/appengine/docs/standard/reference/app-yaml — the canonical `handlers` / `mime_type` reference. Body not retrievable by fetch (client-rendered); `mime_type` wording marked UNVERIFIED above
- https://firebase.google.com/docs/hosting/full-config — the default `"ignore": ["firebase.json", "**/.*", "**/node_modules/**"]`; `**/.*` = "files with a leading period should be hidden from the system"; `ignore` "can take globs the same way that Git handles `.gitignore`"; the `headers` attribute
- https://firebase.google.com/docs/hosting/manage-cache — the `headers` JSON shape: `{"source": "...", "headers": [{"key": "...", "value": "..."}]}`
- https://docs.cloud.google.com/dns/docs/reference/json-record — TXT rdata is a list of RFC 1035 character strings; quoting rules and JSON escaping
- https://docs.cloud.google.com/dns/docs/records — Cloud DNS auto-creates NS and SOA at the zone apex; no statement excluding apex TXT
- https://go-acme.github.io/lego/dns/gcloud/ — lego provider code `gcloud` and its credential environment variables
