# Installing the origin pack, per hosting provider

One file per provider, covering how a customer gets the five origin files to the
root of their website:

```
robots.txt
sitemap.xml
llms.txt
.well-known/botcentral.txt      (optional — an apex DNS TXT record proves the
                                 same thing and BotCentral scores it 25 vs 23)
<indexnow-key>.txt
```

Top 25 providers by market share (W3Techs, 2026-09-11). Researched from official
documentation only; anything that could not be confirmed from a primary source is
marked **UNVERIFIED** in the file rather than guessed. See [TEMPLATE.md](TEMPLATE.md).

## The four findings that shape the build

**1. The web root cannot be guessed.** Fifteen distinct conventions across 25
providers, and several hosts refuse to name one at all. IONOS has no fixed root —
the customer picks a destination folder per domain, and the absolute path changed
with contract age (2026-07-21). Lolipop!'s root is a folder the customer *invents*;
writing to the FTP root publishes to the wrong domain. Aruba's own FAQ says "/web
or /htdocs, depending on the configuration". one.com is `httpd.www` on old servers
and a hash-named `/webroots/<hex>` on new ones. Any installer must **discover** the
root, never assume it.

**2. Five hosts use a non-standard SFTP port.** Hostinger **65002**, SiteGround
**18765**, HostGator **2222**, WP Engine **2222**, XServer SSH **10022**. A default
of 22 fails on several of the largest shared hosts — the most likely silent failure
in an rclone config.

**3. Caching breaks verification before anything is wrong.** Aruba HiSpeed Cache
**12 hours**, Lolipop! アクセラレータ **~10 minutes**, Sakura コンテンツブースト
**300s**, Gandi Varnish **120s**, DigitalOcean App Platform CDN **1 hour** with no
opt-out. `waitForProof` polls 10 × 30s = 5 minutes, so a correctly installed pack
can fail verification on cache alone.

**4. Several platforms return HTTP 200 for a missing file.** Azure Static Web Apps'
`navigationFallback` serves `/index.html` with a 200; DigitalOcean's
`catchall_document` does the same. A status-code check reports success while
BotCentral rejects the HTML. `proof.ts` already guards this with `looksLikeHtml` —
the audit should too.

## Silent failures worth knowing

- **XServer `AIクローラー遮断設定`** blocks ClaudeBot, GPTBot, PerplexityBot and 18
  others *by User-Agent at the server*. The pack uploads, returns 200 to curl, and
  serves to nobody. CiteFleet probes only as `CiteFleet*` and cannot see this.
- **Firebase Hosting** — `firebase init` writes `"ignore": ["**/.*"]`, which matches
  `.well-known`. The proof file is never deployed and `firebase deploy` reports success.
- **Vercel reserves `/.well-known`** — "cannot be redirected or rewritten". A rewrite
  there deploys cleanly and does nothing.
- **Azure App Service** with `WEBSITE_RUN_FROM_PACKAGE` set mounts wwwroot read-only;
  an FTPS upload silently has no effect.
- **Google Cloud Storage** defaults unset objects to `application/octet-stream` — a
  download, not `text/plain`, which fails BotCentral's plain-text rule.
- **Aruba** makes dot-entries invisible *and undeletable* over FTP — a support ticket
  is required to remove one. Skip `.well-known/` there entirely.
- **WordPress sitemaps are not at `/sitemap.xml`** — core serves `/wp-sitemap.xml`,
  Yoast serves `/sitemap_index.xml`. `originPack.ts` hardcodes the wrong URL for
  roughly 40% of the web.

## Providers by how much of the pack they can serve

| Provider | Share | Achievable | Notes |
|---|---|---|---|
| [hetzner](hetzner.md) | 2.1% | all | root SSH, no CDN — easiest in the set |
| o2switch ([your-online](your-online.md)) | — | all | cPanel, `public_html/`, dotfiles trivial |
| Most VPS / shared hosting | — | all | see each file for root + port |
| [webflow](webflow.md) | 0.8% | **4 of 5** | only SaaS host serving a real `.well-known/` |
| [wp-engine](wp-engine.md) | 1.3% | 4 of 5 | physical robots.txt overwrites the dynamic one |
| [vercel](vercel.md) | 2.1% | 4 of 5 | `vercel.json` rewrites to external URLs; not `.well-known` |
| [shopify](shopify.md) | 5.4% | 2 of 5 | `robots.txt.liquid` + native `llms.txt.liquid` (2026-05-28) |
| [wix](wix.md) | 4.2% | 2 of 5 | best API of any provider; runs IndexNow natively |
| [squarespace](squarespace.md) | 2.4% | **1 of 5** | robots.txt completely closed — no Sitemap: fallback |
| [tilda](tilda.md) | 0.8% | **0 of 5** | cannot serve the pack; DNS TXT only |
| GoDaddy Websites + Marketing | — | 0 of 5 | no file access |
| IONOS MyWebsite | — | 0 of 5 | no file access |

## Dropped from the installer list: no web root

**The rule: a provider is dropped when the customer never gets a writable web
root.** Not "serves fewer files" — *no directory at all*. `flowOptions` filters
these out, so nobody can pick their host from the list, log in, and only then
find out the installer was never going to work there.

They are **kept in the registry, not deleted.** Each carries a `rootless` record
in `provider-flows.ts` holding the provider's own words, what it still serves at
`/`, what the customer does instead, and the product change that would reopen
it. "This platform serves nothing at the root" is a dated fact, not a verdict —
Shopify shipped `templates/llms.txt.liquid` on 2026-05-28.

| Dropped | Share | Still serves | Reopen when |
|---|---|---|---|
| [shopify](shopify.md) | 5.4% | `/robots.txt`, `/llms.txt` via theme templates | a theme template exists for an arbitrary root path, or Files serves at `/` rather than `/cdn/shop/files/` |
| [wix](wix.md) | 4.2% | `/robots.txt`, `/llms.txt` via the TXT File server REST API | the TXT File server accepts a fourth path — the API to drive it already exists, so this is the cheapest to reopen |
| [squarespace](squarespace.md) | 2.4% | `/llms.txt` (7.1 only) | robots.txt becomes per-site editable, or any site-settings API ships (the public APIs are commerce-only) |
| [tilda](tilda.md) | 0.8% | nothing | a root-file upload or any write endpoint appears — the public API is read-only, so there is no automation surface at all |
| [webflow](webflow.md) | 0.8% | `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/.well-known/` | the Assets panel publishes at the root, or the Data API gains a generic root-file endpoint — it already serves `.well-known/`, so one more path makes it installable |

**13.6% of the web** sits behind these five. That is the cost of the rule, and it
is why they are archived rather than forgotten.

**Why Vercel is NOT dropped**, despite `vercel.md` opening "There is no web root
on a disk anyone can reach": its root is `public/` in the connected git repo, and
CiteFleet's existing *Push origin files* already writes there — `vercel.md` calls
`public/.well-known/botcentral.txt` "the only file-based option", and it works.
The reserved-path restriction applies to *rewrites*, not to committed files. Same
reasoning keeps AWS, Google Cloud, Azure and DigitalOcean: each has products with
no root (Amplify, App Engine, Static Web Apps, App Platform) alongside compute
with a real filesystem, and the provider is judged on whether a root is reachable
at all.

Each quote is pinned verbatim to the provider's file by a test in
`provider-flows.test.ts`. **Update a file below because the provider changed its
process, and that test fails** — which is the re-check trigger, not a nuisance.


## DNS automation (lego) coverage

**Covered:** OVH, Hostinger, GoDaddy, IONOS, Route53, Google Cloud, Azure,
DigitalOcean, Hetzner, Vercel, TransIP, Gandi (`gandiv5`), Checkdomain, plus the
generic `cpanel`, `plesk` and `directadmin` providers.

**Not covered — apex TXT is a manual customer step:** SiteGround, all Newfold
brands (Bluehost, HostGator, Network Solutions), Aruba, Combell, Register.it,
Yourhosting.

Note the inversion: on SiteGround the DNS record is manual but files are fully
scriptable; on the SaaS builders files are impossible but DNS is the only route.
No single mechanism covers the market.

## The index

| File | Provider | Share | Category |
|---|---|---|---|
| [shopify](shopify.md) | Shopify | 5.4% | SaaS builder — **dropped: no web root** |
| [hostinger](hostinger.md) | Hostinger | 5.2% | shared hosting |
| [amazon-aws](amazon-aws.md) | Amazon AWS | 4.5% | cloud |
| [wix](wix.md) | Wix | 4.2% | SaaS builder — **dropped: no web root** |
| [ionos](ionos.md) | IONOS / United Internet | 2.5% | shared hosting |
| [godaddy](godaddy.md) | GoDaddy | 2.5% | shared hosting |
| [squarespace](squarespace.md) | Squarespace | 2.4% | SaaS builder — **dropped: no web root** |
| [newfold](newfold.md) | Bluehost, HostGator, Network Solutions | 2.4% | shared hosting |
| [ovh](ovh.md) | OVHcloud | 2.4% | shared / VPS |
| [team-blue](team-blue.md) | Combell, TransIP, Register.it | 2.2% | shared hosting |
| [hetzner](hetzner.md) | Hetzner | 2.1% | cloud / shared |
| [vercel](vercel.md) | Vercel | 2.1% | git-deploy platform |
| [siteground](siteground.md) | SiteGround | 2.0% | shared hosting |
| [google-cloud](google-cloud.md) | Google Cloud, Firebase | 1.6% | cloud |
| [digitalocean](digitalocean.md) | DigitalOcean | 1.5% | cloud |
| [xserver](xserver.md) | XServer | 1.4% | shared hosting (JP) |
| [wp-engine](wp-engine.md) | WP Engine | 1.3% | managed WordPress |
| [gmo-internet](gmo-internet.md) | Lolipop!, ConoHa, Heteml | 1.2% | shared hosting (JP) |
| [aruba](aruba.md) | Aruba S.p.A. | 0.9% | shared hosting (IT) |
| [sakura](sakura.md) | Sakura Internet | 0.9% | shared hosting (JP) |
| [group-one](group-one.md) | one.com, Hostnet, dogado | 0.8% | shared hosting |
| [microsoft-azure](microsoft-azure.md) | Microsoft Azure | 0.8% | cloud |
| [tilda](tilda.md) | Tilda | 0.8% | SaaS builder — **dropped: no web root** |
| [your-online](your-online.md) | o2switch, Gandi, Yourhosting | 0.8% | shared hosting |
| [webflow](webflow.md) | Webflow | 0.8% | SaaS builder — **dropped: no web root** |
