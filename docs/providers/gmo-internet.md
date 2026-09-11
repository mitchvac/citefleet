# GMO Internet Group (Japan)

- **Market share:** 1.2% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting (Lolipop!, Heteml, ConoHa WING) + VPS/cloud (ConoHa VPS)
- **File access:** FTP, FTPS (port 21 on all three shared brands), SFTP (ConoHa WING, Heteml, ConoHa VPS), SSH (Lolipop! スタンダード and above only; Heteml all plans; ConoHa WING key-auth only; ConoHa VPS root), control-panel file manager (ロリポップ!FTP, heteml FTP, ConoHa ファイルマネージャー)
- **Automatable by the CiteFleet script (rclone):** partly — every covered brand exposes plain FTP on port 21 with a username/password the customer copies out of a control panel, so `rclone` works once the customer hands over credentials *and* names the publish directory. Nothing is discoverable via API, the publish directory differs per brand (and on Lolipop! is a name the customer invented), and ConoHa WING's SFTP path needs a key that can only be downloaded once from the panel.
- **Docs consulted:** https://lolipop.jp/manual/hp/ftp-set/, https://lolipop.jp/manual/user/ssh/, https://lolipop.jp/manual/user/ftp2-01/, https://lolipop.jp/manual/user/ftp2-02/, https://lolipop.jp/manual/user/ftp2-03/, https://lolipop.jp/manual/user/ftp2-04/, https://lolipop.jp/manual/hp/content-cache/, https://lolipop.jp/manual/user/applications-wordpress/, https://lolipop.jp/manual/user/multi-domain/, https://support.lolipop.jp/hc/ja/articles/360048391094, https://support.lolipop.jp/hc/ja/articles/4408591855635, https://support.lolipop.jp/hc/ja/articles/360049129493, https://support.lolipop.jp/hc/ja/articles/12133723330195, https://support.lolipop.jp/hc/ja/articles/54147182462099, https://support.conoha.jp/wing/faq/ftpssh-q/ftpssh-setting-q/, https://support.conoha.jp/w/ftpclient/, https://support.conoha.jp/w/ftpaccount/, https://support.conoha.jp/w/sshaccount/, https://support.conoha.jp/w/filemanager/, https://support.conoha.jp/w/filezillaclient/, https://support.conoha.jp/w/winscp/, https://support.conoha.jp/w/contentscache/, https://support.conoha.jp/w/browsercache/, https://support.conoha.jp/w/wexal/, https://support.conoha.jp/w/htaccess/, https://support.conoha.jp/v/vps_ssh/, https://support.heteml.jp/hc/ja/articles/360042620293, https://support.heteml.jp/hc/ja/articles/360042134974, https://support.heteml.jp/hc/ja/articles/360042135714, https://support.heteml.jp/hc/ja/articles/11362458055571, https://heteml.jp/service/function/, https://www.onamae.com/server/rs/server-guide/web/guide-html-upload/, https://www.onamae.com/server/rs/server-guide/web/guide-html-ftp/ — fetched 2026-09-11

> **GMO is a group, not one product.** There is no single "GMO hosting" control panel and no
> single web root. This file covers the group's web-hosting brands separately:
>
> | Brand | What it is | Operator | Covered |
> |---|---|---|---|
> | **Lolipop!** (ロリポップ!レンタルサーバー, lolipop.jp) | shared hosting | GMO Pepabo (the site footer reads「ロリポップ！レンタルサーバー by GMOペパボ」) | in depth |
> | **ConoHa WING** (conoha.jp) | shared hosting | GMO Internet, Inc. (support site footer: "© 2026 GMO Internet, Inc.") | in depth |
> | **Heteml** (ヘテムル, heteml.jp) | shared hosting | GMO Pepabo (heteml.jp footer links to pepabo.com) | in depth (third) |
> | **ConoHa VPS** (conoha.jp) | plain VPS with root SSH | GMO Internet, Inc. | brief |
> | **Onamae.com** (お名前.com, onamae.com) | mainly a registrar; also sells レンタルサーバー | GMO Internet, Inc. | brief |
>
> A customer who says "my site is on GMO" must be asked *which brand* before any of the
> instructions below apply.

## Where the web root is

### Lolipop! (ロリポップ!)

There are two cases, and the official FAQ「公開フォルダとはなんですか」spells both out:

- **Custom domain / subdomain (独自ドメイン・サブドメイン):** the web root is the
  **公開フォルダ (publish folder) — a folder whose name the customer invents**, created
  directly in the FTP root. The FAQ says:「お客様にて任意のフォルダ名を指定できます」and
  the setup order is: name it in the domain settings screen, then「ロリポップ！FTPに接続し、
  ルートディレクトリ（一番上の階層）に移動します。設定した公開フォルダ（例：「aaa」）内に
  ホームページデータをアップロードします。」So `https://example.com/robots.txt` is served
  from `<FTP root>/<publish folder>/robots.txt`. There is **no fixed name** — not
  `public_html`, not `web`. The script must ask the customer, or read it from
  ユーザー専用ページ →「独自ドメイン設定」.
- **Lolipop! initial domain (`xxx.lolipop.jp`), or a custom domain with no publish folder
  set:** the web root is the FTP root itself —「ルートディレクトリ（一番上の階層）の
  ホームページデータを表示する仕様になります。そのため、公開フォルダを設定することはできません」.

**About `/web/`:** the premise in the brief is half right. `web` is the *last segment of the
absolute path*, not a folder you see or `cd` into over FTP. Lolipop's migration FAQ gives the
current full path as「/home/users/（数字）/（FTPアカウント）/web」— that directory **is** what
FTP/SFTP logs you into. So over FTP you never type `/web/`; you land in it. The per-account
value is shown at ユーザー専用ページ →「ユーザー設定」>「アカウント情報」>「フルパス」.
Correspondingly, `/manual/hp/ftp-set/` tells customers to set「ホスト初期フォルダ」to blank or `/`.

### ConoHa WING

`public_html/<domain name>/`. The official FAQ:「FTPソフトやファイルマネージャーでサーバーへ
接続した際にpublic_htmlディレクトリ配下に追加している各ドメイン名のディレクトリがございますので
データを設置するホームページのドメイン名のディレクトリへアップロードします」, and the FTP guide:
「接続後「/public_html/<ドメイン名>/」配下にWebサイトデータをアップロードします。例：
「http://conohaexample.com/」のデータを設置する場合「/public_html/conohaexample.com/」配下に
アップロードします」.

The **absolute** form `/home/<user>/<domain>/public_html/` in the brief is **UNVERIFIED** —
ConoHa's own documentation never prints a `/home/...` prefix, and the FTP session's own root is
the level that contains `public_html`. Searched: support.conoha.jp FTP/SSH FAQ index, /w/ftpclient/,
/w/ftpaccount/, /w/filemanager/, /w/sshaccount/, /w/filezillaclient/, /w/winscp/. Use the relative
path `public_html/<domain>/` and you are safe either way.

### Heteml (ヘテムル)

`/web/` — and this brand really does show it as a folder. The official FTP article prints the
tree:

```
📁 /
 +-- 📁 web
      +-- 📁 web/ドメインA.jp
      +-- 📁 web/ドメインB.com
      +-- 📁 web/ドメインC.net
```

with「webフォルダ以下に設置したファイルやフォルダが公開されます。ドメイン毎に公開ディレクトリ
（フォルダ）の設定が可能です」. The publishing guide repeats it in bold:「※ 公開するファイルは
必ず「 web 」フォルダにアップロード（転送）してください」. With one domain the root is `/web/`;
with several, `/web/<domain>/`.

### ConoHa VPS

A plain VPS. There is no platform web root: whatever the customer installed (Apache, nginx,
a container) defines it. The customer has root SSH — ConoHa's own guide logs in as `root` with
the password set when the VPS was created. `/var/www/html` is the usual Apache default but that
is **UNVERIFIED** from ConoHa's own pages (the tutorial URL search results attributed it to,
`https://support.conoha.jp/v/hellovps-w-03/`, 302-redirects to `https://support.conoha.jp/404/`
as of 2026-09-11). Ask the
customer, or read `DocumentRoot` out of the server config.

### Onamae.com (お名前.com)

`public_html/<domain>/`, same shape as ConoHa WING:「ホームページデータは「public_html」内の
各ドメイン名のフォルダ内にアップロードします」. FTP credentials live in the control panel under
「ファイル管理」. Treat it as the ConoHa WING recipe below; the only difference is the panel.

## Steps to install the five files

### Lolipop!

1. Find the target directory. ユーザー専用ページ →「サーバーの管理・設定」→「独自ドメイン設定」
   shows the 公開フォルダ for each domain. If the site runs on the `xxx.lolipop.jp` initial
   domain, the target is the FTP root.
2. Get credentials: ユーザー専用ページ →「アカウント情報／パスワード変更」gives「FTPSサーバー」
   (the hostname to type), 「FTP・WebDAVアカウント」(example given in the manual:
   `lolipop.jp-hogemoge`) and「FTP・WebDAVパスワード」. Set「ホスト初期フォルダ」blank or `/`.
   FTPS (FTP over SSL) is supported; PASV mode is recommended for problem connections.
   The manual does not print a port number — **UNVERIFIED**, assume the FTP default 21
   (searched: /manual/hp/ftp-set/, /manual/hp/w-ff-ftps/, /manual/user/ftp2-01/).
3. Upload `robots.txt`, `sitemap.xml`, `llms.txt` and `<indexnow-key>.txt` into that directory.
   Either drag them into ロリポップ!FTP (https://lolipopftp.lolipop.jp/, same FTP account and
   password) or push them with `rclone` over the `ftp:` backend.
   ロリポップ!FTP caps a single upload at **20 files, 10 MB each** — irrelevant for five text
   files, relevant if the script ever ships a sitemap set.
4. Create `.well-known/` in that directory and put `botcentral.txt` in it — or skip it and use
   the DNS TXT proof (see below).
5. If the plan is スタンダード / ハイスピード / エンタープライズ, SSH is an alternative:
   enable it at ユーザー専用ページ →「SSH」, then `ssh.lolipop.jp` port **2222**, account = the
   FTP account, password auto-generated (「パスワードはセキュリティ上、自動作成となり、ご指定の
   パスワードを設定することはできません」). No root. That also gives `rclone`'s `sftp:` backend.
6. Clear the ロリポップ!アクセラレータ cache for the domain (see Gotchas).

### ConoHa WING

1. Create an FTP account: コントロールパネル →「WING」→「サイト管理」→「FTP」→「＋FTPアカウント」.
   Optionally set「接続許可ディレクトリ」to `public_html/<domain>` so the account is scoped to
   the one site.
2. Read the hostname: 「サーバー管理」→「契約情報」→「メール/FTP/ネームサーバー情報」→「FTPサーバー」.
   Port **21** (both the FileZilla and the WinSCP guides say「ポート」/「ポート番号」=「21」; the
   WinSCP guide selects「暗号化なし」, i.e. plain FTP). FTPS, SFTP and SCP are also supported —
   「FTP/FTPS/SFTP/SCPは使えますか？ 利用可能です。※FTPSはexplicitモードのみ対応しています」.
3. Upload the four flat files into `public_html/<domain>/`, via `rclone` or via
   コントロールパネル →「WING」→「サイト管理」→「ファイルマネージャー」(it asks for the FTP
   account's username and password, then supports drag-and-drop upload, new-file creation by
   extension, delete, rename and permission change).
4. Create `.well-known/botcentral.txt`, or use the DNS TXT proof.
5. SSH is available but awkward for automation: 「サイト管理」→「SSH」→「+SSH key」, and
   「ConoHa WINGではSSH接続に際してキー認証が必須となります」— key auth only, the private key is
   downloadable **once** at generation time, and the hostname/port appear only after you click the
   key's name tag. The port is **UNVERIFIED** from official docs (searched /w/sshaccount/, the
   FTP/SSH FAQ index, /w/ftpclient/; third-party guides consistently report 8022, ConoHa itself
   says only「接続情報等詳細が確認できます」).
6. Clear コンテンツキャッシュ for the domain (see Gotchas).

### Heteml

1. Get credentials: コントロールパネル → 右メニュー「各種設定」→「FTPアカウント」shows the
   「ユーザー名」and「ホスト名(アドレス）」for the main FTP account (and each sub-account).
   FTP port is **21** (「接続ポート番号 21番をご利用ください」); FTPS is offered by selecting
   「FTPS」or「SSL」in the client.
2. Upload the four flat files into `/web/` (single domain) or `/web/<domain>/` (multi-domain).
3. Create `/web/.../.well-known/botcentral.txt`, or use the DNS TXT proof.
4. SSH is free on every plan and is the cleanest automation path here: コントロールパネル →
   「SSHアカウント」→［SSHを利用する］, then username = the FTP account, server
   `ssh-*****.heteml.net` (`*****` = the heteml ID), port **2222**, auto-generated password.
   That makes `rclone`'s `sftp:` backend work with a plain username/password.
5. heteml's recommended permissions are `604` for HTML/files and `705` for folders — match them
   so a freshly created `.well-known/` is world-readable.

### ConoHa VPS

SSH in as root (or the sudo user), drop the five files into whatever `DocumentRoot` the
customer's web server uses, `mkdir -p .well-known`, fix ownership for the web-server user.
`rclone sftp:` works unattended with a normal key. Nothing GMO-specific applies.

### Onamae.com

Same as ConoHa WING, but credentials come from the お名前.com control panel's「ファイル管理」
section — the official guide says only「FTP接続用のソフトウェアに該当の情報をご設定のうえ
FTP接続をお試しください」, so the customer must read host/user/password off that screen. Target
`public_html/<domain>/`.

## The `.well-known/` problem

**Over FTP/SFTP/SSH this is a non-problem on all four brands.** Nothing in any GMO brand's
documentation forbids a directory whose name starts with `.`, and the protocols have no opinion
about it — `rclone` will `MKD .well-known` and upload `botcentral.txt` without special handling.
Lolipop! additionally documents that ロリポップ!FTP can *edit* dotfiles: the editable list is
「拡張子のないファイル、.htaccess、.htpassword」plus a set of extensions including `.txt`, so
dotfiles are at least visible and editable there. Lolipop! also creates its own `.ftpaccess`
dotfile when FTP access restriction is switched on, so dot-entries plainly live in the FTP tree.

**Via the browser file managers, dot-directory creation is UNVERIFIED on every brand:**

- **ロリポップ!FTP** documents「新規フォルダ作成」and gives an explicit name rule:
  「フォルダ名には「半角カタカナ」、「¸」、「"」、「:」、「¥」、「>」、「<」、「⁄」、「#」、
  「.」のみ、「–」１文字のみは利用できません。フォルダ名の最初に「?」は利用できません。」
  Read literally this bans a name that is *only* a dot and a name that is a single dash, and bans
  a leading `?` — it does **not** ban a leading dot, so `.well-known` should be accepted. But no
  official page states that a dot-directory can be created, and none states whether the listing
  shows dot-directories. Searched: /manual/user/ftp2-01/ … /ftp2-04/, /manual/hp/ftp-set/,
  and the Lolipop help center for「隠しファイル」「ドットファイル」「well-known」(the last
  returns one unrelated SSH article).
- **ConoHa's ファイルマネージャー** is worse: the official guide documents upload, new *file*
  creation (by choosing an extension), delete, rename and permission change — **it documents no
  folder-creation function at all**, and says nothing about hidden files. ConoHa does expose a
  separate `.htaccess` editor at「サイト管理」→「サイト設定」→「応用設定」→「.htaccess設定」,
  which is a control-panel feature, not proof the file manager lists dotfiles.
  Searched: /w/filemanager/, /w/htaccess/, the FTP/SSH FAQ index.
- **heteml FTP**: heteml's feature list says the browser file manager can do
  「ファイルのアップロード・フォルダ作成・ファイル作成」, but dot-directory creation and dotfile
  visibility are not documented. Searched: heteml.jp/service/function/, the heteml help center for
  「web フォルダ」「FTP ホスト」.

Practical rule: **use FTP/SFTP for `.well-known/`**, and if the customer only has a browser file
manager, use the DNS TXT proof instead.

## Gotchas

1. **Lolipop!アクセラレータ caches everything, including `robots.txt` and `llms.txt`.** It is on
   for every plan except エコノミー. In default mode「すべての拡張子のファイルがキャッシュされます」
   with a hold time of「一度キャッシュした表示内容は10分程度保持します」. So a newly uploaded
   static file can be served stale for ~10 minutes, and a *previously 404-ing* path can keep
   404-ing for that window — which will fail a BotCentral verification run that happens
   immediately after upload. Clear it: ユーザー専用ページ →「ロリポップ！アクセラレータ」→ the
   domain's『設定』→『キャッシュ削除』, then wait — 「キャッシュの削除や設定の変更後、反映に最大
   5分程度かかります」. There is also a static-only mode whose cache set is
   `css / js / ico / jpg / jpeg / png / gif` (i.e. `.txt` and `.xml` are *not* cached in that mode),
   and a `Cache-Control: no-cache` response-header escape hatch. Cannot be combined with
   LiteSpeed Cache.
2. **ConoHa WING コンテンツキャッシュ does the same.**「コンテンツキャッシュ機能を使うことで
   Webサイトのページをキャッシュ（一時保存）して表示を高速化することができます」, it targets
   static files, and 「動的なページもキャッシュされるのでご注意ください」. Clear it at
   「WING」→「サイト管理」→「高速化」→「キャッシュ」→「コンテンツキャッシュ」→ the クリア button.
   ConoHa's ブラウザキャッシュ is a different thing — it only attaches an `Expires` header, so it
   affects *repeat visitors' browsers*, not a crawler's first fetch, and the official page
   documents no clear button for it. Menu path: same「高速化」→「キャッシュ」tab.
3. **WEXAL silently turns コンテンツキャッシュ off.** 「コンテンツキャッシュがONとなっている状態で
   WEXALをONに設定しますと、自動的にコンテンツキャッシュがOFFになります」. WEXAL optimizes
   images/JS/CSS and re-runs optimization when content changes; it is not documented to touch
   `.txt`/`.xml`, but if a customer reports odd origin-pack behaviour, check whether WEXAL was
   flipped on between runs.
4. **Lolipop! is case- and width-sensitive about filenames.** The official
   「robots.txtは使えますか」article says robots.txt works, and that if a search service reports
   「失敗しました: Robots.txt にアクセスできません」the cause is usually
   「ファイル名の大文字・小文字、全角・半角」— Lolipop treats those as different files. Write
   `robots.txt`, never `Robots.txt`, and never full-width characters in the IndexNow key filename.
   The same article's sibling FAQ adds that uploaded files must use 半角英数字 names and must have
   an extension.
5. **WordPress かんたん/簡単インストール overwrites.** Lolipop's WordPress簡単インストール warns
   「インストール先のディレクトリに同じ名前のファイルが存在する場合は、上書きされます」and
   「インストールした階層に「index.html」がある場合、「サイトURL」で表示されません」. If a
   customer installs WordPress into the same publish folder *after* the origin pack is placed,
   same-named files are replaced.
6. **WordPress serves a virtual `robots.txt` when no file exists.** Not GMO-specific and not
   documented by GMO, so flagged here as **UNVERIFIED for these brands** — but on any of the three
   shared hosts a WordPress site with no physical `robots.txt` will answer that URL from PHP, and
   your uploaded file is what stops it. Always verify by fetching the URL after upload.
7. **Lolipop! publish folders are per-domain and invented by the customer.** Multi-domain accounts
   have one publish folder per domain (「独自ドメインごとにファイルをアップロードするフォルダを
   設定することができます」), so a script that writes to "the FTP root" will publish to the
   *initial* domain, not to the customer's real site.
8. **ConoHa WING FTP accounts can be directory-scoped.** If the customer set
   「接続許可ディレクトリ」to `public_html/<domain>`, the FTP session's root *is* that directory
   and there is no `public_html` level to descend into. The script must not hard-code the prefix.
9. **ConoHa WING SSH keys are download-once.** If the customer lost the `.pem`, they must generate
   a new key; there is no password fallback.
10. **Neither Lolipop! nor ConoHa documents an FTP-account provisioning API** for this flow, so
    credentials always arrive by hand. Budget for the customer mistyping the publish folder.

## If files cannot be placed

1. **`.well-known/botcentral.txt` → apex DNS TXT record.** Use
   `botcentral-verify=citefleet-app` on the apex. This is the right fallback whenever the customer
   only has a browser file manager (dot-directory creation there is UNVERIFIED on all three shared
   brands), and it is the *preferred* path on Lolipop! when the publish folder cannot be
   identified. Lolipop's own documentation shows the shape: for a domain-verification TXT record
   the fields are「名前（ホスト名）：空白または「@」/ 種別：TXT / 値：<code>」, set either in
   ムームーDNS (ムームードメイン control panel →「ドメイン管理」>「ムームーDNS」>「カスタム設定」)
   or at whichever registrar runs the zone. Note the warning:「TXTレコードの反映には最長72時間ほど
   かかる場合があります」— do not verify immediately.
2. **`robots.txt` with no file access:** there is no robots.txt editor in any GMO panel. On a
   WordPress site, a plugin (or `robots_txt` filter) can serve it. ConoHa WING's control-panel
   `.htaccess` editor cannot *create* `robots.txt`, but it can rewrite/serve one from another
   path if a file exists elsewhere in the docroot.
3. **`sitemap.xml`, `llms.txt`, `<indexnow-key>.txt`:** these have no DNS equivalent. If the
   customer genuinely has no FTP/SFTP/SSH and no file manager, the pack cannot be installed on
   that brand — escalate to "customer must obtain FTP credentials from the panel", which on all
   four brands is a self-service screen (Lolipop:「アカウント情報／パスワード変更」; ConoHa WING:
   「サイト管理」→「FTP」; Heteml:「各種設定」→「FTPアカウント」; お名前.com:「ファイル管理」).
4. **ConoHa VPS:** not applicable — root SSH always exists.

## Sources

- https://support.lolipop.jp/hc/ja/articles/360048391094 — Lolipop! 公開フォルダ: the web root for a custom domain is a customer-named folder created in the FTP root; the Lolipop! initial domain (and an unset publish folder) serves from the FTP root itself.
- https://support.lolipop.jp/hc/ja/articles/4408591855635 — Lolipop! current full path format「/home/users/（数字）/（FTPアカウント）/web」(so `web` is the absolute-path tail, i.e. the FTP login directory).
- https://support.lolipop.jp/hc/ja/articles/360049129493 — where the customer reads that full path: ユーザー専用ページ >「ユーザー設定」>「アカウント情報」>「フルパス」.
- https://support.lolipop.jp/hc/ja/articles/12133723330195 — robots.txt is supported on Lolipop!, and filename case/width mismatches are the documented cause of "Robots.txt にアクセスできません".
- https://support.lolipop.jp/hc/ja/articles/4411326410003 — Lolipop! creates a `.ftpaccess` dotfile itself when FTP access restriction is enabled (evidence dot-entries exist in the FTP tree).
- https://support.lolipop.jp/hc/ja/articles/54147182462099 — Lolipop!'s documented shape for a verification TXT record (名前 = blank or `@`, 種別 TXT, 値 = code) and the「最長72時間」propagation warning; used for the DNS-TXT fallback.
- https://lolipop.jp/manual/hp/ftp-set/ — Lolipop! FTP client settings: hostname = the「FTPSサーバー」value from「アカウント情報／パスワード変更」, user =「FTP・WebDAVアカウント」(e.g. `lolipop.jp-hogemoge`), host initial folder blank or `/`, FTPS supported, PASV advised; no port number given.
- https://lolipop.jp/manual/user/ssh/ — Lolipop! SSH is limited to スタンダード/ハイスピード/エンタープライズ; server `ssh.lolipop.jp`, port 2222, account = FTP account, auto-generated password, no root.
- https://lolipop.jp/manual/user/ftp2-01/ — ロリポップ!FTP lives at https://lolipopftp.lolipop.jp/ and logs in with the FTP・WebDAV account/password; supports folder and file creation.
- https://lolipop.jp/manual/user/ftp2-02/ — ロリポップ!FTP folder creation, default permission 705, and the exact folder-name restriction string (bans a name that is only「.」or a single「–」, and a leading「?」; a leading dot is not listed).
- https://lolipop.jp/manual/user/ftp2-03/ — ロリポップ!FTP can edit extensionless files, `.htaccess`, `.htpassword` and a list of extensions including `.txt` (so dotfiles are editable there).
- https://lolipop.jp/manual/user/ftp2-04/ — ロリポップ!FTP upload limits: 20 files per operation, 10 MB per file.
- https://lolipop.jp/manual/hp/content-cache/ — ロリポップ!アクセラレータ: all plans except エコノミー, caches every extension by default, ~10 minute hold, static-only mode limited to css/js/ico/jpg/jpeg/png/gif, per-domain『キャッシュ削除』button, up to 5 minutes to take effect, `Cache-Control: no-cache` exclusion, incompatible with LiteSpeed Cache.
- https://lolipop.jp/manual/user/applications-wordpress/ — Lolipop! WordPress簡単インストール overwrites same-named files in the install directory and is blocked by an existing `index.html`.
- https://lolipop.jp/manual/user/multi-domain/ — Lolipop! multi-domain: an upload folder is configured per custom domain.
- https://support.conoha.jp/wing/faq/ftpssh-q/ftpssh-setting-q/ — ConoHa WING: FTP/FTPS/SFTP/SCP all usable (FTPS explicit only); upload target is the domain-named directory under `public_html`; FTP accounts can be restricted to a directory; SSH usable.
- https://support.conoha.jp/w/ftpclient/ — ConoHa WING: FTP hostname at「サーバー管理」>「契約情報」>「メール/FTP/ネームサーバー情報」>「FTPサーバー」; upload to `/public_html/<ドメイン名>/` with the `conohaexample.com` example.
- https://support.conoha.jp/w/ftpaccount/ — ConoHa WING FTP account creation path (「WING」>「サイト管理」>「FTP」>「＋FTPアカウント」) and「接続許可ディレクトリ」format `public_html/conohaexample.com`.
- https://support.conoha.jp/w/filezillaclient/ — ConoHa WING FTP port 21.
- https://support.conoha.jp/w/winscp/ — ConoHa WING FTP port 21 with「暗号化なし」(plain FTP) in the documented setup.
- https://support.conoha.jp/w/sshaccount/ — ConoHa WING SSH: key authentication mandatory, key generated or imported in the panel, private key downloadable only at creation, connection details revealed by clicking the key's name tag; shared-server restrictions apply. No port printed.
- https://support.conoha.jp/w/filemanager/ — ConoHa WING file manager: reached via「WING」>「サイト管理」>「ファイルマネージャー」, logs in with the FTP account, documents upload / create file by extension / delete / rename / permission change — and documents no folder creation and no dotfile behaviour.
- https://support.conoha.jp/w/contentscache/ — ConoHa WING コンテンツキャッシュ caches pages including static files, dynamic pages too, cleared at「WING」>「サイト管理」>「高速化」>「キャッシュ」>「コンテンツキャッシュ」via the クリア button.
- https://support.conoha.jp/w/browsercache/ — ConoHa WING ブラウザキャッシュ only adds an `Expires` header; enabled at the same「高速化」>「キャッシュ」tab; no clear function documented.
- https://support.conoha.jp/w/wexal/ — ConoHa WING WEXAL: turning it on automatically turns コンテンツキャッシュ off; optimization re-runs when content changes.
- https://support.conoha.jp/w/htaccess/ — ConoHa WING has a control-panel `.htaccess` editor at「サイト管理」>「サイト設定」>「応用設定」>「.htaccess設定」.
- https://support.conoha.jp/v/vps_ssh/ — ConoHa VPS: SSH login as `root` with the password set at VPS creation (password auth documented; key auth in a separate guide).
- https://support.heteml.jp/hc/ja/articles/360042620293 — Heteml directory tree (`/` → `web` → `web/<domain>`), "files under the web folder are published", FTP port 21, FTPS support, recommended permissions (604 files / 705 folders).
- https://support.heteml.jp/hc/ja/articles/360042134974 — Heteml publishing guide:「※ 公開するファイルは必ず「 web 」フォルダにアップロード（転送）してください」, for both FTP clients and heteml FTP.
- https://support.heteml.jp/hc/ja/articles/360042135714 — Heteml SSH: enabled from コントロールパネル「SSHアカウント」, username = FTP account, server `ssh-*****.heteml.net`, port 2222, auto-generated password.
- https://support.heteml.jp/hc/ja/articles/11362458055571 — Heteml FTP account username and hostname are read from コントロールパネル「各種設定」>「FTPアカウント」.
- https://heteml.jp/service/function/ — Heteml feature list: 50 FTP accounts, FTPS, SSH, WebDAV, heteml FTP browser file manager (upload / folder creation / file creation / search), no root on the shared server; footer identifies GMO Pepabo.
- https://www.onamae.com/server/rs/server-guide/web/guide-html-upload/ — お名前.com レンタルサーバー:「ホームページデータは「public_html」内の各ドメイン名のフォルダ内にアップロードします」.
- https://www.onamae.com/server/rs/server-guide/web/guide-html-ftp/ — お名前.com FTP credentials come from the control panel's「ファイル管理」section; no host/port/path printed in the guide.

**Pages that could not be loaded:** `support.lolipop.jp` and `support.heteml.jp` return HTTP 403 to
non-browser clients; their article bodies were read through the public Zendesk Help Center API
(`/api/v2/help_center/ja/articles/<id>.json` on the same host) and are cited above by their normal
article URLs. `help.onamae.com/answer/20203` also returns 403 and was not used.
