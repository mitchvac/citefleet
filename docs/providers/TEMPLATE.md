# <Provider name>

- **Market share:** X% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting | VPS/cloud | managed WordPress | SaaS site builder | git-deploy platform
- **File access:** SFTP | FTP | SSH | control-panel file manager | admin UI only | none
- **Automatable by the CiteFleet script (rclone):** yes | partly | no
- **Docs consulted:** <official URLs>, fetched 2026-09-11

## Where the web root is

<The actual directory the domain serves from, e.g. `public_html/`, `/var/www/html/`,
`httpdocs/`. Say how the customer finds it if it varies.>

## Steps to install the five files

1. ...
2. ...

## The `.well-known/` problem

<Can the customer create a dot-directory here? Many file managers hide or refuse
them. State what actually happens and the workaround. If DNS TXT is used for the
proof instead, this section is moot — say so.>

## Gotchas

<Anything that silently breaks: a platform-generated robots.txt that overrides
uploads, a CDN cache, a build step that wipes the directory, dotfiles stripped
on deploy.>

## If files cannot be placed

<The fallback: DNS TXT for proof, admin-panel robots.txt editor, plugin, or
"not possible — this host cannot serve the pack".>

## Sources

- <URL> — <what it confirmed>
