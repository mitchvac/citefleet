# OVHcloud

- **Market share:** 2.4% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting (Web Hosting plans) — plus VPS/cloud and dedicated, where the customer may add Plesk
- **File access:** SFTP (must be enabled), FTP, SSH (Professional plan and above). No web-based file manager.
- **Automatable by the CiteFleet script (rclone):** yes — once SFTP is ticked for the FTP user
- **Docs consulted:** https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/landing-page-ftp-ssh, https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/ftp-connection, https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/enable-sftp, https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/ssh-on-webhosting, https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/hosting-how-to-get-my-website-online, https://docs.ovhcloud.com/en/guides/web-cloud/domains/dns-zone-txt-record-creation, https://go-acme.github.io/lego/dns/ovh/ — fetched 2026-09-11

## Where the web root is

`www/` — relative to the FTP/SFTP login root. OVH's own publishing guide states: "In a typical use case, the website is located in the `www` folder."

It is not guaranteed. OVH Web Hosting plans are multisite: every domain attached to the plan is mapped to a **Root folder** on the same storage space. The authoritative answer for a given domain is in the OVHcloud Control Panel under **Web Cloud → Hosting plans → `<your plan>` → Multisite**, in the `Root folder` column of the table. OVH documents the field as "the directory on your hosting plan (www, app, public_html, etc.) to which the domain points" — so `public_html` and bare-name folders such as `blog` do occur on real accounts. Read the Multisite table before uploading; do not assume `www`.

The five files go at the top of that folder, e.g. `www/robots.txt`, `www/llms.txt`, `www/.well-known/botcentral.txt`.

## Steps to install the five files

1. **Enable SFTP** (it is off by default). OVHcloud Control Panel → **Web Cloud** → **Hosting plans** → your plan → **FTP - SSH** tab. On entry-level plans (Free, Starter, Personal, Startup) tick the box in the **SFTP** column for the FTP user. On Professional, Performance, Agency, Agency Plus and Agency Max, use the `...` menu on the user → **Edit** → under connection protocols choose **FTP and SFTP** (or **FTP, SFTP and SSH**).
2. **Find the web root.** Same plan → **Multisite** tab → read the `Root folder` value for the domain you are publishing.
3. **Find the server name.** Also on the **FTP - SSH** tab. The host follows the pattern `ftp.clusterXXX.hosting.ovh.net`, where `XXX` is the number of the cluster your plan sits on. The SSH host is `ssh.clusterXXX.hosting.ovh.net`.
4. **Connect.** Port **22** for SFTP, port **21** for plain FTP. The username is the FTP login shown in the panel ("Main login" is the primary FTP user created with the plan).
5. **Upload** the five files into the root folder from step 2, creating `.well-known/` as a subdirectory. rclone's `sftp` backend handles this unattended:
   `rclone copy ./pack ovh:www/ --sftp-host ftp.clusterXXX.hosting.ovh.net --sftp-port 22`
6. **SSH alternative** (Professional plan and up only): `ssh <ftpuser>@ssh.clusterXXX.hosting.ovh.net` on port 22, or `scp`.

## The `.well-known/` problem

Not a problem on OVH. There is no panel file manager to fight with — OVH retired the browser-based one: "For web hosting plans, you can no longer log in to your FTP storage space via the FTP Explorer/Net2FTP online tool." Every route in (SFTP, FTP, SSH/SCP) is a real filesystem client, and `mkdir .well-known` behaves normally over all of them. Note that some GUI clients hide dotfiles by default, which makes the directory look absent after you create it — that is a display setting in FileZilla/Cyberduck, not the server.

The apex DNS TXT record is still the better option where OVH also hosts the domain's DNS, because BotCentral scores it higher and it survives a web-root change. See below.

## Gotchas

- **SFTP is opt-in.** A fresh OVH Web Hosting plan gives you FTP only. An unattended rclone run against port 22 fails until someone ticks the SFTP box in the panel. There is no API-free way around this — it is a one-time human step.
- **SSH is plan-gated.** "SSH access to an OVHcloud web hosting plan is possible from the Professional plan and above." Starter/Personal customers cannot shell in; use SFTP.
- **`www` is a convention, not a rule.** The Multisite `Root folder` is authoritative and OVH explicitly lists `www`, `app` and `public_html` as possibilities. Uploading to `www/` on a plan whose domain points at `public_html/` silently publishes nothing — the files land in a directory no domain serves.
- **Cluster number is per-plan.** `ftp.cluster0XX.hosting.ovh.net` is not stable across customers or across an OVH-initiated migration. Read it from the FTP - SSH tab rather than hard-coding it.
- **No superuser.** "There is no superuser (or root) access via SSH on shared hosting plans" — fine for dropping five files, relevant if a script tries to touch server config.
- **Plesk only on VPS/dedicated.** OVH sells Plesk Web Admin / Web Pro / Web Host licences for VPS and bare-metal servers, not for shared Web Hosting plans. If the customer is on a Plesk VPS, the web root is Plesk's `httpdocs/`, not OVH's `www/` — treat that as a Plesk case, not an OVH-shared-hosting case.

## If files cannot be placed

Use the **apex DNS TXT record** for the BotCentral proof. OVHcloud runs the DNS for any domain pointed at its nameservers, and the zone editor is at **Web Cloud → Domain names → `<domain>` → DNS zone** → **Add an entry** → **TXT**; leave the Subdomain field empty for an apex record. OVH warns changes take up to 24 hours to propagate fully.

This can be fully automated: **lego has a first-class `ovh` provider.** Three credential styles, and they are mutually exclusive:

- Application key: `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY`, `OVH_ENDPOINT` (`ovh-eu` or `ovh-ca`). Generate the AK/AS/CK triple at https://api.ovh.com/createToken/ (or `https://eu.api.ovh.com/createToken/`).
- OAuth2: `OVH_CLIENT_ID`, `OVH_CLIENT_SECRET`, `OVH_ENDPOINT`.
- Token: `OVH_ACCESS_TOKEN`, `OVH_ENDPOINT`.

Optional tuning: `OVH_TTL` (default 120), `OVH_PROPAGATION_TIMEOUT` (default 60s), `OVH_POLLING_INTERVAL` (default 2s), `OVH_HTTP_TIMEOUT` (default 180s).

The other four files still need the filesystem — there is no admin-panel robots.txt editor on OVH Web Hosting. If a customer will not enable SFTP and is below the Professional plan, plain FTP on port 21 is the fallback and rclone's `ftp` backend drives it.

## Sources

- https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/hosting-how-to-get-my-website-online — "In a typical use case, the website is located in the `www` folder"; files are uploaded with an FTP/SFTP client such as FileZilla, or over SSH
- https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/multisites-configure-multisite — the Multisite `Root folder` field; "the directory on your hosting plan (www, app, public_html, etc.) to which the domain points"
- https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/ftp-connection — port 21 for FTP, port 22 for SFTP; "Main login" is the primary FTP user; FTP Explorer/Net2FTP online tool no longer available for web hosting plans
- https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/ftp-filezilla-user-guide — hostname pattern "ftp.clusterXXX.hosting.ovh.net (the XXX represents the cluster number where your Web Hosting plan is located)"; OVH recommends SFTP over FTP
- https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/enable-sftp — SFTP is enabled per FTP user in the FTP - SSH tab; tick-box on entry plans, Edit → connection protocols on Professional and above
- https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/ssh-on-webhosting — "SSH access to an OVHcloud web hosting plan is possible from the Professional plan and above"; host `ssh.clusterXXX.hosting.ovh.net`, port 22
- https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/landing-page-ftp-ssh — index of FTP/SFTP/SSH guides; no web file manager guide exists
- https://docs.ovhcloud.com/en/guides/web-cloud/domains/dns-zone-txt-record-creation — adding a TXT record: DNS zone tab → Add an entry → TXT; leave Subdomain empty for apex; up to 24h propagation
- https://docs.ovhcloud.com/en/guides/web-cloud/domains/dns-zone-edit — DNS zone tab lets you add, edit or delete records, or edit the zone in text mode
- https://go-acme.github.io/lego/dns/ovh/ — lego `ovh` provider and its exact environment variables; "both authentication methods cannot be used at the same time"
- https://docs.ovhcloud.com/en/guides/manage-and-operate/api/first-steps — creating the AK/AS/CK triple at api.ovh.com/createToken
- https://www.ovhcloud.com/en-gb/plesk-web-hosting/ and https://www.ovhcloud.com/en/vps/os/vps-plesk/ — Plesk is an OVH VPS/dedicated option, pre-installed, with Web Admin / Web Pro / Web Host licence tiers; not part of shared Web Hosting
