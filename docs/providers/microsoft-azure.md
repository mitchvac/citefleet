# Microsoft (Azure)

- **Market share:** 0.8% of all websites (W3Techs, 2026-09-11)
- **Category:** object storage static hosting (Blob `$web`) + PaaS with a real filesystem (App Service) + git-deploy platform (Static Web Apps)
- **File access:** FTPS / Kudu (App Service) | Blob API/CLI/rclone (Blob static website) | none — GitHub Actions or Azure Pipelines redeploy only (Static Web Apps)
- **Automatable by the CiteFleet script (rclone):** partly — yes for Blob static websites and App Service; no for Static Web Apps
- **Docs consulted:** https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website, https://learn.microsoft.com/en-us/rest/api/storageservices/naming-and-referencing-containers--blobs--and-metadata, https://learn.microsoft.com/en-us/azure/app-service/deploy-ftp, https://learn.microsoft.com/en-us/azure/static-web-apps/configuration, https://learn.microsoft.com/en-us/azure/cdn/cdn-purge-endpoint, https://go-acme.github.io/lego/dns/azuredns/ — fetched 2026-09-11

Three products with three completely different answers. Note that App Service is
the exception to the usual "managed platform = no filesystem" rule: it has a real
writable `wwwroot` reachable over FTPS.

| Product | Writable filesystem? | Scriptable unattended? |
|---|---|---|
| Blob Storage static website (`$web`) | No filesystem — object store | Yes (`az storage blob upload` or rclone `azureblob`) |
| App Service (Windows or Linux) | **Yes** — `/home/site/wwwroot`, over FTPS | Yes (FTPS), **unless** `WEBSITE_RUN_FROM_PACKAGE` is set |
| Static Web Apps | **No** — atomic deploy from a CI workflow | **No** |
| Azure CDN / Front Door | N/A — cache in front of an origin | Yes, but needs a purge after upload |

Azure VMs are a real VPS with SSH and the usual `/var/www/html/`, and are
trivially scriptable — but they are outside the three products this file covers.

## Where the web root is

### Blob Storage static website

**No filesystem.** Content lives in one specially named container: "A blob
storage container named **$web** is created for you within the storage account if
it doesn't already exist. Add your website's files to the **$web** container to
make them accessible through the static website's primary endpoint." That
container name — `$web`, with a literal dollar sign — is the single most
important fact about this product, and needs shell quoting everywhere.

The site root is the root of `$web`'s blob-name namespace. A blob named
`robots.txt` in `$web` serves at `/robots.txt`; a blob named
`.well-known/botcentral.txt` serves at `/.well-known/botcentral.txt`. Blob
Storage is flat: "By default, the Blob service is based on a flat storage scheme,
not a hierarchical scheme. However, you may specify a character or string
delimiter within a blob name to create a virtual hierarchy." No directory needs
to exist first.

The primary endpoint looks like
`https://<account>.z22.web.core.windows.net`. For a custom domain over HTTPS you
need a CDN: "To enable HTTPS, you'll have to use Azure CDN because Azure Storage
doesn't yet natively support HTTPS with custom domains."

### App Service

A real writable web root, and this is the one Azure product where a file can be
pushed into a running site without redeploying it. The deployment directory is
`/site/wwwroot` (absolute: `/home/site/wwwroot` on Linux, `D:\home\site\wwwroot`
on Windows). Microsoft's FTPS instructions say plainly: "Copy your files and
their directory structure to the `/site/wwwroot` directory in Azure."

### Static Web Apps

No web root the customer can write to. The site is built and deployed by a CI
workflow (GitHub Actions or Azure Pipelines); the served content is whatever ends
up in `output_location` — "If your web app runs a build step, the output location
is the folder where the public files are generated." Behaviour is configured by
`staticwebapp.config.json`, which must be at "the root of the output_location".

## Steps to install the five files

### Blob Storage static website (scriptable)

```bash
# NOTE the quoting on '$web' — an unquoted $web expands to an empty string in bash
az storage blob upload --account-name ACCOUNT --container-name '$web' \
  --name robots.txt --file robots.txt --content-type "text/plain; charset=utf-8" --overwrite
az storage blob upload --account-name ACCOUNT --container-name '$web' \
  --name llms.txt --file llms.txt --content-type "text/plain; charset=utf-8" --overwrite
az storage blob upload --account-name ACCOUNT --container-name '$web' \
  --name '<key>.txt' --file '<key>.txt' --content-type "text/plain; charset=utf-8" --overwrite
az storage blob upload --account-name ACCOUNT --container-name '$web' \
  --name '.well-known/botcentral.txt' --file botcentral.txt \
  --content-type "text/plain; charset=utf-8" --overwrite
az storage blob upload --account-name ACCOUNT --container-name '$web' \
  --name sitemap.xml --file sitemap.xml --content-type "application/xml" --overwrite
```

`az storage blob upload` takes `--content-type` (it is in the documented
parameter list alongside `--file`, `--container-name`, `--name` and
`--overwrite`), and so does `az storage blob upload-batch`.

**Setting `--content-type` is mandatory here, for a reason specific to this
product.** Blob static website hosting has no header layer of its own: "There's
no way to configure headers as part of the static website feature itself" — and
again, "If you want to configure headers, you'll have to use Azure Content
Delivery Network (Azure CDN)." The `Content-Type` response header comes from the
blob's own `Content-Type` property, set at upload. Get it wrong and the only
remedy is re-uploading the blob or bolting a CDN rules-engine rule on top.

With rclone the backend config type is **`azureblob`**, and it documents exactly
which headers `--header-upload` supports: "You can set custom upload headers with
the `--header-upload` flag. Cache-Control, Content-Disposition, Content-Encoding,
Content-Language, Content-Type, X-MS-Tags. Eg
`--header-upload "Content-Type: text/potato"`". `Content-Type` is also listed as
user-settable system metadata on the backend.

```bash
rclone copyto ./botcentral.txt 'azure:$web/.well-known/botcentral.txt' \
  --header-upload "Content-Type: text/plain; charset=utf-8"
```

### App Service (scriptable over FTPS)

```bash
# 1. Get the FTPS endpoint
az webapp deployment list-publishing-profiles --name <app-name> \
  --resource-group <rg> \
  --query "[?ends_with(profileName, 'FTP')].{profileName: profileName, publishUrl: publishUrl}"
# If two endpoints come back, take the read-write one, NOT the one whose name
# contains 'dr' / 'ReadOnly'.

# 2. Upload into /site/wwwroot (lftp shown; any FTPS client works)
lftp -u '<app-name>\$<app-name>,<password>' -e "
  set ftp:ssl-force true;
  mkdir -p /site/wwwroot/.well-known;
  put robots.txt   -o /site/wwwroot/robots.txt;
  put sitemap.xml  -o /site/wwwroot/sitemap.xml;
  put llms.txt     -o /site/wwwroot/llms.txt;
  put <key>.txt    -o /site/wwwroot/<key>.txt;
  put botcentral.txt -o /site/wwwroot/.well-known/botcentral.txt;
  bye" ftps://<host>
```

Credential format matters and is easy to get wrong: "For application-scope
credentials, the FTP/S username format is `<app-name>\$<app-name>`. For
user-scope credentials, the FTP/S username format is `<app-name>\<username>`."
The `\$` is literal, not a shell escape. Both **SCM Basic Auth Publishing
Credentials** and **FTP Basic Auth Publishing Credentials** must be enabled:
"When basic authentication is disabled, FTP/S deployment doesn't work."

Ports to open outbound: "FTP/S control connection ports: `21`, `990`" and "FTP/S
data connection ports: `989`, `10001-10300`". Prefer passive mode — "Passive mode
is preferred because deployment machines are usually behind a firewall."

### Azure CDN (scriptable, and required if a CDN fronts the origin)

```bash
az cdn endpoint purge --resource-group RG --profile-name profile1 \
  --endpoint-name endpoint1 \
  --content-paths "[/robots.txt,/sitemap.xml,/llms.txt,/<key>.txt,/.well-known/botcentral.txt]"
```

`--content-paths` is "The path to the content to be purged. Can describe a file
path or a wild card directory." The portal documents three accepted forms:
single-URL purge (`/pictures/strasbourg.png`), wildcard purge (`/*` or
`/pictures/*`), and root-domain purge (`/`). Paths "must be a relative URL that
fits … RFC 3986".

Note the retirement: "Azure CDN Standard from Microsoft (classic) retires on
**September 30, 2027**. Because the service is retiring, it no longer supports
profile creation, new domain onboarding, or managed certificates." New sites are
on Azure Front Door, whose purge command differs — **UNVERIFIED**, not fetched
for this doc.

### Static Web Apps (NOT scriptable)

There is no per-file write path. The five files must be in the folder that
becomes `output_location` (or `app_location` with `skip_app_build: true`), and a
workflow run must deploy them. Then pin the MIME types in
`staticwebapp.config.json` — SWA has a first-class `mimeTypes` map:

```json
{
  "mimeTypes": {
    ".txt": "text/plain",
    ".xml": "application/xml"
  },
  "routes": [
    {
      "route": "/.well-known/botcentral.txt",
      "headers": { "content-type": "text/plain; charset=utf-8" }
    }
  ],
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/robots.txt", "/sitemap.xml", "/llms.txt", "/*.txt", "/.well-known/*"]
  }
}
```

The `exclude` list in `navigationFallback` is not optional decoration here — see
Gotchas. `staticwebapp.config.json` has a 20 KB maximum file size.

## The `.well-known/` problem

### Blob Storage — allowed, with one naming rule to check

Azure's blob naming rules are maximally permissive on the character itself: "A
blob name can contain any combination of characters." The only dot-related
restriction is about the *end* of a name or segment:

> "Avoid blob names that end with a dot (.), a forward slash (/), a backslash
> (\\), or a sequence or combination of the two. No path segments should end with
> a dot (.)."

`.well-known/botcentral.txt` has segments `.well-known` and `botcentral.txt` —
neither ends with a dot or a slash. It is a valid blob name and needs no
workaround. There is no directory to create.

Two adjacent traps that *will* bite:

- **Blob names are case-sensitive** ("Blob names are case-sensitive", and for
  the static website specifically: "Files in the **$web** container are
  case-sensitive"). Microsoft's own FAQ lists this as the top cause of a
  static-website 404: "A 404 error can happen if you refer to a file name by
  using an incorrect case. For example: `Index.html` instead of `index.html`.
  File names and extensions in the url of a static website are case-sensitive
  even though they're served over HTTP." Upload `.well-known`, never
  `.Well-Known`.
- **Path segment limit**: without hierarchical namespace, "the number of path
  segments comprising the blob name cannot exceed 254"; with hierarchical
  namespace enabled, "cannot exceed 63 (including path segments for account name
  and container name)". Two segments is nowhere near either.

### App Service — fine, it is a real directory

`mkdir /site/wwwroot/.well-known` over FTPS just works. On a Windows App Service
running IIS, confirm the request actually reaches the file: IIS's
`requestFiltering` `hiddenSegments` and `fileExtensions` rules can block
dot-prefixed paths, and some `web.config` templates add `<add segment=".well-known" />`
to `hiddenSegments` or omit a `staticContent` mapping for extensionless/unknown
types. Whether the App Service default `web.config` blocks `.well-known` is
**UNVERIFIED** — Microsoft's FTPS deployment doc says nothing about it, and I did
not find a published statement either way (WebFetch on
`learn.microsoft.com/en-us/azure/app-service/deploy-ftp` and
`.../deploy-run-package`; web search budget for this session was exhausted before
I could sweep further). Verify by fetching the URL after upload. ACME HTTP-01
validation on App Service works, which is evidence `.well-known/` is reachable in
the default configuration, but that is inference, not a citation.

If IIS does block it, the documented MIME fix is a `web.config` in
`/site/wwwroot/.well-known/` with a `<staticContent>` `mimeMap` — also
**UNVERIFIED** against an Azure doc.

### Static Web Apps — two separate hazards

1. **Does the deploy upload a dot-directory?** The SWA build-configuration and
   configuration docs describe `app_location` / `output_location` / `skip_app_build`
   and never mention ignoring dotfiles. Whether `Azure/static-web-apps-deploy@v1`
   uploads `.well-known/` from the output folder is therefore **UNVERIFIED**
   (fetched `azure/static-web-apps/configuration` and
   `azure/static-web-apps/build-configuration` in full; neither documents an
   ignore list). Verify by fetching the URL after a deploy.
2. **`navigationFallback` turns a missing file into a 200 HTML page.** This is
   the trap. Microsoft's own table for the default fallback rule ends with:
   "Any other path outside the */images* or */css* folders that doesn't match the
   path to a deployed file. → The */index.html* file is served with a `200`
   status code." So if `.well-known/botcentral.txt` did not deploy, the URL does
   not 404 — it returns **HTTP 200 with the SPA's HTML**. BotCentral rejects an
   HTML response for the proof file, and a naive "is it 200?" check passes.
   Always check the `Content-Type` and the first bytes of the body, not the
   status code.

   Fix: list the five paths in `navigationFallback.exclude` so a genuinely
   missing file returns a real 404 and the problem is visible.

Because CiteFleet's apex DNS TXT record proves the same thing and BotCentral
scores it higher, the recommended route for a Static Web Apps customer is to skip
the proof file and use Azure DNS (below).

## Gotchas

- **`$web` needs quoting.** In bash, `--container-name $web` silently becomes
  `--container-name` with an empty value. Always `'$web'`.
- **`WEBSITE_RUN_FROM_PACKAGE` makes App Service `wwwroot` read-only.** If this
  app setting is present (value `1` or a URL), "the ZIP package itself gets
  mounted directly as the read-only *wwwroot* directory", and: "Running directly
  from a package makes `wwwroot` read-only. Your app will receive an error if it
  tries to write files to this directory." An FTPS upload into `/site/wwwroot`
  will not take effect. Check the app setting first
  (`az webapp config appsettings list`), and if it is set, the five files must go
  into the ZIP and be redeployed — App Service becomes non-scriptable in exactly
  the way Static Web Apps is. Java apps on App Service are never run-from-package
  ("Built-in Java runtimes … require write access to the app directory at
  startup"), so they always have a writable wwwroot.
- **Static Web Apps' `navigationFallback` masks a missing file as 200 + HTML.**
  See above. The single nastiest failure mode on this provider.
- **Blob static websites can't set headers.** No header layer at all without a
  CDN; `Content-Type` must be right at upload time.
- **Case sensitivity on `$web`.** Microsoft's FAQ names it as the leading cause
  of unexpected 404s.
- **CORS is not supported on the static website endpoint**: "Cross-Origin
  Resource Sharing (CORS) support for Azure Storage is not supported with static
  website."
- **The `$web` container's anonymous-access level is a red herring.** "You can
  modify the anonymous access level of the **$web** container, but making this
  modification has no impact on the primary static website endpoint because these
  files are served through anonymous access requests." Changing it affects only
  the `blob.core.windows.net/$web/...` endpoint.
- **A private endpoint hides the static website.** "Enabling a private endpoint
  for blobs in a storage account restricts access to that storage account to only
  resources within the same virtual network … The static website needs a
  dedicated private end point for the $web domain."
- **New CDN endpoints can wait up to 90 minutes.** "This can also happen if your
  Azure CDN endpoint isn't yet provisioned. Wait up to 90 minutes after you
  provision a new Azure CDN for the propagation to complete."
- **Purging is edge-only.** "purging only clears the cached content on the
  content delivery network edge servers. Any downstream caches, such as proxy
  servers and local browser caches, might still hold a cached copy."
- **FTPS deploys run no build.** "FTP/S deployment doesn't support build
  automation" — fine for five static files, but it also means nothing regenerates
  a `web.config` for you.
- **App Service deploys can hit locked files.** "The deployment can fail because
  of locked files." Five small text files rarely trigger it, but a failure here
  is silent from the caller's side.

## If files cannot be placed

For Static Web Apps customers — and for App Service apps pinned to
`WEBSITE_RUN_FROM_PACKAGE` — fall back to the apex DNS TXT record, which
BotCentral scores higher anyway.

Azure runs its own DNS — **Azure DNS** — and lego has a first-class plugin:

- Provider code: **`azuredns`**
- Client-secret auth: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`
- Client-certificate auth: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
  `AZURE_CLIENT_CERTIFICATE_PATH`
- Zone targeting: `AZURE_SUBSCRIPTION_ID` ("DNS zone subscription ID"),
  `AZURE_RESOURCE_GROUP` ("DNS zone resource group"), `AZURE_ZONE_NAME` ("Zone
  name to use inside Azure DNS service")
- `AZURE_AUTH_METHOD` selects among: **env, wli, msi, cli, oidc, pipeline** — so
  a CiteFleet worker running on an Azure VM or in a pipeline can use a managed
  identity instead of a stored secret
- Tuning: `AZURE_AUTH_MSI_TIMEOUT`, `AZURE_ENVIRONMENT` ("Azure environment, one
  of: public, usgovernment, and china"), `AZURE_POLLING_INTERVAL` (default 2s),
  `AZURE_PRIVATE_ZONE`, `AZURE_PROPAGATION_TIMEOUT` (default 120s),
  `AZURE_SERVICEDISCOVERY_FILTER`, `AZURE_TTL` (default 60s)

Whether Azure DNS permits a TXT record at the zone apex is **UNVERIFIED** from a
direct quote in this pass (I did not fetch an Azure DNS record-types page; the
session's web-search budget was exhausted). It is what lego's `azuredns` plugin
writes challenges into, and CiteFleet's own TXT is a plain apex record — verify
with `dig TXT example.com` after writing.

The other four files on Static Web Apps have no fallback other than the repo:
there is no admin-panel robots.txt editor and no plugin mechanism.

## Sources

- https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website — the `$web` container; "Add your website's files to the **$web** container"; "Files in the **$web** container are case-sensitive"; "There's no way to configure headers as part of the static website feature itself"; HTTPS with a custom domain requires Azure CDN; the case-sensitivity 404 FAQ; the 90-minute CDN provisioning note; CORS unsupported; the anonymous-access-level and private-endpoint notes
- https://learn.microsoft.com/en-us/rest/api/storageservices/naming-and-referencing-containers--blobs--and-metadata — "A blob name can contain any combination of characters"; "Blob names are case-sensitive"; "Avoid blob names that end with a dot (.), a forward slash (/), a backslash (\\)… No path segments should end with a dot (.)"; the 254 / 63 path-segment limits; the flat-namespace-with-delimiter model
- https://learn.microsoft.com/en-us/cli/azure/storage/blob — `az storage blob upload` and `az storage blob upload-batch` parameter lists, both including `--content-type`
- https://rclone.org/azureblob/ — rclone config type `azureblob`; `--header-upload` supports `Content-Type` (with the `--header-upload "Content-Type: text/potato"` example)
- https://learn.microsoft.com/en-us/azure/app-service/deploy-ftp — "Copy your files and their directory structure to the `/site/wwwroot` directory"; the `<app-name>\$<app-name>` credential format; basic-auth requirement; FTP/S ports 21, 990, 989, 10001-10300; passive mode preferred; "FTP/S deployment doesn't support build automation"; locked-file failures
- https://learn.microsoft.com/en-us/azure/app-service/deploy-run-package — `WEBSITE_RUN_FROM_PACKAGE`=1 mounts the ZIP "as the read-only *wwwroot* directory"; "Running directly from a package makes `wwwroot` read-only"; Java runtimes are excluded; `/home/site/wwwroot` vs `D:\home\site\wwwroot`
- https://learn.microsoft.com/en-us/azure/static-web-apps/configuration — `staticwebapp.config.json` controls routing, global headers and "Custom MIME types"; the `mimeTypes` map; per-route `headers`; the `navigationFallback` table ending "The */index.html* file is served with a `200` status code"; `staticwebapp.config.json` must be at the root of `output_location`; 20 KB max file size
- https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration — `app_location` / `api_location` / `output_location` / `skip_app_build` semantics; the GitHub Actions and Azure Pipelines workflow shapes; no documented dotfile ignore list
- https://learn.microsoft.com/en-us/azure/cdn/cdn-purge-endpoint — the three purge path forms (single URL, wildcard `/*`, root `/`); paths must be RFC 3986 relative URLs; purging clears edge caches only; Azure CDN Standard from Microsoft (classic) retires 2027-09-30
- https://learn.microsoft.com/en-us/cli/azure/cdn/endpoint — `az cdn endpoint purge --content-paths …` syntax and the `--content-paths "[/folder1]"` example
- https://go-acme.github.io/lego/dns/azuredns/ — lego provider code `azuredns`, its credential environment variables, and the env/wli/msi/cli/oidc/pipeline auth methods
