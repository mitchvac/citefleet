# Sakura Internet — さくらのレンタルサーバ (Sakura Rental Server)

- **Market share:** 0.9% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting
- **File access:** FTP, FTPS (explicit, port 21), SFTP + SSH (スタンダード plan and above only), control-panel file manager (ファイルマネージャー)
- **Automatable by the CiteFleet script (rclone):** yes
- **Docs consulted:** https://help.sakura.ad.jp/rs/2251/ , https://help.sakura.ad.jp/domain/2149/ , https://help.sakura.ad.jp/purpose_beginner/2867/ , https://help.sakura.ad.jp/rs/2217/ , https://help.sakura.ad.jp/rs/2247/ , https://help.sakura.ad.jp/rs/2195/ , https://help.sakura.ad.jp/rs/2196/ , https://help.sakura.ad.jp/rs/2161/ , https://help.sakura.ad.jp/rs/2181/ , https://help.sakura.ad.jp/rs/2183/ , https://help.sakura.ad.jp/domain/2144/ , https://manual.sakura.ad.jp/cloud/webaccel/manual/function-management.html — fetched 2026-09-11

## Where the web root is

There are two cases, and they give **different** answers. Getting this wrong puts the
five files one directory away from where crawlers look.

**Case 1 — the initial domain (初期ドメイン, `<account>.sakura.ne.jp`).**
The document root is `/home/<account>/www/`. Sakura's own specification table states it
plainly:

> ホームディレクトリ … `/home/アカウント名/`
> ウェブ公開ディレクトリ（ドキュメントルート） … `/home/アカウント名/www/`
>
> — 基本仕様を知りたい（さくらのレンタルサーバ）, https://help.sakura.ad.jp/rs/2251/

The FTP setup manual repeats it: 「Webサイトのデータを `/home/アカウント名/www` に
アップロードしていただく必要がございます」 (https://help.sakura.ad.jp/rs/2217/).
This root **cannot be moved** — 「初期ドメインのWeb公開フォルダーは変更できません。
独自ドメイン、もしくはサブドメインをご選択ください。」
(https://help.sakura.ad.jp/purpose_beginner/2867/).

**Case 2 — a customer's own added domain (マルチドメイン). This is the common case, and
the root is usually a subdirectory, NOT `www/`.**
When a domain is added in the control panel, the customer ticks
「マルチドメインとして利用する」 and types a folder name into the
「Web公開フォルダー」 field. Sakura's multi-domain manual (https://help.sakura.ad.jp/domain/2149/):

> 6. 「ドメイン利用設定」の『Web公開フォルダー』にSTEP1にて作成したフォルダー名を入力します。
> ※ フォルダー名の前に「 / （スラッシュ） 」を必ず入れてください。
> ※ 指定するフォルダーは、`/home/アカウント名/www/` 以下のみ指定できます。
> ※ 実際に存在するフォルダー名とまったく同じ文字列でなければ、正常に動作しません。(大文字・小文字などご注意ください。)

So a domain configured with Web公開フォルダー `/example` serves from
`/home/<account>/www/example/`, and **that** directory — not `www/` — is the root of
that website. The same manual also says that if you create the folder with an FTP
client rather than the file manager, 「必ず `/home/アカウント名/www` 以下に
フォルダーを作成してください」.

**How the customer finds their actual root:** サーバーコントロールパネル
(https://secure.sakura.ad.jp/rs/cp/) → 「ドメイン/SSL」 → 『ドメイン/SSL』. The domain
list shows each domain with its folder name next to it — 「ドメインが追加され、
フォルダー名が表示されていれば、設定が完了です」 (https://help.sakura.ad.jp/domain/2149/).
Per-domain the field is under 設定 → 基本設定 → 「Web公開フォルダー」
(https://help.sakura.ad.jp/purpose_beginner/2867/).

**WordPress sites are almost never at `www/`.** Sakura's quick installer refuses to
install into the initial domain's root — 「クイックインストールでは初期ドメイン直下
「/homeアカウント名/www/」にWordPressをインストールすることができません。以下の通り
サブディレクトリを指定する必要があります。」 — and if the customer leaves the
subdirectory box empty it silently names the folder after the domain:
「※サブディレクトリ指定用のテキストボックスに任意のディレクトリ名を入力しなかった場合、
WEB公開フォルダーはドメイン名と同一になるよう自動で設定されます。例：ドメイン名が
「example.com」の場合、web公開フォルダーが「www/example.com」になります。」
(https://help.sakura.ad.jp/rs/2161/). So a very common real root is
`/home/<account>/www/example.com/`.

## Steps to install the five files

**Preferred: rclone over SFTP (スタンダード plan and above).**

SSH/SFTP connection values, from https://help.sakura.ad.jp/rs/2247/ — host =
初期ドメイン `example.sakura.ne.jp`, user = 「初期ドメインのアカウント部分」 (`example`),
password = サーバーパスワード, protocol SSH2, **port 22**. Note the restriction on the
same page: 「SSHはスタンダードプラン以上のプランでご利用可能です。」 and
「SSH、sftpは初期アカウントでのみ利用できます。ビジネス以上のプラン以上で追加した
ユーザアカウントでは接続できません。」

```
rclone config create sakura sftp \
  host=example.sakura.ne.jp user=example port=22 pass=<サーバーパスワード>
# WEBROOT is www  OR  www/<the Web公開フォルダー name from ドメイン/SSL>
rclone copy ./pack sakura:www/example.com/ --include-from files.txt
rclone mkdir sakura:www/example.com/.well-known
rclone copyto ./pack/.well-known/botcentral.txt sakura:www/example.com/.well-known/botcentral.txt
```

The SFTP session lands in the home directory `/home/<account>/`, so paths are written
relative to it as `www/...` (https://help.sakura.ad.jp/rs/2251/ gives the home dir as
`/home/アカウント名/`). Absolute paths (`/home/example/www/...`) work equally.

**Fallback for the ライト plan (no SSH, no SFTP): rclone over explicit FTPS, port 21.**

FTP values, from https://help.sakura.ad.jp/rs/2217/:

| Field | Value | Example |
| --- | --- | --- |
| FTPサーバー名 | 初期ドメイン名 or 独自ドメイン名 | `example.sakura.ne.jp` |
| FTPアカウント | 初期ドメインのサブドメイン部分 | `example` |
| FTP初期フォルダ | `www` | `www (/www)` or `/home/アカウント名/www` |
| サーバーパスワード | サーバーパスワード | — |

Port and TLS, from https://help.sakura.ad.jp/rs/2251/: 接続ポート番号 **21**
「※ 990番ポートは使用しません」, 暗号化通信（FTPS接続） ○, software ProFTPD. Because
990 (implicit FTPS) is explicitly not used, FTPS here is **explicit** (AUTH TLS on 21) —
that is the combination those two documented facts leave. The firewall table on the same
page allows only `ftp 21/tcp, ftp-data` inbound, plus `ssh 22/tcp`. Sakura pushes FTPS/SFTP
over plain FTP and gives the hostname rule for it: 「FTPS/SFTPをご利用の場合 … サーバー名
には「初期ドメイン」をご入力ください」, because the FTP certificate is `[*sakura.ne.jp]`
(https://help.sakura.ad.jp/rs/2217/).

```
rclone config create sakura ftp \
  host=example.sakura.ne.jp user=example port=21 \
  explicit_tls=true pass=<サーバーパスワード>
rclone copy ./pack sakura:www/example.com/
```

(`explicit_tls` is rclone's FTP-over-TLS switch — https://rclone.org/ftp/.)

**Manual route (no credentials to hand, any plan): the control-panel file manager.**
サーバーコントロールパネル (https://secure.sakura.ad.jp/rs/cp/) → 「Webサイト/データ」 →
『ファイルマネージャー』 (menu path per https://help.sakura.ad.jp/domain/2149/). In the
file manager: pick the target folder in the left tree, then 上部メニューの『アップロード』
→ [ファイルを追加] → [アップロード開始]; folders are created with
[表示アドレスの操作] → [フォルダ作成] (https://help.sakura.ad.jp/rs/2195/).

Concretely, for a site whose Web公開フォルダー is `/example.com`:

1. Read the real web root from ドメイン/SSL → the folder name shown beside the domain.
2. Upload `robots.txt`, `sitemap.xml`, `llms.txt`, `<indexnow-key>.txt` into
   `/home/<account>/www/<that folder>/`.
3. Create the `.well-known` directory in that same folder and upload `botcentral.txt`
   into it (see the section below).
4. If コンテンツブースト is switched on for that domain, purge the CDN (below).
5. Verify each of the five URLs over HTTPS on the live domain.

## The `.well-known/` problem

Over SFTP or FTPS this is a non-issue: it is an ordinary `mkdir .well-known` on a FreeBSD
shared host (OS is FreeBSD per https://help.sakura.ad.jp/rs/2251/), and Sakura's own
tooling already writes dot-files into the web tree — the file manager's access-restriction
feature creates `.htaccess` and `.htpasswd` inside `/home/アカウント名/www/`
(https://help.sakura.ad.jp/rs/2196/), and `.htaccess` / `.ftpaccess` creation is listed as
supported (○) in the spec table (https://help.sakura.ad.jp/rs/2251/). Nothing in the docs
blocks serving a dot-directory over HTTP.

**UNVERIFIED: whether the web file manager (ファイルマネージャー) lists dot-files or will
accept a folder name beginning with `.`.** What I searched: the full text of the file
manager manual (https://help.sakura.ad.jp/rs/2195/), the file manager access-restriction
manual (https://help.sakura.ad.jp/rs/2196/), and the multi-domain manual
(https://help.sakura.ad.jp/domain/2149/), for the strings 隠しファイル, 非表示, ドット,
先頭, and `.well` — zero hits in all three. Sakura's help site has no server-rendered
search: both `https://help.sakura.ad.jp/?s=<term>` and
`https://help.sakura.ad.jp/search/?keyword=<term>` return the same static "popular
articles" list for every query (confirmed with a nonsense control query), so a keyword
sweep of the help site was not possible. The folder-name guidance that *does* exist is
about character sets, and it permits the period: usable characters are
「アルファベット / 数字 / 記号「-（ハイフン）」「.（ピリオド）」「_（アンダーバー）」」
(https://help.sakura.ad.jp/rs/2251/) — which is consistent with, but not proof of, a
leading-dot folder name being accepted by the web UI.

Practical guidance: create `.well-known/` over SFTP/FTPS with rclone. If only the file
manager is available and it refuses the name, fall back to the DNS TXT proof.

## Gotchas

- **The root is usually `www/<folder>/`, not `www/`.** Uploading to `www/` on a
  multi-domain account publishes the pack to the *initial* domain
  (`<account>.sakura.ne.jp`) and not to the customer's domain at all
  (https://help.sakura.ad.jp/domain/2149/).
- **Folder name must match exactly, case included:** 「実際に存在するフォルダー名と
  まったく同じ文字列でなければ、正常に動作しません。(大文字・小文字などご注意ください。)」
  (https://help.sakura.ad.jp/domain/2149/).
- **CDN cache — コンテンツブースト.** Sakura's own CDN feature caches **every** file for
  **300 seconds** by default: 「キャッシュ時間（s-maxage） 300秒」,
  「キャッシュ対象 全てのファイル」, and 「初期設定で300秒の間同じファイルをキャッシュ
  サーバーが配信するため、間違った情報を公開してしまった場合、すぐに修正しても最大300秒
  配信されない可能性があります。サーバーコントロールパネルからキャッシュ削除が実行できます
  ので、即時反映を行いたい場合はこちらをご利用ください。」
  (https://help.sakura.ad.jp/rs/2181/). So a freshly uploaded `robots.txt` can read stale
  for up to 5 minutes, and a verification fetch can 404 after the file is in place.
  **Purge:** 「Webサイト/データ」 → 『コンテンツブースト』 → 『キャッシュ削除』
  (https://help.sakura.ad.jp/rs/2183/). It is opt-in per domain, free up to 100GB/month on
  ライト・スタンダード and 300GB on プレミアム and above, and is unavailable on the initial
  domain and on www-less domains (https://help.sakura.ad.jp/rs/2181/).
- **CDN cache — さくらのウェブアクセラレータ.** The separate Sakura Cloud CDN can also
  front a rental-server origin. Purge from its control panel: 「サイト情報画面で「設定」
  からキャッシュの全件削除やURL毎の個別削除ができます」, キャッシュ管理タブ → 「全件削除」,
  or per-URL via 「削除対象URL」
  (https://manual.sakura.ad.jp/cloud/webaccel/manual/function-management.html). It also has
  a public purge API (https://manual.sakura.ad.jp/cloud/webaccel/api.html).
- **TLS hostname for FTPS/SFTP must be the initial domain.** The FTP/mail certificate is
  `[*sakura.ne.jp]`; using the customer's own domain (or `ftp.example.sakura.ne.jp`, which
  a wildcard does not cover) produces a certificate-mismatch error
  (https://help.sakura.ad.jp/rs/2217/, https://help.sakura.ad.jp/domain/2144/).
- **ライト plan has no SSH and no SFTP.** The SSH manual's 対象プラン lists only
  スタンダード/プレミアム/ビジネス/ビジネスプロ/マネージド, and the spec page titles the
  section 「1.4. SSH（スタンダードプラン以上）」
  (https://help.sakura.ad.jp/rs/2247/, https://help.sakura.ad.jp/rs/2251/). FTP/FTPS is the
  only unattended path on ライト.
- **SSH/SFTP only for the initial account.** 「SSH、sftpは初期アカウントでのみ利用でき
  ます。ビジネス以上のプラン以上で追加したユーザアカウントでは接続できません。」
  (https://help.sakura.ad.jp/rs/2247/). Sub-accounts must use FTP.
- **File manager limits:** 25MB per file, no folder upload
  (「ファイルマネージャーではフォルダのアップロードが行えないため、ファイルを複数選択し
  アップロードいただくか、FTPソフトでのアップロード」), and it cannot go above
  `/home/アカウント名/www` (https://help.sakura.ad.jp/rs/2195/). The five files are tiny,
  so only the folder-upload limitation matters.
- **Filenames:** use ASCII. 「日本語など2バイト文字のファイル名を転送すると削除できなく
  なる場合があります」 (https://help.sakura.ad.jp/rs/2217/). The IndexNow key file is
  hex, so this is fine.
- **Domain may not point at a folder at all.** The same multi-domain screen can bind an
  added domain to 新さくらのブログ / さくらのブログ instead of a `www/` subfolder
  (https://help.sakura.ad.jp/domain/2149/). In that configuration there is no filesystem
  root for the site and the file pack cannot be installed — use DNS TXT and Search Console
  for the rest.
- **UNVERIFIED: anything on this platform that generates or overrides `robots.txt`.** I
  found no Sakura document describing a platform-generated `robots.txt`, and I could not
  keyword-search the help site (see the search limitation above); I checked
  https://help.sakura.ad.jp/rs/2251/ (full spec), https://help.sakura.ad.jp/rs/2181/ (CDN),
  https://help.sakura.ad.jp/rs/2161/ (WordPress quick install) and
  https://help.sakura.ad.jp/rs/2195/ — none mention `robots.txt`. Sakura serves nginx +
  Apache 2.4 with `.htaccess` and `mod_rewrite` enabled (https://help.sakura.ad.jp/rs/2251/),
  so a customer's own rewrite rules, or a CMS installed via quick install, are the realistic
  source of an override — a real `robots.txt` file on disk beats WordPress's virtual one,
  but a `mod_rewrite` rule in `.htaccess` can still shadow it.
- **UNVERIFIED: what an added domain serves when 「マルチドメインとして利用する」 is left
  unticked or Web公開フォルダー is left blank.** https://help.sakura.ad.jp/domain/2149/ and
  https://help.sakura.ad.jp/purpose_beginner/2867/ document only the ticked-with-a-folder
  path. Read the folder column in ドメイン/SSL rather than assuming it falls back to `www/`.
- **UNVERIFIED: WebDAV.** `webdav 9800/tcp` and `webdav ssl 9802/tcp` appear in the
  inbound-port table at https://help.sakura.ad.jp/rs/2251/, but I found no Sakura manual
  saying WebDAV is offered on さくらのレンタルサーバ or how to enable it, so rclone's
  `webdav` backend is not a route I can recommend here.

## If files cannot be placed

1. **ライト plan, or FTP credentials only** — still fine: explicit FTPS on port 21 does
   everything, including `.well-known/`. No degradation needed.
2. **File manager refuses a `.well-known` folder** (unverified above) — use the apex DNS
   TXT proof `botcentral-verify=citefleet-app` instead. Sakura customers who use
   さくらインターネット指定ネームサーバー (`ns1.dns.ne.jp` / `ns2.dns.ne.jp`,
   https://help.sakura.ad.jp/domain/2149/) can edit the zone from the same control panel —
   「さくらのレンタルサーバに登録したドメインのゾーン情報は、サーバーコントロールパネル
   から編集が可能です」 (https://help.sakura.ad.jp/domain/2144/) — so the TXT record is a
   one-screen change and needs no file access at all. The other four files still go in the
   web root.
3. **Domain bound to さくらのブログ rather than a folder** — no filesystem root exists;
   DNS TXT for the proof, and the pack cannot be served until the domain is repointed at a
   `www/` subfolder.

## Sources

- https://help.sakura.ad.jp/rs/2251/ — 基本仕様: home dir `/home/アカウント名/`, document root `/home/アカウント名/www/`; FTP = ProFTPD, port 21, 「990番ポートは使用しません」, FTPS ○; inbound ports `ftp 21/tcp`, `ssh 22/tcp`, `webdav 9800/9802`; 「1.4. SSH（スタンダードプラン以上）」 and sftp ○ for the initial account; nginx + Apache 2.4, `.htaccess` and `mod_rewrite` ○; allowed filename characters incl. `.`; per-plan file-count caps.
- https://help.sakura.ad.jp/domain/2149/ — マルチドメイン: control-panel path 「Webサイト/データ」→『ファイルマネージャー』 and 「ドメイン/SSL」→『ドメイン/SSL』→『ドメイン新規追加』→ 設定 → 基本設定; 「マルチドメインとして利用する」 + 「Web公開フォルダー」 with a leading `/`, restricted to under `/home/アカウント名/www/`, case-sensitive exact match; folder shown in the domain list; blog-binding alternative.
- https://help.sakura.ad.jp/purpose_beginner/2867/ — Web公開フォルダー definition, where to change it (ドメイン/SSL → 基本設定), and that the initial domain's root cannot be changed.
- https://help.sakura.ad.jp/rs/2217/ — FTP settings for ライト/スタンダード/プレミアム: server name = initial or own domain (`example.sakura.ne.jp`), account = subdomain part (`example`), 初期フォルダ `www` / `/home/アカウント名/www`, サーバーパスワード; FTPS/SFTP must use the initial domain because the cert is `[*sakura.ne.jp]`; ASCII filenames only.
- https://help.sakura.ad.jp/rs/2247/ — SSH: standard plan and above, host = initial domain, user = account part, SSH2, port 22; SSH/sftp restricted to the initial account.
- https://help.sakura.ad.jp/rs/2195/ — ファイルマネージャー: cannot go above `/home/アカウント名/www`, [表示アドレスの操作] → [フォルダ作成], 『アップロード』 flow, 25MB per file, no folder upload. (No statement about dot-files.)
- https://help.sakura.ad.jp/rs/2196/ — file manager writes `.htaccess` / `.htpasswd` into `/home/アカウント名/www/`, i.e. dot-files do live in the web tree.
- https://help.sakura.ad.jp/rs/2161/ — WordPress クイックインストール cannot install into `~/www` directly and defaults the Web公開フォルダー to `www/<domain>`.
- https://help.sakura.ad.jp/rs/2181/ — コンテンツブースト (CDN): 300s s-maxage, caches all files, purge from the server control panel, plan quotas, unavailable for the initial domain and www-less domains.
- https://help.sakura.ad.jp/rs/2183/ — コンテンツブースト control panel: 「Webサイト/データ」→『コンテンツブースト』, 『キャッシュ削除』 button.
- https://help.sakura.ad.jp/domain/2144/ — initial domain and added-domain name mapping (`ftp.example.sakura.ne.jp`, `ftp.example.com`); zone editing from the server control panel.
- https://secure.sakura.ad.jp/rs/cp/ — サーバーコントロールパネル login URL, as linked from https://help.sakura.ad.jp/domain/2149/ and https://help.sakura.ad.jp/purpose_beginner/2585/.
- https://manual.sakura.ad.jp/cloud/webaccel/manual/function-management.html — ウェブアクセラレータ cache purge: all-cache delete and per-URL delete from the site's 設定 / キャッシュ管理 tab.
- https://rclone.org/ftp/ — rclone FTP backend with `explicit_tls` (FTP over TLS).
- https://rclone.org/sftp/ — rclone SFTP backend.
