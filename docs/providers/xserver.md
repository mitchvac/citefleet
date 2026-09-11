# XServer (エックスサーバー)

- **Market share:** 1.4% of all websites (W3Techs, 2026-09-11)
- **Category:** shared hosting
- **File access:** FTP, FTPS (explicit, port 21), SSH (port 10022, public key only, off by default), control-panel file manager (ファイルマネージャ)
- **Automatable by the CiteFleet script (rclone):** yes
- **Docs consulted:** https://www.xserver.ne.jp/manual/man_server_folder.php, https://www.xserver.ne.jp/manual/man_ftp_add.php, https://www.xserver.ne.jp/manual/man_program_cron.php, https://www.xserver.ne.jp/manual/man_ftp_setting.php, https://www.xserver.ne.jp/manual/man_ftp_spec.php, https://www.xserver.ne.jp/manual/man_ftp_filezilla_setting.php, https://www.xserver.ne.jp/manual/man_ftp_info_check.php, https://www.xserver.ne.jp/manual/man_server_ssh.php, https://www.xserver.ne.jp/manual/man_tool_file.php, https://www.xserver.ne.jp/manual/man_server_htaccess.php, https://www.xserver.ne.jp/manual/man_server_ai_crawler.php, https://www.xserver.ne.jp/manual/man_server_ads.php, fetched 2026-09-11

## Where the web root is

The document root is `public_html`, one level inside a per-domain folder inside the
account home directory:

```
/home/<サーバーID>/<ドメイン名>/public_html/
```

Confirmed verbatim in two places in the official manual. The サブFTPアカウント
manual gives the real absolute form when explaining how to scope an FTP account to
one site: 「※ホームページ部分のみを操作させたい際には、/home/xsample/example.com/public_html/
となります。」 — *"if you want to allow operation on only the homepage portion, it is
`/home/xsample/example.com/public_html/`"* (`man_ftp_add.php`). Here `xsample` is the
サーバーID (server ID) and `example.com` is the domain. The Cron manual gives the same
shape generically: 「/usr/bin/php7.4 /home/サーバーID/独自ドメイン名/public_html/abc.php」
(`man_program_cron.php`). So the operator's guess was correct.

The FAQ 「public_html フォルダとは何ですか？」 states 「public_html はドキュメントルートと
呼ばれ、ホームページのデータ（HTMLファイルや画像データファイルなど）を置くための
ディレクトリです。」 — *"public_html is called the document root; it is the directory for
placing homepage data."* It adds that anything you do **not** want published can be put
above it: 「ホームページとして公開したくないファイルをアップロードしたい場合は
public_html/ より上に置くことで…」.

**The sibling layout is real.** 「初期フォルダについて」 (`man_server_folder.php`) lists what
is auto-created inside each domain folder:

| Folder | Manual text | Meaning |
| --- | --- | --- |
| `.spamassassin` | 迷惑メールフィルタ設定についてのファイルが保存されます。 | spam-filter settings |
| `autoreply` | 自動応答設定についてのファイルが保存されます。 | mail auto-reply config |
| `htpasswd` | Basic認証のパスワード設定ファイルが保存されます。 | Basic-auth password files |
| `log` | アクセスログが保存されます。 | access logs |
| `mail` | メールデータが保存されます。 | mail data |
| `public_html` | サイトデータのアップロード先です。 | **the web root** |
| `script` | cgiツールなどの各種スクリプトが保存されます。 | CGI/scripts |
| `xserver_php` | php.ini設定のファイルが保存されます。 | per-domain php.ini |

At the top level of the home directory there are also `<サーバーID>.xsrv.jp/` (the
initial domain, same internal layout) and `ssl/` (SSL config files).

So an FTP/SFTP session lands in `/home/<サーバーID>/` and shows **domain-name folders**,
not `public_html` directly. A script must descend two levels. Note also that
`.spamassassin` is an XServer-created dot-directory sitting beside `public_html` — the
platform itself ships dot-directories in the account tree.

## Steps to install the five files

Panel naming first, because XServer has two separate logins and they are easy to
confuse:

- **XServerアカウント** (XServer Account) — https://secure.xserver.ne.jp/xapanel/login/xserver/ —
  billing, registration details, renewals. 「エックスサーバーを含むXServer関連サービスの
  管理に共通して使用できるアカウント」.
- **サーバーパネル** (Server Panel) — https://secure.xserver.ne.jp/xapanel/login/xserver/server/ —
  everything server-side: domains, FTP, SSH, .htaccess, WAF. **All steps below are in
  サーバーパネル unless stated.**

### Recommended path — scoped sub-FTP account + rclone (unattended)

1. Log in to **サーバーパネル**. Open **サブFTPアカウント設定** (Sub FTP Account Settings) →
   **サブFTPアカウント追加** (Add sub FTP account). Set the FTPユーザーID, a password, an
   FTP容量 (quota), and set **アクセス可能ディレクトリ** (accessible directory) to
   `/home/<サーバーID>/<ドメイン名>/public_html/`. This is the documented way to confine an
   account: 「サブFTPアカウントの追加にて、アカウントを作成していただければ、特定の
   ディレクトリのみへのアクセスを許可することができます。」 (`service_ftp_access.php`).
   The resulting username has the form `追加名@ドメイン名` (e.g. `citefleet@example.com`)
   per `man_ftp_setting.php`.
2. Note the FTP host. サーバーパネル → **FTPアカウント設定** → the **FTPソフト設定** tab
   shows 「FTPサーバー(ホスト)名とユーザー(アカウント)名の確認ができます」. The hostname
   pattern is `sv***.xserver.jp` (e.g. `sv12345.xserver.jp`), and it is also printed in the
   サーバーアカウント設定完了メール (account setup completion email).
3. Configure rclone with the FTP backend, explicit TLS, port 21:
   ```
   rclone config create xserver ftp \
     host=sv12345.xserver.jp port=21 \
     user=citefleet@example.com pass=<sub-FTP password> \
     explicit_tls=true
   ```
   Port 21 is the documented port: 「接続ポート番号 … 21（localhost接続の場合は「10021番
   ポート」をご指定ください）」 (`man_ftp_spec.php`). Explicit TLS is what XServer's own
   FileZilla manual tells customers to select: プロトコル =「FTP - ファイル転送プロトコル」,
   暗号化 =「明示的な FTP over TLS が必要」 (`man_ftp_filezilla_setting.php`). FTP over SSL is
   confirmed supported: 「はい、対応したFTPソフトをご利用いただければ、FTP通信をより
   セキュアなものにする FTP over SSL をご利用いただけます。」 (`service_ftp_overssl.php`).
4. Push the pack. Because the sub-FTP account is chrooted to `public_html`, the remote
   paths are relative to the web root:
   ```
   rclone copy ./pack xserver:/ --include robots.txt --include sitemap.xml \
     --include llms.txt --include "*.txt"
   rclone copy ./pack/.well-known xserver:/.well-known
   ```
   `rclone copy` creates `.well-known/` on the way in; no separate mkdir step.
5. Verify over HTTP, not over FTP: fetch `https://example.com/robots.txt`,
   `/sitemap.xml`, `/llms.txt`, `/.well-known/botcentral.txt`, `/<indexnow-key>.txt`.
   An FTP listing is not proof the files are *served* (see Gotchas — WAF, BASIC認証).
6. Go to **AIクローラー遮断設定** (AI Crawler Blocking) and confirm it is **OFF** for this
   domain. See Gotchas — this is the single setting most likely to make the whole pack
   pointless.

### If the main FTP account is used instead

The main account works too — host `sv***.xserver.jp`, user = **サーバーID**, password =
the **FTPパスワード** from the サーバーアカウント設定完了メール. But `man_ftp_info_check.php`
is explicit that 「FTPパスワードは「サーバーパスワード」と共通ですが、「XServerアカウントの
パスワード」とは異なります。」 — the FTP password *is* the server password, which also logs
in to サーバーパネル. Handing it to an automation script hands over the whole control
panel. Prefer the sub-account. The FTP password cannot be changed from the FTP menu;
it is reset through the separate サーバーパスワード再設定フォーム (server password reset
form).

With the main account the login lands at `/home/<サーバーID>/`, so remote paths become
`xserver:/<ドメイン名>/public_html/` and `xserver:/<ドメイン名>/public_html/.well-known`.

### SSH / SFTP path

1. サーバーパネル → **SSH設定** (SSH Settings). It is 「初期状態では「OFF(無効)」です。」 —
   **off by default**; the customer must switch it ON. No plan restriction is stated in
   the manual, and 「サーバー仕様一覧」 lists SSH as 利用可能 with no plan column (telnet is
   listed as 利用できません).
2. Register a public key — either let the panel generate the pair and download the
   private key, or paste your own. 「登録が行える公開鍵は「OpenSSH形式」のみです。」 —
   OpenSSH format only.
3. Connect: host `<サーバーID>.xsrv.jp` (the initial domain) or `sv***.xserver.jp`, **TCP
   port 10022**, user = **サーバーID**. 「パスワード認証は利用できません。」 — public-key auth
   only, password auth is not available.
4. rclone equivalent:
   ```
   rclone config create xserver-ssh sftp \
     host=xsample.xsrv.jp port=10022 user=xsample key_file=~/.ssh/xsample.key
   rclone copy ./pack xserver-ssh:/home/xsample/example.com/public_html
   ```
   **UNVERIFIED:** no XServer manual page states that the SFTP subsystem specifically is
   enabled on the SSH service, or names SFTP/WinSCP at all. `man_server_spec.php` says
   SSH は利用可能; `man_server_ssh.php` and `man_server_ssh_connect_tera.php` document only
   an interactive Tera Term shell session. Searched xserver.ne.jp for SFTP/WinSCP and for
   SFTP in the FTP spec list; the FTP spec page lists only FTP and FTP over SSL. Treat
   FTPS on port 21 as the supported, documented transport and SSH/SFTP as a bonus that
   needs a live check.

### Manual path (no automation)

1. Open the **ファイルマネージャ** (File Manager / WebFTP) at
   https://secure.xserver.ne.jp/xapanel/login/xserver/ftp/ — it accepts FTP credentials or
   an XServerアカウント login.
2. Navigate `<ドメイン名>` → `public_html`.
3. Upload `robots.txt`, `sitemap.xml`, `llms.txt`, `<indexnow-key>.txt` (drag & drop is
   supported since the 2020 renewal).
4. Use 「新しいフォルダの作成」 (create new folder) to make `.well-known`, then upload
   `botcentral.txt` into it — see the next section for the caveat.

## The `.well-known/` problem

**Status: UNVERIFIED in official documentation, but with strong indirect evidence that
it works, and a clean automated route that sidesteps the question entirely.**

What the official docs *do* say:

- `man_tool_file.php` lists the file manager's capabilities — 「新しいファイルの作成が
  できます」, 「新しいフォルダの作成ができます」, upload, edit, permissions, rename, delete,
  compress/extract — but says **nothing** about hidden files, dotfiles, 隠しファイル, or
  names beginning with a dot. Neither does the 2020 file-manager renewal announcement
  (`news_detail.php?view_id=7039`), which lists drag & drop, copy, and zip/gzip/tar.
- The strongest official signal is from `man_server_htaccess.php`. The panel's .htaccess
  editor covers only one file — 「本機能は、「(設定対象ドメイン名)/public_html/.htaccess」
  ファイルを編集することができます。」 — and for any other directory it instructs the
  customer: 「その他のフォルダに設置する.htaccessファイルの編集をすることができません。
  ファイルマネージャやFTPソフトウェアによる編集、設置を行ってください。」 — *"you cannot
  edit .htaccess files placed in other folders [with this feature]; edit and place them
  using the File Manager or FTP software."* XServer therefore officially directs
  customers to **create dot-prefixed files through the file manager and FTP**. That is a
  dot-*file*, not a dot-*directory*, so it is evidence rather than proof.
- XServer itself ships a dot-directory in every account tree: `.spamassassin`, listed in
  `man_server_folder.php` beside `public_html`. The filesystem plainly accepts them.

What was searched and came back empty: `エックスサーバー .well-known ディレクトリ` and
`エックスサーバー ファイルマネージャ 隠しファイル ドットファイル 表示 .htaccess`, both
restricted to `xserver.ne.jp`; plus the file manager manual, the file manager renewal
announcement, and the manual index. No page mentions `.well-known` or dotfile display.

**Practical conclusion:** for the CiteFleet script this is a non-issue. rclone over
FTPS or SFTP creates `.well-known/` with an ordinary MKD/mkdir against a Linux
filesystem — no UI is involved, so the file manager's dotfile display behaviour is
irrelevant to the automated path. It only matters for a customer doing it by hand, and
even then XServer's own .htaccess instructions point at the same two tools. If a
customer reports that the file manager hides or refuses the folder, fall back to
DNS TXT (below) rather than debugging the panel.

## Gotchas

1. **AIクローラー遮断設定 (AI Crawler Blocking) silently defeats the entire pack.**
   サーバーパネル → **AIクローラー遮断設定**. 「本機能は、AIクローラーからサイトへの
   アクセスを遮断する機能です。」 It blocks by **User-Agent at the server**, not via
   robots.txt — the string "robots.txt" does not appear on the manual page at all. When
   ON it blocks 21 agents including **ClaudeBot, Claude-User, Claude-SearchBot,
   anthropic-ai, claude-web, GPTBot, ChatGPT-User, OAI-SearchBot, Google-Extended,
   PerplexityBot, meta-externalagent, CCbot, MistralAI-User, Bytespider, cohere-ai**.
   Default is 「初期状態では「OFF(無効)」です。」 and 「設定はドメインごととなります。」
   (per domain). If a customer has turned this ON, uploading `llms.txt` and
   `.well-known/botcentral.txt` accomplishes nothing — the crawlers that would read them
   get blocked before they see the file. **The setup script should tell the customer to
   check this, and ideally the verifier should flag a domain that 403s a
   ClaudeBot-flavoured User-Agent while serving the same path fine to curl.**
2. **No panel feature generates or overrides robots.txt.** The サーバーパネル manual index
   carries AIクローラー遮断設定, .htaccess, アクセス制限, アクセス拒否設定, ads.txt, and
   WAF設定 — there is no robots.txt item. A physical `public_html/robots.txt` is the only
   robots.txt on a plain XServer site.
3. **ads.txt設定 is the precedent for the panel writing into your web root.** It edits
   `(設定対象ドメイン名)/public_html/ads.txt` and 「編集対象のファイルが存在しない場合は、
   編集内容を確定する時点で自動的に生成します。」 — it auto-creates the file. It touches
   only `ads.txt`, so it will not collide with the five files, but it proves the panel
   does write files into `public_html` behind the customer's back. (It also works on the
   primary domain only; subdomains need the file manager or FTP.)
4. **.htaccess is co-owned.** The .htaccess manual warns that existing content may have
   been written automatically by サーバーパネル features or by WordPress, and says to
   verify the site still renders after editing: 「編集後はWebサイトが正常に表示されるかを
   必ずご確認ください。」 Never have the setup script rewrite `public_html/.htaccess`
   wholesale — appending is the most it should ever do, and it does not need to touch it
   at all for these five files.
5. **アクセス制限 (BASIC認証) will 401 every crawler.** サーバーパネル → **アクセス制限**
   applies Basic auth per folder — 「指定のフォルダに対してBASIC認証をかけることが
   できます。」 The passwords live in the `htpasswd` sibling directory. A staging site left
   behind Basic auth will serve all five files to FTP and none to Google.
6. **WAF設定** is available in the same panel and can block requests at the HTTP layer.
   Always verify over HTTPS with a real fetch, never by trusting the FTP listing.
7. **Default document priority.** XServer serves `index.html`/`index.htm`/etc. by a fixed
   priority order (`man_ftp_setting.php`). Irrelevant to the five files — each is fetched
   by its exact path — but it matters if a WordPress install is later dropped at the
   domain root, since XServer's own migration guidance is to delete stray `index.html`
   first.
8. **WordPress簡単インストール gives no overwrite warning.** `man_install_auto_word.php`
   documents install/uninstall but contains **no** caution about pre-existing files in the
   target directory. Verified by reading the page, not assumed. If a customer runs it into
   `public_html` after the pack is installed, re-verify the five URLs afterwards — and
   note that a WordPress SEO plugin will then start serving its own virtual
   `robots.txt`/`sitemap.xml`, which a physical file on disk normally wins against but
   which should be re-checked.
9. **The main FTP password is the server password.** See "If the main FTP account is used"
   above. Scope a sub-FTP account instead of storing the master credential.
10. **FTPS TLS version floor. UNVERIFIED.** XServer's news feed carries an announcement
    about retiring TLS 1.0/1.1 for FTPS connections; the announcement page was not
    fetched, so no URL is cited here and no date or exact scope is claimed. Modern rclone
    negotiates TLS 1.2+ by default, so this is expected to be a non-issue — flagged only
    so nobody pins an old TLS version.

## If files cannot be placed

XServer gives real filesystem access on every documented plan, so "cannot be placed" is
unlikely. The realistic partial failures and their fallbacks:

- **`.well-known/` refused by the file manager (hand-install only).** Use the apex DNS TXT
  proof instead: `botcentral-verify=citefleet-app` on the apex record. XServer customers
  frequently run their DNS at XServer (DNSレコード設定 in サーバーパネル) or at their
  registrar; either way the TXT route avoids the dot-directory entirely. This is the
  documented alternative to `.well-known/botcentral.txt` and costs nothing in coverage.
- **Customer will not share FTP credentials.** Ship the five files as a zip plus the
  numbered manual steps above; the file manager supports zip extraction server-side.
- **Files upload but do not serve.** Check, in this order: アクセス制限 (Basic auth),
  WAF設定, and AIクローラー遮断設定 — the first two break the fetch for everyone, the third
  breaks it only for the AI crawlers the pack exists to serve, which makes it the easiest
  to miss.

## Sources

- https://www.xserver.ne.jp/manual/man_ftp_add.php — the verbatim absolute path
  `/home/xsample/example.com/public_html/`; サブFTPアカウント設定 creation flow and the
  アクセス可能ディレクトリ scoping field.
- https://www.xserver.ne.jp/manual/man_program_cron.php — the generic absolute path
  `/home/サーバーID/独自ドメイン名/public_html/abc.php`; Cron lives in サーバーパネル.
- https://www.xserver.ne.jp/manual/man_server_folder.php — the full initial folder layout:
  `.spamassassin`, `autoreply`, `htpasswd`, `log`, `mail`, `public_html`, `script`,
  `xserver_php`, plus top-level `<サーバーID>.xsrv.jp` and `ssl`.
- https://www.xserver.ne.jp/support/faq/service_ftp_public_html_folder.php — public_html is
  the ドキュメントルート; files above it are not published.
- https://www.xserver.ne.jp/support/faq/service_ftp_setting_upload.php — site files go in
  `<domain>/public_html/`; `example.com/public_html/abc.html` → `http://example.com/abc.html`.
- https://www.xserver.ne.jp/manual/man_ftp_setting.php — FTP host pattern
  `sv***.xserver.jp`, username = サーバーID, password from the サーバーアカウント設定完了
  メール and shared with the server password; sub-account username form `追加名@ドメイン名`;
  PASV mode advice; default document priority order.
- https://www.xserver.ne.jp/manual/man_ftp_info_check.php — サーバーパネル → FTPアカウント
  設定 → FTPソフト設定 tab shows host and username; FTP password = server password ≠
  XServerアカウント password; reset only via the サーバーパスワード再設定フォーム.
- https://www.xserver.ne.jp/support/faq/service_ftp_setting_method.php — main vs sub FTP
  account credential table; password location in the setup email.
- https://www.xserver.ne.jp/manual/man_ftp_spec.php — connection port **21** (10021 for
  localhost); FTP over SSL 使用可能; unlimited FTP accounts; ファイルマネージャ 使用可能.
- https://www.xserver.ne.jp/support/faq/service_ftp_overssl.php — FTP over SSL is supported
  with compatible client software.
- https://www.xserver.ne.jp/manual/man_ftp_filezilla_setting.php — the official client
  settings: protocol「FTP - ファイル転送プロトコル」, encryption「明示的な FTP over TLS が
  必要」(explicit FTPS), logon type 通常.
- https://www.xserver.ne.jp/support/faq/service_ftp_access.php — sub FTP accounts can be
  restricted to a specific directory.
- https://www.xserver.ne.jp/manual/man_server_ssh.php — SSH設定 lives in サーバーパネル;
  default OFF; public-key authentication only (パスワード認証は利用できません); OpenSSH key
  format only; port 10022; host `<サーバーID>.xsrv.jp` or `sv***.xserver.jp`.
- https://www.xserver.ne.jp/manual/man_server_ssh_connect_tera.php — TCP port 10022,
  username = サーバーID, public-key auth confirmed again.
- https://www.xserver.ne.jp/manual/man_server_spec.php — SSH 利用可能, telnet 利用できません,
  .htaccess and mod_rewrite 利用可能; no plan-level restriction stated for SSH.
- https://www.xserver.ne.jp/manual/man_tool_file.php — ファイルマネージャ login URL
  https://secure.xserver.ne.jp/xapanel/login/xserver/ftp/ and its capabilities (create
  file, create folder, upload, edit, permissions, rename, delete, compress/extract); **no**
  mention of dotfiles or hidden-file display.
- https://www.xserver.ne.jp/news_detail.php?view_id=7039 — 2020 file-manager renewal
  feature list (drag & drop move and upload, copy, zip/gzip/tar); again no dotfile mention.
- https://www.xserver.ne.jp/manual/man_server_htaccess.php — panel editor covers only
  `(ドメイン名)/public_html/.htaccess`; for other folders XServer instructs the customer to
  use ファイルマネージャ or FTP software; warning that .htaccess content may be written
  automatically by panel features or WordPress.
- https://www.xserver.ne.jp/support/faq/service_server_htaccess.php — .htaccess is usable
  (「はい、ご利用いただけます。」).
- https://www.xserver.ne.jp/manual/man_server_ai_crawler.php — AIクローラー遮断設定 blocks
  AI crawler access per domain, default OFF, and lists the 21 blocked agents including
  ClaudeBot, Claude-User, Claude-SearchBot, GPTBot, OAI-SearchBot, Google-Extended,
  PerplexityBot; robots.txt is never mentioned, confirming it is a User-Agent block.
- https://www.xserver.ne.jp/manual/man_server_ads.php — ads.txt設定 edits and auto-creates
  `(ドメイン名)/public_html/ads.txt`; primary domain only, subdomains need file manager/FTP.
- https://www.xserver.ne.jp/manual/man_server_limit.php — アクセス制限 applies BASIC認証 to
  a chosen folder from サーバーパネル.
- https://www.xserver.ne.jp/manual/man_install_auto_word.php — WordPress簡単インストール
  procedure; confirmed it contains **no** warning about overwriting existing files.
- https://www.xserver.ne.jp/manual/man_tool_info.php — XServerアカウント (billing/account,
  https://secure.xserver.ne.jp/xapanel/login/xserver/) vs サーバーパネル (server settings,
  https://secure.xserver.ne.jp/xapanel/login/xserver/server/).
- https://www.xserver.ne.jp/manual/ — manual index; the サーバー section lists AIクローラー
  遮断設定, .htaccess, アクセス制限, アクセス拒否設定, ads.txt, WAF設定, SSH設定,
  ファイルマネージャ, Cron設定 — and no robots.txt feature.
