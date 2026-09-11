# Amazon (AWS)

- **Market share:** 4.5% of all websites (W3Techs, 2026-09-11)
- **Category:** VPS/cloud (EC2, Lightsail) + object storage static hosting (S3) + CDN (CloudFront) + git-deploy platform (Amplify Hosting)
- **File access:** SSH/SFTP (EC2, Lightsail) | S3 API/CLI/rclone (S3 static website, CloudFront origin) | none — git or zip redeploy only (Amplify Hosting)
- **Automatable by the CiteFleet script (rclone):** partly — yes for EC2, Lightsail and S3; no for Amplify Hosting
- **Docs consulted:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connection-prereqs-general.html, https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-ssh-using-terminal.html, https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html, https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html, https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html, https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html, https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html, https://go-acme.github.io/lego/dns/route53/ — fetched 2026-09-11

AWS is not one hosting product. The five files reach the origin by four different
routes, and only three of the four are scriptable.

| Product | Writable filesystem? | Scriptable unattended? |
|---|---|---|
| EC2 instance | Yes — real Linux disk, SSH | Yes (SSH/SFTP/rsync) |
| Lightsail instance | Yes — real Linux disk, SSH | Yes (SSH/SFTP/rsync) |
| S3 static website hosting | No filesystem — object store | Yes (`aws s3` CLI or rclone `s3` backend) |
| CloudFront | N/A — cache in front of an origin | Yes, but needs an invalidation after upload |
| Amplify Hosting | **No** — git/zip deploy only | **No** — must redeploy the whole app |

## Where the web root is

### EC2

A real writable filesystem. The path depends on the AMI and web server the
customer installed, not on AWS:

- Apache (`httpd`) on Amazon Linux 2 / AL2023 — `/var/www/html/`. The AWS
  AL2023 WordPress tutorial copies site files with
  `cp -r wordpress/* /var/www/html/` and configures `<Directory "/var/www/html">`
  in `/etc/httpd/conf/httpd.conf`.
- Apache on Ubuntu/Debian — `/var/www/html/` (distro default; **UNVERIFIED**
  against an AWS-published doc — AWS documents the Amazon Linux path only, and
  explicitly says "Many steps in this tutorial do not work on Ubuntu instances").
- nginx — `/usr/share/nginx/html/` or `/var/www/html/` depending on the distro
  package. **UNVERIFIED** against an AWS doc; AWS does not publish an nginx
  document-root path. The reliable way to find it is on the box:
  `nginx -T | grep -E '^\s*root'` or `apachectl -S`.

### Lightsail

Also a real writable filesystem with SSH. For Bitnami-packaged blueprints the
Bitnami stack layout applies rather than the distro layout. AWS documents the
Bitnami SSH user (`bitnami`) but **does not publish the htdocs path in the
Lightsail user guide** — it points at the Bitnami docs instead ("Read the
Bitnami documentation to learn how to deploy your application… upload files to
the server with SFTP"). Treat `/opt/bitnami/apache/htdocs/` and
`/home/bitnami/htdocs/` as **UNVERIFIED** (searched: Lightsail LAMP/WordPress
quick-start guides, `docs.bitnami.com/aws/faq/get-started/find-usage-credentials/`
which now 404s). Find it on the box with `apachectl -S` or
`grep -r DocumentRoot /opt/bitnami/apache*/conf/`.

Note the Bitnami blueprints are being retired: "Blueprints packaged by Bitnami
will no longer receive updates after May 19, 2026. Starting November 19, 2026,
you will no longer be able to create new instances with this blueprint."
Lightsail-packaged WordPress/LAMP/Nginx/Node.js blueprints use the `admin` user.

### S3 static website hosting

**There is no web root and no filesystem.** The "root of the site" is the root
of the bucket's key namespace. The website is served from a Region-specific
endpoint, `http://<bucket-name>.s3-website.<Region>.amazonaws.com` or
`http://<bucket-name>.s3-website-<Region>.amazonaws.com`. An object at key
`robots.txt` is served at `/robots.txt`; an object at key
`.well-known/botcentral.txt` is served at `/.well-known/botcentral.txt` — S3
treats the `/` purely as a key delimiter, there is no directory to create.

The S3 **website** endpoint does not support HTTPS ("Amazon S3 website endpoints
do not support HTTPS or access points"), so almost every real customer site has
CloudFront (or Amplify) in front of it. That changes the install procedure — see
Gotchas.

### CloudFront

CloudFront has no storage of its own. The five files must be placed at whatever
the origin is (S3 bucket, EC2 instance, ALB). CloudFront's job here is only to
stop serving the stale 404.

### Amplify Hosting

No writable filesystem, and no per-file write path at all. Amplify Hosting
"provides a Git-based workflow for hosting full-stack serverless web
applications with continuous deployment." The only ways content changes are:

1. a git push to a connected GitHub/BitBucket/GitLab/CodeCommit branch, or
2. a **manual deploy** — drag-and-drop a zip, point at a zip in an S3 bucket, or
   give a public URL to a zip.

Both replace the whole deployment ("Atomic deployments … your web app is updated
only after the entire deployment finishes"). The five files must be committed
into the repo (or included in the zip) at the build-output root. For an SSR app
using the Amplify Hosting deployment specification, static assets go in
`.amplify-hosting/static/` and are "accessible at the root (/) of the
application URL without any changes to their content, file name, or extension";
subdirectories are preserved in the URL.

## Steps to install the five files

### EC2 and Lightsail (scriptable)

Default SSH user names, per the AWS-published list:

| AMI / blueprint | User |
|---|---|
| Amazon Linux | `ec2-user` |
| Ubuntu | `ubuntu` |
| Debian | `admin` |
| RHEL | `ec2-user` or `root` |
| CentOS | `centos` or `ec2-user` |
| Fedora | `fedora` or `ec2-user` |
| SUSE | `ec2-user` or `root` |
| Rocky Linux | `rocky` |
| Oracle | `ec2-user` |
| FreeBSD | `ec2-user` |
| Bitnami | `bitnami` |

Lightsail adds: AlmaLinux / Amazon Linux 2 / AL2023 / CentOS Stream 9 / FreeBSD /
openSUSE → `ec2-user`; Lightsail-packaged WordPress, Nginx, WordPress Multisite,
LAMP and Node.js → `admin`; Ruby on Rails → `ec2-user`; Plesk → `ubuntu`;
cPanel & WHM (AlmaLinux) → `ec2-user`; cPanel & WHM (CentOS 7) → `centos`.

```bash
# 1. Connect (EC2 and Lightsail use the same form)
ssh -i /path/key-pair-name.pem ec2-user@<public-dns-or-ip>

# 2. Discover the real document root rather than assuming it
apachectl -S 2>/dev/null | grep -i 'main DocumentRoot'
nginx -T 2>/dev/null | grep -E '^\s*root'

# 3. Push the pack (from the CiteFleet machine)
ROOT=/var/www/html
scp -i key.pem robots.txt sitemap.xml llms.txt <key>.txt ec2-user@<host>:/tmp/
ssh -i key.pem ec2-user@<host> "sudo mkdir -p $ROOT/.well-known && \
  sudo mv /tmp/robots.txt /tmp/sitemap.xml /tmp/llms.txt /tmp/<key>.txt $ROOT/ && \
  sudo chmod 0644 $ROOT/robots.txt $ROOT/sitemap.xml $ROOT/llms.txt $ROOT/<key>.txt"
# then the proof file
scp -i key.pem botcentral.txt ec2-user@<host>:/tmp/
ssh -i key.pem ec2-user@<host> "sudo mv /tmp/botcentral.txt $ROOT/.well-known/ && \
  sudo chmod 0644 $ROOT/.well-known/botcentral.txt"
```

On Amazon Linux the web server runs as `apache`; AWS's own tutorial uses
`sudo chown -R apache /var/www`, `sudo chmod 2775 /var/www` and
`find /var/www -type f -exec sudo chmod 0644 {} \;`. Match whatever the box
already uses rather than forcing 0644 blindly.

### S3 static website hosting (scriptable)

```bash
# robots / llms / indexnow key / botcentral proof -> text/plain
aws s3 cp robots.txt       s3://BUCKET/robots.txt              --content-type "text/plain; charset=utf-8"
aws s3 cp llms.txt         s3://BUCKET/llms.txt                --content-type "text/plain; charset=utf-8"
aws s3 cp <key>.txt        s3://BUCKET/<key>.txt               --content-type "text/plain; charset=utf-8"
aws s3 cp botcentral.txt   s3://BUCKET/.well-known/botcentral.txt --content-type "text/plain; charset=utf-8"
# sitemap -> XML
aws s3 cp sitemap.xml      s3://BUCKET/sitemap.xml             --content-type "application/xml"
```

`--content-type` is documented as: "Specify an explicit content type for this
operation. This value overrides any guessed mime types." Without it the CLI
guesses from the extension ("By default the mime type of a file is guessed when
it is uploaded"). Guessing is usually right for `.txt` and `.xml`, but
`<indexnow-key>.txt` where the key is a 32-hex string and the proof file both go
through the same guesser, so set it explicitly — it costs nothing and removes
the failure mode.

`Content-Type` is **user-controlled** system metadata on an S3 object (the
system-metadata table lists `Content-Type` — "The object type." — with "Can user
modify the value? **Yes**"), and S3 returns it verbatim on GET. That is what
makes the proof file pass: BotCentral rejects an HTML response, and a `.txt`
object stored with `text/plain` is never served as HTML.

Important: user-defined metadata cannot be edited in place — "After you upload
the object, you can't modify this user-defined metadata. The only way to modify
this metadata is to make a copy of the object and set the metadata." If a file
was uploaded with the wrong type, re-upload it (or `aws s3 cp` it onto itself
with `--metadata-directive REPLACE`); don't expect a header patch.

With rclone, the backend type is `s3` and the header is set with the documented
global flag `--header-upload`: "Add an HTTP header for all upload transactions.
The flag can be repeated to add multiple headers."

```bash
rclone copyto ./botcentral.txt remote:BUCKET/.well-known/botcentral.txt \
  --header-upload "Content-Type: text/plain; charset=utf-8"
```

### CloudFront (scriptable, and required if a distribution exists)

```bash
aws cloudfront create-invalidation --distribution-id <DIST_ID> \
  --paths "/robots.txt" "/sitemap.xml" "/llms.txt" "/<key>.txt" "/.well-known/botcentral.txt"
```

Paths are given with a leading `/` (AWS's own example is
`aws cloudfront create-invalidation --distribution-id {{distribution_ID}} --paths "/*"`,
and quoting is required for any path containing `*`). Invalidations cannot be
cancelled once submitted.

### Amplify Hosting (NOT scriptable)

There is no supported way to write one file into a live Amplify app. The
customer must:

1. commit the five files into the repo at the directory that becomes the build
   output root (for most SPA/SSG setups that is `public/`, `static/`, or
   whatever the framework copies verbatim), and push; or
2. rebuild the zip and re-run a manual deploy (drag-and-drop / S3 / URL; the zip
   must contain the *contents* of the build output, not the top-level folder —
   AWS warns you get an "Access Denied" error otherwise, and there is a 5 GB zip
   limit).

If Amplify serves any of the five with the wrong `Content-Type`, fix it with
`customHttp.yml` in the project root (not `amplify.yml` — AWS says "We highly
recommend migrating custom headers specified in this way out of the buildspec
and the `amplify.yml` file"):

```yaml
customHeaders:
  - pattern: '/.well-known/botcentral.txt'
    headers:
      - key: 'Content-Type'
        value: 'text/plain; charset=utf-8'
  - pattern: '/llms.txt'
    headers:
      - key: 'Content-Type'
        value: 'text/plain; charset=utf-8'
```

## The `.well-known/` problem

**EC2 / Lightsail:** no problem. `.well-known` is an ordinary directory on an
ordinary filesystem; `mkdir -p /var/www/html/.well-known` over SSH just works.
The only trap is an Apache or nginx rule that blocks dotfiles — Apache ships
`<FilesMatch "^\.ht">` by default (which does *not* match `.well-known`), but
hardened nginx configs often carry `location ~ /\. { deny all; }`, which **does**
block `/.well-known/botcentral.txt`. Check with
`grep -rn '/\\\.' /etc/nginx/` before declaring success, and confirm by fetching
the URL, not by looking at the file on disk.

**S3:** not a problem either, and this is worth stating precisely because it is
the point most often guessed at. S3 has no directories — `.well-known/` is part
of an object *key*, not a folder. The key naming guidelines list the period (`.`)
among the "generally safe" special characters, and explicitly call out
`folder/.hidden/file.txt` — "Period is part of filename, not standalone" — as a
pattern that "works normally". What S3 warns against is *period-only* path
segments (`./`, `../`, `folder/./file.txt`), which is a different thing:
`.well-known` is a name that begins with a period, not a bare period. So the key
`.well-known/botcentral.txt` is valid and requires no workaround.

One console-only caveat: "Objects with a prefix of `./` must be uploaded or
downloaded with the AWS CLI, AWS SDKs, or REST API. You can't use the Amazon S3
console to upload these objects." That restriction is on `./`, not on
`.well-known/`, so the console can upload the proof file — but the CLI is the
right tool anyway because the console makes setting `Content-Type` fiddly.

**Amplify:** the file must exist in the build output at `.well-known/`. Whether
the framework's build step copies a dot-directory out of `public/` is a property
of the framework, not of Amplify — Vite, Next.js and Hugo all do; some older
`copy-webpack-plugin` configs use globs that skip dotfiles. AWS documents that
static files under `.amplify-hosting/static/` are served at the root "without any
changes to their content, file name, or extension" and that subdirectories are
preserved, but does **not** document dot-directory handling specifically:
**UNVERIFIED** (searched docs.aws.amazon.com/amplify and docs.amplify.aws for
".well-known" and "dotfiles"). Verify by fetching the URL after the deploy.

Because CiteFleet's apex DNS TXT record proves the same thing and BotCentral
scores it higher, the recommended path for Amplify customers is to skip the
proof file entirely and use Route 53 (below).

## Gotchas

- **CloudFront caches the 404.** This is the big one. CloudFront caches HTTP 404
  by default — 404 is in the list of status codes CloudFront caches without
  needing any `Cache-Control` header from the origin — and it caches it for "the
  maximum of … the amount of time specified by the error caching minimum TTL
  (**10 seconds by default**)" or any `Cache-Control max-age`/`s-maxage` the
  origin returned with the error. So: if the distribution is left at defaults, a
  cached 404 for `/.well-known/botcentral.txt` clears itself within ~10 seconds
  and no invalidation is strictly needed. **But** many real distributions raise
  the error caching minimum TTL, or set a custom error page with a cache-behavior
  TTL, or the origin (an app server, not S3) returns
  `Cache-Control: max-age=3600` on its 404 — in all of those cases the stale 404
  persists for that long. Always invalidate; it is one call and the first 1,000
  invalidation paths per month are free ("The first 1,000 invalidation paths that
  you submit per month are free; you pay for each invalidation path over 1,000 in
  a month"), across all distributions in the account. Five paths is nothing.
  Alternatively `--paths "/*"` counts as a single path.
- **Don't confirm from the origin.** After an S3 upload, `aws s3 ls` proves
  nothing about what the world sees. Fetch the public URL through CloudFront.
- **S3 website endpoint returns HTML for errors.** "Error message handling:
  REST API endpoint → Returns an XML-formatted error response; Website endpoint →
  Returns an HTML document." If the object is missing or the bucket policy
  doesn't make it publicly readable, BotCentral will see an HTML body with a
  non-200 status — which is exactly the "HTML response" failure mode. Check the
  status code, not just the body.
- **S3 website endpoints need public read.** "Supports only publicly readable
  content." An upload to a private bucket succeeds and still serves 403 to the
  world.
- **Amplify's atomic deploy is a full replace.** Files not in the build output
  vanish. Anything hand-uploaded out of band is gone on the next push.
- **Bitnami Lightsail blueprints are EOL** (no updates after 2026-05-19, no new
  instances after 2026-11-19). Paths documented for them are a shrinking target.
- **AL2023 default file permissions.** AWS's tutorial sets `/var/www` files to
  `0644` and directories to `2775`; a file dropped as root with a restrictive
  umask returns 403 from Apache even though it is on disk.

## If files cannot be placed

**Amplify Hosting is the only AWS product where the five files may be genuinely
out of reach** (customer has no repo access, or the build pipeline is owned by
someone else). Fall back to the apex DNS TXT record, which BotCentral scores
higher anyway.

AWS runs its own DNS — **Amazon Route 53** — and lego has a first-class plugin:

- Provider code: **`route53`**
- Required: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
  `AWS_HOSTED_ZONE_ID`
- Optional: `AWS_ASSUME_ROLE_ARN`, `AWS_EXTERNAL_ID`, `AWS_PROFILE`,
  `AWS_SDK_LOAD_CONFIG`, `AWS_WAIT_FOR_RECORD_SETS_CHANGED`
- Tuning: `AWS_MAX_RETRIES`, `AWS_POLLING_INTERVAL`, `AWS_PRIVATE_ZONE`,
  `AWS_PROPAGATION_TIMEOUT`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_TTL`
- Any of these may be suffixed `_FILE` to read the value from a file path.

Route 53 supports TXT at the zone apex (the apex restriction is on CNAME, not
TXT: "The DNS protocol does not allow you to create a CNAME record for the top
node of a DNS namespace … You cannot create a CNAME record for example.com").
TXT values are enclosed in double quotation marks; "A single string can include
up to 255 characters"; longer values are split into multiple quoted 255-char
strings on the same line, and "The maximum length of a value in a TXT record is
4,000 characters."

For customers not on Route 53, the fallback for `robots.txt` / `llms.txt` /
sitemap is framework-level: commit them to the repo. There is no admin-panel
robots.txt editor in Amplify.

## Sources

- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connection-prereqs-general.html — the per-AMI default SSH user name list (Amazon Linux `ec2-user`, Ubuntu `ubuntu`, Debian `admin`, Bitnami `bitnami`, Rocky `rocky`, …) and `chmod 400` on the key
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connect-linux-inst-ssh.html — the `ssh -i /path/key-pair-name.pem instance-user-name@instance-public-dns-name` form
- https://docs.aws.amazon.com/linux/al2023/ug/hosting-wordpress-aml-2023.html — `/var/www/html/` as the Apache document root on AL2023; `<Directory "/var/www/html">` in `/etc/httpd/conf/httpd.conf`; the `chown apache` / `chmod 2775` / `0644` permission recipe; and the warning that the steps do not work on Ubuntu
- https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-ssh-using-terminal.html — Lightsail per-blueprint user names (`ec2-user`, `admin`, `ubuntu`, `bitnami`, `centos`) and the ssh command form
- https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-quick-start-guide-lamp-bitnami.html — Bitnami blueprint deprecation dates (no updates after 2026-05-19, no new instances after 2026-11-19); AWS defers the htdocs path to the Bitnami docs rather than publishing it
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteHosting.html — S3 static website hosting overview and its topic list
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteEndpoints.html — the `http://bucket.s3-website.Region.amazonaws.com` endpoint formats; "Amazon S3 website endpoints do not support HTTPS"; website endpoint "Supports only publicly readable content" and "Returns an HTML document" for errors
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-keys.html — safe characters include the period; `folder/.hidden/file.txt` "works normally"; period-*only* segments are the thing to avoid; the `./`-prefix console restriction
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html — `Content-Type` is user-modifiable system metadata; user-defined metadata cannot be changed without copying the object
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/add-object-metadata.html — replacing metadata is a Copy-onto-itself operation
- https://docs.aws.amazon.com/cli/latest/reference/s3/cp.html — `--content-type` "overrides any guessed mime types"; mime type is guessed by default
- https://rclone.org/s3/ — rclone's native backend type is `s3`
- https://rclone.org/docs/ — `--header-upload` "Add an HTTP header for all upload transactions. The flag can be repeated to add multiple headers."
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HTTPStatusCodes.html — 404 is in the set CloudFront caches by default; error caching minimum TTL is 10 seconds by default; origin `Cache-Control max-age`/`s-maxage` extends it
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation_Requests.html — the `aws cloudfront create-invalidation --distribution-id … --paths` form and the quoting rule for `*`; invalidations cannot be cancelled
- https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PayingForInvalidation.html — first 1,000 invalidation paths per month free, account-wide
- https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html — "Git-based workflow … with continuous deployment"; atomic deployments
- https://docs.aws.amazon.com/amplify/latest/userguide/manual-deploys.html — drag-and-drop zip / S3 / public URL as the only non-git routes; 5 GB zip limit; zip the contents not the folder
- https://docs.aws.amazon.com/amplify/latest/userguide/ssr-deployment-specification.html — `.amplify-hosting/static/` files are served at `/` unchanged, with subdirectories preserved
- https://docs.aws.amazon.com/amplify/latest/userguide/custom-headers.html — `customHttp.yml` in the project root is the supported place for custom headers; migrate them out of `amplify.yml`
- https://docs.aws.amazon.com/amplify/latest/userguide/custom-header-YAML-format.html — the `customHeaders: / pattern: / headers: / key: / value:` YAML shape
- https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/ResourceRecordTypes.html — TXT record quoting, 255-char strings, 4,000-char value maximum; the apex restriction applies to CNAME, not TXT
- https://go-acme.github.io/lego/dns/route53/ — lego provider code `route53` and its credential environment variables
