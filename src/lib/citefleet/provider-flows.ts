// Browser-safe. The registry of hosting-provider install flows, one per file in
// `docs/providers/`. This is the list the customer's dropdown renders and the
// list `installer/` executes.
//
// Every entry here is derived from that provider's researched file (919 cited
// official URLs across the 25). What is NOT here is a selector nobody has seen:
// a flow stays `needs-capture` until its steps have been recorded against the
// live panel, because an invented selector is a Rule 17 placeholder that fails
// on a customer's machine rather than in a test.
//
// `share` is W3Techs, 2026-09-11.

import type { ProviderFlow, RootlessRecord } from "./provider-flow.ts";

/** Shorthand for a provider whose shape is known but whose steps are not captured. */
function pending(
  slug: string,
  name: string,
  share: number,
  loginUrl: string,
  blocked: string,
): ProviderFlow {
  return {
    slug,
    name,
    share,
    loginUrl,
    loggedIn: { selector: "", note: "captured with the flow" },
    discoverRoot: [],
    upload: [],
    logout: [],
    status: "needs-capture",
    blocked,
  };
}

/**
 * A provider that gives the customer no writable web root.
 *
 * Dropped from the customer's list — `flowOptions` filters it out — but NEVER
 * deleted from the registry. It keeps its share, its reason, and a `rootless`
 * record holding the provider's own words, what it still serves at `/`, what the
 * customer does instead, and the product change that would reopen it. That last
 * field is the point: Shopify shipped `templates/llms.txt.liquid` on 2026-05-28,
 * so "this platform serves nothing at the root" is a dated fact, not a verdict.
 */
function rootless(
  slug: string,
  name: string,
  share: number,
  blocked: string,
  record: RootlessRecord,
): ProviderFlow {
  return {
    slug,
    name,
    share,
    loginUrl: "",
    loggedIn: { selector: "", note: "not applicable" },
    discoverRoot: [],
    upload: [],
    logout: [],
    status: "no-root",
    blocked,
    rootless: record,
  };
}

export const PROVIDER_FLOWS: readonly ProviderFlow[] = [
  // --- DROPPED: no web root. ------------------------------------------------
  // Every provider below is a SaaS builder whose own documentation states the
  // customer never gets a directory. They are kept here, not deleted, so the
  // research survives and so "why isn't my host in the list?" has an answer.
  // `rootless.evidence` is pinned verbatim to docs/providers/<slug>.md by a
  // test — update the file because the provider changed, and the build tells
  // you to revisit the decision.
  rootless(
    "shopify",
    "Shopify",
    5.4,
    "NO WEB ROOT. The merchant never gets a directory; the only root paths that exist are the " +
      "ones Shopify has defined a theme template for. It serves 2 of 5 that way — robots.txt via " +
      "templates/robots.txt.liquid and llms.txt via templates/llms.txt.liquid (shipped " +
      "2026-05-28) — while sitemap.xml is generated and unmodifiable and .well-known/ and the " +
      "IndexNow key return the storefront 404. Merchant-uploaded files serve from " +
      "/cdn/shop/files/…, never at the root. Theme writes additionally need an app-level " +
      "exemption from Shopify.",
    {
      evidence: "There is no web root. Shopify serves the storefront from its own infrastructure",
      serves: ["/robots.txt", "/llms.txt"],
      fallback:
        "Apex DNS TXT proves ownership without touching the store, and scores 25 to the file's 23.",
      reopenIf:
        "Shopify defines a theme template for an arbitrary root path, or Content → Files gains a " +
        "route that serves at / instead of /cdn/shop/files/. It has moved twice already.",
      checked: "2026-09-11",
    },
  ),
  rootless(
    "wix",
    "Wix",
    4.2,
    "NO WEB ROOT. Wix serves the site from its own infrastructure and states that adding an " +
      "arbitrary .txt file to the top-level domain is not possible. What it does have is the best " +
      "API of any SaaS builder — a TXT File server owning exactly /robots.txt, /llms.txt and " +
      "/ads.txt, each with a REST endpoint — so it serves 2 of 5. Wix runs IndexNow natively, so " +
      "the key file is not needed; sitemap.xml and .well-known/ are closed.",
    {
      evidence: "There is no web root. Wix serves the site from its own infrastructure.",
      serves: ["/robots.txt", "/llms.txt"],
      fallback: "Apex DNS TXT for proof. IndexNow already runs natively, so that half is covered.",
      reopenIf:
        "The TXT File server accepts a fourth path, or any endpoint publishes a file at / — the " +
        "API to drive it already exists, which makes this the cheapest of the five to reopen.",
      checked: "2026-09-11",
    },
  ),
  rootless(
    "squarespace",
    "Squarespace",
    2.4,
    "NO WEB ROOT, and the most closed of the five. robots.txt cannot be edited at all — " +
      "Squarespace's own docs: \"All Squarespace sites use the same robots.txt file and " +
      "Squarespace users can't access or edit the file.\" With no robots.txt there is no Sitemap: " +
      "declaration either, so even the cross-submit fallback is closed. Uploaded assets serve from " +
      "static1.squarespace.com and their URLs cannot be customized. Only llms.txt (7.1 only) works.",
    {
      evidence:
        "There is no web root, and Squarespace is the most closed of the five SaaS builders.",
      serves: ["/llms.txt"],
      fallback: "Apex DNS TXT is the only proof route, and the only thing that works here at all.",
      reopenIf:
        "Squarespace makes robots.txt per-site editable, or ships any site-settings API — its " +
        "public APIs are commerce-only today, so there is nothing to automate against.",
      checked: "2026-09-11",
    },
  ),
  rootless(
    "webflow",
    "Webflow",
    0.8,
    "NO WEB ROOT, but the closest of the five to usable: 4 of 5 through purpose-built slots — " +
      "robots.txt (Site settings → SEO → Indexing), a hand-written sitemap (Auto-generate off), an " +
      "llms.txt upload, and a REAL .well-known/ via an Assets folder literally named well-known " +
      "(Premium). It is the only SaaS host in the set that serves a customer .well-known/. Only the " +
      "IndexNow key fails, because any other root path is not possible. Everything needs a publish " +
      "and none of it appears on *.webflow.io.",
    {
      evidence: "| any other root path | not possible |",
      serves: ["/robots.txt", "/sitemap.xml", "/llms.txt", "/.well-known/"],
      fallback:
        "The four slots by hand through Site settings; the .well-known file proves ownership " +
        "without DNS, which no other SaaS builder here can do.",
      reopenIf:
        "The Assets panel publishes a folder at the root, or the Data API gains a generic " +
        "root-file endpoint. It already serves .well-known/ — one more path and it is installable.",
      checked: "2026-09-11",
    },
  ),
  rootless(
    "tilda",
    "Tilda",
    0.8,
    "NO WEB ROOT and no mechanism of any kind to place a file at one: Tilda generates robots.txt " +
      "and sitemap.xml itself with no editor, has no llms.txt, no .well-known/, no IndexNow, and a " +
      "public API that is read-only — every method is a GET. Its 301 redirects work only within one " +
      "domain, so nothing can be pointed at citefleet.app either. It serves 0 of 5.",
    {
      evidence: "There isn't one, and Tilda is the most closed platform of the five.",
      serves: [],
      fallback:
        "Apex DNS TXT, which is the whole of what is possible on-platform. A customer who needs " +
        "the pack must use code export (Business plan) and host the site themselves.",
      reopenIf:
        "Tilda ships a root-file upload or any write endpoint — its API is read-only today, so " +
        "there is no automation surface at all, not merely a missing path.",
      checked: "2026-09-11",
    },
  ),

  // --- Shared hosting. The script's core market. ---
  pending(
    "hostinger",
    "Hostinger",
    5.2,
    "https://hpanel.hostinger.com/",
    "FIRST TARGET. Web root /home/u<id>/public_html, or /home/u<id>/domains/<domain>/public_html " +
      "for an addon — the u<id> prefix is per-account and must be read, never assumed. hPanel's " +
      "File Manager shows dotfiles by default, so .well-known/ is straightforward. SFTP is " +
      "port 65002 (not 22), needs Web Premium or above, and is off until enabled. Selectors " +
      "not yet captured against the live panel.",
  ),
  pending(
    "godaddy",
    "GoDaddy",
    2.5,
    "https://sso.godaddy.com/",
    "cPanel Linux serves /public_html, Windows/Plesk httpdocs; addon roots are configurable and " +
      "must be read from cPanel's Document Root. File Manager hides dotfiles until Settings → " +
      "Show Hidden Files. Websites + Marketing has no filesystem and cannot host the pack.",
  ),
  pending(
    "newfold",
    "Bluehost / HostGator / Network Solutions",
    2.4,
    "https://www.bluehost.com/my-account/login",
    "Three panels. Bluehost public_html/ with SFTP on 22 after per-account enabling (an " +
      "unverified account hits a wall a script cannot clear). HostGator is stock cPanel on " +
      "port 2222 with SSH key import. Network Solutions never names its panel or root in " +
      "official docs — UNVERIFIED. No lego DNS plugin for any of the three.",
  ),
  pending(
    "siteground",
    "SiteGround",
    2.0,
    "https://login.siteground.com/",
    "Web root /home/customer/www/<domain>/public_html/. SFTP is on every plan but port 18765 " +
      "and KEY-ONLY — no password auth — so a key must exist first. File Manager shows hidden " +
      "files by default. Dynamic Cache is on by default and must be purged after upload.",
  ),
  pending(
    "ionos",
    "IONOS / United Internet",
    2.5,
    "https://login.ionos.com/",
    "NO FIXED WEB ROOT. The customer assigns each domain a destination folder via Domains & SSL " +
      "→ Adjust Destination, and the absolute path changed with contract age: /kunden/homepages/… " +
      "before 2026-07-21, /home/www/ after. Must be resolved live. SFTP port 22 on Linux plans; " +
      "Windows is FTPS-only. MyWebsite has no file access at all.",
  ),
  pending(
    "ovh",
    "OVHcloud",
    2.4,
    "https://www.ovh.com/auth/",
    "Web root is www/ \"in a typical use case\", but the authoritative value is the Multisite " +
      "tab's Root folder column (\"www, app, public_html, etc.\"). SFTP on every plan but OFF " +
      "until ticked per FTP user. No panel file manager at all, so uploads must go over SFTP.",
  ),
  pending(
    "team-blue",
    "Combell / TransIP / Register.it",
    2.2,
    "https://my.combell.com/en/login",
    "Three proprietary panels. Combell and TransIP use www/; Register.it has THREE roots " +
      "(public_html, /public/www, /htdocs/www) depending on account age and OS. Combell's SSH is " +
      "on a different host from FTP and its FTP port is never published. No lego plugin for " +
      "Combell or Register.it.",
  ),
  pending(
    "hetzner",
    "Hetzner",
    2.1,
    "https://accounts.hetzner.com/login",
    "Easiest provider in the set: root SSH on Cloud servers, SFTP/FTPS on every Webhosting plan, " +
      "no CDN to purge, no object metadata. The one gap is that Hetzner publishes NO document " +
      "root anywhere in its Webhosting or konsoleH docs — it must be discovered, not assumed.",
  ),
  pending(
    "your-online",
    "o2switch / Gandi / Yourhosting",
    0.8,
    "https://www.o2switch.fr/",
    "o2switch is cPanel with public_html/ and dotfiles trivial — the cleanest of the three. " +
      "Gandi is SFTP-only (sftp.<dc>.gpaas.net:22), root vhosts/<domain>/htdocs/, no file manager, " +
      "and a default-on 120s Varnish cache. Yourhosting is Plesk /httpdocs with no SSH on shared " +
      "and no published FTP host or port.",
  ),
  pending(
    "group-one",
    "one.com / Hostnet / dogado",
    0.8,
    "https://www.one.com/admin/",
    "Not one brand uses public_html. one.com is httpd.www on old servers and a hash-named " +
      "/webroots/<hex> on new ones; Hostnet is webroot/sites/<domain>; dogado is the domain with " +
      "dots stripped; Alfahosting is /html or /httpdocs. one.com also consumes _acme-challenge " +
      "for its own certificates. Hostnet's proof-of-work interstitial can block non-browser clients.",
  ),
  pending(
    "aruba",
    "Aruba S.p.A.",
    0.9,
    "https://admin.aruba.it/",
    "Aruba refuses to name one root — its FAQ says \"/web or /htdocs, depending on the " +
      "configuration\" — and the FTP login lands ABOVE it. Dot-entries are invisible AND " +
      "UNDELETABLE over FTP (a support ticket is required to remove one), so .well-known/ must " +
      "be skipped here and the apex DNS TXT used instead. HiSpeed Cache holds 12 HOURS.",
  ),

  // --- Cloud and VPS. A filesystem exists; the panel is rarely the right route. ---
  pending(
    "amazon-aws",
    "Amazon AWS",
    4.5,
    "https://console.aws.amazon.com/",
    "EC2 and Lightsail have real filesystems and SSH; S3 static hosting takes objects (the key " +
      ".well-known/botcentral.txt is valid — S3 bans only period-only segments) but Content-Type " +
      "cannot be patched in place, so a wrong type means re-uploading. CloudFront caches 404s " +
      "(10s default min TTL, longer if tuned). Amplify is git-only and cannot take a per-file write.",
  ),
  pending(
    "google-cloud",
    "Google Cloud / Firebase",
    1.6,
    "https://console.cloud.google.com/",
    "Cloud Storage works; App Engine and Firebase Hosting deploy atomically and cannot. GCS " +
      "defaults unset objects to application/octet-stream — a download, not text/plain, which " +
      "fails BotCentral's rule. CRITICAL: firebase init writes \"ignore\": [\"**/.*\"], which " +
      "matches .well-known — the proof file is silently never deployed while deploy reports success.",
  ),
  pending(
    "microsoft-azure",
    "Microsoft Azure",
    0.8,
    "https://portal.azure.com/",
    "Blob static websites ($web container) and App Service (/site/wwwroot over FTPS) both work — " +
      "but App Service with WEBSITE_RUN_FROM_PACKAGE set mounts wwwroot READ-ONLY and an upload " +
      "silently does nothing. Static Web Apps is CI-only, and its navigationFallback returns " +
      "/index.html with HTTP 200 for a missing file, so a status check reports false success.",
  ),
  pending(
    "digitalocean",
    "DigitalOcean",
    1.5,
    "https://cloud.digitalocean.com/login",
    "Droplets are root SSH — the friendliest access in the set. Spaces is S3-compatible but has " +
      "NO static-website-hosting feature, and its CDN custom domains are subdomains behind a " +
      "CNAME, so a Space is usually not what answers the apex. App Platform is git-only, always " +
      "behind the CDN with no opt-out (1h TTL), and its catchall_document masks a missing file.",
  ),

  // --- Japan, managed WordPress, git-deploy. ---
  pending(
    "xserver",
    "XServer",
    1.4,
    "https://secure.xserver.ne.jp/xapanel/login/xserver/",
    "Web root /home/<serverID>/<domain>/public_html/; an FTP session lands two levels above it. " +
      "Use a サブFTPアカウント scoped to public_html — the main FTP password is the same string as " +
      "the control-panel login. CRITICAL: AIクローラー遮断設定 blocks ClaudeBot, GPTBot, " +
      "PerplexityBot and 18 others BY USER-AGENT at the server, so the pack can serve 200 to curl " +
      "and nothing to the crawlers it was installed for. Verify with a crawler UA.",
  ),
  pending(
    "gmo-internet",
    "Lolipop! / ConoHa / Heteml",
    1.2,
    "https://user.lolipop.jp/",
    "Lolipop!'s root is a 公開フォルダ the CUSTOMER NAMES — a script cannot guess it, and writing " +
      "to the FTP root publishes to the wrong (initial) domain. ConoHa WING is public_html/<domain>/; " +
      "Heteml is /web/. Lolipop!アクセラレータ caches ~10 minutes, long enough to fail a " +
      "verification run on its own, and Lolipop treats filename case as distinct.",
  ),
  pending(
    "sakura",
    "Sakura Internet",
    0.9,
    "https://secure.sakura.ad.jp/rscontrol/",
    "/home/<account>/www/ is the INITIAL domain only and cannot be moved; a real customer domain " +
      "is www/<Web公開フォルダー>/, set per-domain in マルチドメイン settings. SSH/SFTP port 22 on " +
      "スタンダード and above, FTPS on ライト. コンテンツブースト caches at s-maxage 300 with a " +
      "documented delay of up to 300s before a correction appears.",
  ),
  pending(
    "wp-engine",
    "WP Engine",
    1.3,
    "https://my.wpengine.com/",
    "SFTP root IS the WordPress document root (/sites/<environment>/), host " +
      "<environment>.sftp.wpengine.com, port 2222 ONLY, SFTP-only. A physical robots.txt " +
      "OVERWRITES the dynamic one — confirmed in WP Engine's docs — but /sitemap.xml is usually " +
      "the WRONG URL on WordPress (core serves /wp-sitemap.xml, Yoast /sitemap_index.xml), so do " +
      "not upload a static sitemap; point the Sitemap: line at the real one. Cache purge required.",
  ),
  pending(
    "vercel",
    "Vercel",
    2.1,
    "https://vercel.com/login",
    "No writable filesystem at runtime — static files live in public/ in the connected repo, which " +
      "CiteFleet's existing Push origin files already does. vercel.json rewrites DO accept external " +
      "absolute URLs, so four files can point at citefleet.app with no commit — but /.well-known is " +
      "RESERVED and cannot be redirected or rewritten, so a rewrite there deploys cleanly and does " +
      "nothing. Apex DNS TXT is the proof route.",
  ),
];
