# AGENTS.md — CiteFleet (repository map)

Top-level map of the repo: what each folder is, what every root file does, and
where the CiteFleet logic lives. Governance is `PRIME_DIRECTIVE.md` (v9) at the
repo root — read it first (STEP 0), then this file, before touching code.
Rule 18: read this map to LOCATE files; update it in the same change whenever a
file is added, removed, renamed, or materially changed.

> Rule 19 reminder: nothing in this file is authoritative about live production
> state. Probe citefleet.app (`/health`) or the VPS before acting on any claim
> about what is deployed.

## What CiteFleet is

Command center that onboards a customer website ("property"), audits it,
assigns a fleet of Grok specialist bots to a crawl → index → cite playbook
(Google, Bing, IndexNow, ChatGPT, Grok, BotCentral bot-search listing), and
tracks coverage. Live at https://citefleet.app. Workspace state persists in
Postgres (see `migrations/`).

Stack: TanStack Start (file routes) + React 19 + Nitro server + Vite 8 +
Tailwind 4, better-auth for identity, Kysely/pg for the workspace store,
Playwright for e2e. Node 20. ESM (`"type": "module"`).

## Root files

| File | Purpose |
| --- | --- |
| `PRIME_DIRECTIVE.md` | Operator governance v9. Authoritative; read before any code work. |
| `AGENTS.md` | This map. |
| `README.md` | Overview, how a site gets listed, docs index, local run, deploy summary, tests. |
| `package.json` / `package-lock.json` | Scripts (`dev`, `build`, `typecheck`, `test`, `e2e`, `e2e:headed`, `lint`) plus the Supabase CLI wrappers (`db:start`, `db:stop`, `db:reset`, `db:new`, `db:push`, `db:status`, `db:types`) and deps. `build` no longer touches the database. |
| `tsconfig.json` | TS config; `@/` alias → `src/`. |
| `vite.config.ts` | Vite + TanStack Start + Tailwind + app-env / Grok PWA plugins from `scripts/`. |
| `playwright.config.ts` | e2e config: `tests/e2e`, headed, slowMo (`E2E_SLOWMO`, default 400ms), baseURL `E2E_URL` (default https://citefleet.app), video+screenshot on. |
| `eslint.config.mjs` / `.prettierrc` | Lint and format config. |
| `Dockerfile` / `docker-entrypoint.sh` / `.dockerignore` | Production image. The entrypoint does **no** schema work — it only execs the server. Migrations are applied by CI before the container rolls. |
| `.gitignore` | Ignores build output, env files, `test-results/` (Playwright videos/screenshots). |
| `.mcp.json` | Project-scoped MCP config. Supabase server pinned to project ref `suwikadkcqgozlaxfyrv` (CiteFleet — **not** BotCentral's `uthfzbvzaqyhyfnvlqmh`), `--read-only`, access token read from `$SUPABASE_ACCESS_TOKEN` and never committed. Schema changes go through the Supabase CLI, not through MCP. |

## Folders

| Folder | Purpose |
| --- | --- |
| `src/routes/` | TanStack file routes. `index.tsx` = Command (onboard form), `sites/$id.tsx` = campaign view, `login.tsx` = sign-in / create-account page (Google, GitHub, email; token fallback), `api/login.ts` + `api/logout.ts` + `api/signup.ts` = session cookie set/clear and invite-only sign-up, `api/forgot.ts` + `api/reset.ts` + `reset.tsx` = password reset (public; the emailed token is the only credential), `api/me.ts` = the signed-in account for the header avatar (null on the token path), `start.tsx` = public three-step onboarding (BotCentral key → add credit → training), linked from the nav and the Command banner, `api/oauth/{google,github}.ts` + `*-callback.ts` + `providers.ts` = OAuth start/callback/availability, `api/hooks/github.ts` = GitHub webhook POST endpoint (signed, per-property secret), `api/hooks/deployed.ts` = generic signed deploy hook for any CI ({domain}), `api/hooks/botcentral.ts` = BotCentral → CiteFleet catalog events (site.listed / site.reverified / site.lapsed / site.unpublished, signed with the shared service token or `BOTCENTRAL_WEBHOOK_SECRET`; configured on BotCentral as `BOTCENTRAL_PUBLISHER_WEBHOOK`), `fleet.tsx`, `activity.tsx`, `ops.tsx`, `playbook.tsx`, `learn/*` (course, glossary, quiz; `learn/$slug.tsx` redirects `/learn/botcentral?prefix=…` to `/topup`), `topup.tsx` = public BotCentral API-key top-up page (opens/reads a BotCentral invoice from the browser; operator-only Confirm payment), `health.ts` (also reports `billing` on/off, `catalogHook` path and whether `catalogHookSecret` is verifiable), `llms[.]txt.ts`, `sitemap[.]xml.ts`, `__root.tsx` (AuthProvider shell). `routeTree.gen.ts` is generated — do not hand-edit. |
| `src/components/citefleet/` | UI. `Shell.tsx` (nav/layout; the `NAV` array is the only place nav items are declared — desktop and mobile both map it — and carries Get started, Command, Monitor, Grok Fleet, Playbook, Audit log, Training, Add credit (the /topup page), plus the external BotCentral link), `CommandBoard.tsx` (site cards + "Onboard a property" form + GitHub token), `CampaignView.tsx` (per-site: BotCentral listing, `BillingPanel` — the Listing year: the customer's `bc_live_` prefix, the term from `describeTerm`, the 402 top-up link, and the billing switch / hook URL as the server reports them via `billingSettingsFn`; `ReconcilePanel` — CiteFleet's `overall` beside BotCentral's `quality` and its six components, "Origin files → GitHub" attach/push form, "Automatic listing" proof + webhook panel, tasks, Remove property), `FleetView.tsx` (roster + Run <bot>; renders `fleet.error` so a kill-switch refusal is visible), `ControlPlane.tsx` (kill switch), `GrokHandoff.tsx`, `Quiz.tsx`, `AssetPicker.tsx` (glass-themed accessible listbox for the /topup "Pay with" asset; replaces the OS-native select; keeps a hidden `name="asset"` input), `PayQr.tsx` (scan-to-pay panel on an open invoice: QR plus copyable address / amount / destination tag or memo; renders nothing when BotCentral bound no treasury address), `PayTrust.tsx` (who takes the payment, what it buys, whether it settles from the chain or by hand, and that nothing recurs — a crypto-payment page reads as a scam without it; every claim must stay true), `training/Mocks.tsx` (course screenshots-as-JSX). |
| `src/lib/citefleet/` | Domain logic. `types.ts` (Site, Task, Bot, StoreShape), `store.ts` + `persist.ts` (workspace store, Postgres-backed; `recalcScores` reads the buckets from `playbook.ts`) + `store.test.ts` (scoring regressions: blocked earns no credit, `monitor` is scored by nothing, the `waiting` thresholds), `fleet-api.ts` (server fns: onboard/dispatch/audit/runTask/publishListing/attachGithub/setGithubToken/setBillingKey/billingSettings), `client.ts` (`useFleet` hook the UI calls), `dispatcher.ts` (`onboardSite`, `dispatchSite`; `publishSiteToBotCentral` persists `term`/`payment` beside `botcentral` and needs the `spend` door too when a key would be sent; `setBillingKey` stores the customer's `bc_live_` prefix per property), `auditor.ts`, `playbook.ts` + `bots.ts` (task templates + fleet roster; `playbook.ts` also owns `SCORE_BUCKETS` / `SCORED_PLAYBOOK_IDS` / `scoredTasks` — the ONE definition of which tasks feed a score, shared by `recalcScores` and the campaign card so the two cannot drift apart), `botcentral.ts` + `botcentral.test.ts` (catalog lookup/publish; card sends `verifyToken`; `lookupListing` reads the card's `verification.method`/`note` into `listed`/`verified`/`verificationNote` and the home page's `score`/`rank` into `quality`/`rank`; the pure `listingTransition` decides grant/revoke/none for the `botcentral_list` task and `applyCatalogState` applies it to the store — shared by `hydrateListings` and the BotCentral webhook; `billingEnabled` reads `CITEFLEET_BOTCENTRAL_BILLING` and `billingPrefixFor` is the ONE place the switch is consulted; `publishListing` sends `keyPrefix` beside the card only then, reads `term`/`billed` off a 201 and turns a 402 into `payment`), `listing-term.ts` + `listing-term.test.ts` (browser-safe listing-year model: `readTerm`/`readPayment` for BotCentral's shapes, `renewalState` decided by the clock — none/unbilled/active/due/lapsed — `describeTerm` the one sentence the campaign page, the reconcile check and the reminder share, `renewalNotices` + `renewalEmail` for the registrar's 30-day reminder), `catalog-hook.test.ts` (the BotCentral webhook end to end against `applyCatalogState`), `verify-token.ts` + `verify-token.test.ts` (the shared BotCentral proof token `citefleet-app` and the `botcentral-verify=` line), `proof.ts` + `proof.test.ts` (pre-flight proof check with BotCentral's rules: well-known file, else apex DNS TXT; `waitForProof` retries), `hosting.ts` + `hosting.test.ts` (server-only: hosting provider from DNS + response headers — Vercel/Netlify/GitHub Pages/Cloudflare/self-hosted/unreachable, same-box-as-CiteFleet flag, deploys-on-push), `hosting-hint.ts` (browser-safe: `HostingResult` type, labels, `hostingHint` — the only hosting module a component may import), `auditor.test.ts` (fetch-stubbed audit integration), `client-bundle-guard.test.ts` (refuses any component/route whose direct import carries a top-level `node:` import), `webhook.ts` + `webhook.test.ts` (GitHub webhook intake: HMAC verify, event classification, per-property secret; `handleBotcentralWebhook` + `botcentralHookSecret` for BotCentral's signed catalog events — unknown host → 202 ignore, which is how the seed fixtures' rechecks are filtered), `github.ts` (attach repo config, push origin pack via GitHub contents API — needs PAT), `originPack.ts` (robots/sitemap/llms/.well-known files), `grokApi.ts` + `grokBriefs.ts`, `monitor.ts` (control cycle; `sendRenewalNotices` mails every allow-listed operator once per term when a listing year is inside `RENEWAL_WINDOW_DAYS`, and logs the same line either way), `autopilot.ts`, `control.ts` (freeze/kill switch), `reconcile.ts` (checks; `listing-term` is warn inside the renewal window, critical once lapsed), `ops.server.ts` (server-only barrel), `seed.ts` (fresh empty workspace: fleet on standby, engine matrix, no properties — customers are never in code), `course.ts` / `glossary.ts` (learn content), `qr.ts` + `qr.test.ts` (dependency-free QR encoder — byte mode, EC level M, versions 1–10; the test pins matrices generated by the `qrcode` npm package, which is never a repo dependency), `pay-uri.ts` + `pay-uri.test.ts` (what a payment QR carries, branching on the invoice's `pay.matching`: BIP-21 for Bitcoin, EIP-681 for Ethereum, SEP-0007 for Stellar, the bare address elsewhere; amount-matched chains never show a memo because they have no memo field), `topup.ts` + `topup.test.ts` (browser-safe top-up; the page adds a dollar AMOUNT, minimum $5, and BotCentral credits that amount to the key's balance, which each API call draws down at $1.00: `parseTopupSearch`, `openTopupInvoice`/`fetchTopupInvoice` against BotCentral `/v1/jobs`, `payInstructions`, `settleRequestBody`), `topup.server.ts` (`settleTopup`: operator-confirmed settlement → BotCentral `POST /internal/jobs/settle` with the service token; behind the `spend` kill door; logs to the audit log). |
| `src/lib/auth/` | `operator-core.ts` + test (single-operator gate, pure: constant-time token compare, in-memory sessions, per-IP lockout, cookie attributes), `operator.server.ts` (requireOperator, /api/login + /api/logout handlers), `operator-middleware.ts` (dual-safe `operatorMiddleware` on every server fn in fleet-api.ts), `operator-allowlist.ts` + test (invite-only: CITEFLEET_OPERATOR_EMAILS gates sign-up, email sign-in and OAuth), `password-reset.ts` (browser-safe rules: TTL, rejection ordering, link and email body) + `password-reset.server.ts` (`requestReset`/`consumeReset`: SHA-256 token, single-use via a guarded UPDATE, earlier links retired, undeliverable links burned) + `reset.server.ts` (`handleForgot`/`handleReset`) + `password-reset.test.ts`, `login-messages.ts` + test (the line /login shows for every `?error=` code; the test scans operator.server.ts, oauth.server.ts, operator-core.ts and users.server.ts so no server-emitted code can fall back to the generic "Sign-in failed."), `users.server.ts` (email/password accounts in `citefleet_users`, scrypt), `oauth.server.ts` (Google/GitHub authorization-code flow → same session; a VERIFIED provider email is required — Google `verified_email`, GitHub verified `/user/emails` only — then the allow-list, both checked before any upsert or token storage; never remove either check). Password sign-in shares the per-IP lockout with the token path and always runs `verifyUser` before the allow-list so timing is uniform. The rest is better-auth wiring (server, client, gates, `middleware.ts` — unused while auth is off, providers, email/password). |
| `src/lib/mail/` | `smtp.ts` + `smtp.test.ts` — dependency-free SMTP submission to Gmail over implicit TLS (:465), AUTH PLAIN only. The protocol half takes an injected `SmtpIO` so the whole transcript is tested without a socket. Deliberately NOT a mail library: one recipient, plain text, ASCII headers, no retry. Needs `CITEFLEET_SMTP_USER` and `CITEFLEET_SMTP_PASSWORD` (a Google **App Password**; the account password is refused with 535). |
| `src/lib/app-data/` | Typed app-data client + errors; has node tests. |
| `src/lib/multiplayer/` | P2P presence helpers. |
| `src/lib/` (loose) | `db.ts` (the `pg` pool over `DATABASE_URL` — **required**, no embedded fallback, and it performs no DDL), `database.types.ts` (generated by `npm run db:types`; regenerate it in the same change as any migration and never hand-edit), `error-component.tsx`, preview-host bridge + embedder-origin helpers. |
| `src/styles.css` | Tailwind entry + glass theme. |
| `server/middleware/` | Nitro middleware (`grok-pwa.ts`). |
| `supabase/` | Supabase CLI project. `config.toml` pins Postgres `major_version = 17` to match the remote and disables `auth`, `storage` and `realtime` for the local stack — Better Auth owns identity (never Supabase Auth) and nothing in the repo imports `@supabase/*`, so the Data API is unused. `migrations/` is the ONE source of truth for schema, applied by the CLI (`npm run db:reset` locally, the workflow below in CI) and never by the app; add one with `npm run db:new <name>`, then `npm run db:types`. `.gitignore` keeps `.branches`/`.temp` out of git. |
| `.github/workflows/` | `supabase-migrations.yml` — the ONLY path from `supabase/migrations/` to the live database. `verify` replays every migration from empty on a throwaway Postgres and lints it; `deploy` runs `supabase db push` on merge to `main`. Needs repo secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`. |
| `scripts/` | Node build/ops helpers with co-located `*.test.mjs` (`npm test` needs Node 22; tests that pin the gitignored `.grok/` template files skip when those files are absent): `with-app-env.mjs` + `app-env-plugin.mjs` (env injection), `preview*.mjs`, `browser-smoke*.mjs`, `brand-check.mjs`, `check-auth-invariant.mjs`, `grok-pwa-*.mjs` + `install-page.html`, `sign-out-plan.mjs`, `write-atomic.mjs`. |
| `public/` | Static origin files for citefleet.app itself: `robots.txt`, `sitemap.xml`, `llms.txt`, `.well-known/botcentral.txt`, `favicon.svg`, `__grok/` PWA install assets. |
| `docs/` | `customer-setup.md` — what a customer does to get listed (proof file or DNS TXT, optional GitHub webhook / deploy hook). `operator-runbook.md` — sign-in, deploy, listing flow, error table, cleanup, tests. |
| `deploy/` | Shared-VPS deploy: `DEPLOY-VPS.md`, `deploy-vps.sh` (re-execs from a private copy; mints the BotCentral service token and the operator token on first run; **regenerates `.env` from scratch every run**, so an env var added by hand on the box is wiped — add it here, reading from a `/root/citefleet-*` file, as `citefleet-gmail.smtp` does for password-reset mail; `/root/citefleet-billing.on` (existence) → `CITEFLEET_BOTCENTRAL_BILLING=on`, `/root/citefleet-botcentral-webhook.secret` → `BOTCENTRAL_WEBHOOK_SECRET`. Passing no `DATABASE_URL` argument silently falls back to a LOCAL postgres container: always pass the live one), `run-detached.sh`, `nginx-citefleet.app.conf`, `.env.production.example`. Container binds `127.0.0.1:3021`. |
| `tests/e2e/` | Playwright specs run headed against live citefleet.app (`E2E_CHANNEL=chrome` on macOS 13; `E2E_OPERATOR_TOKEN` signs in via `global-setup.ts`, cookie jar in the gitignored `.auth/`). `typeSlow.ts` = shared clear-then-type helper (asserts the value). `list-a-site.spec.ts` follows the Training module order for one customer origin (env `E2E_SITE_NAME`, `E2E_SITE_URL`, `E2E_GH_OWNER`, `E2E_GH_REPO`, `E2E_GH_ROOT`; defaults wflowprocess.app): lessons + quiz, onboard (skipped if a WflowProcess card exists; `E2E_REONBOARD=1` forces), Live audit, campaign board + attach `mitchvac/wflowprocess` folder `frontend/public`, List on BotCentral (soft-asserted), confirm listing, Monitor cycle, teardown via Remove property (only cards named exactly WflowProcess), Audit log. The spec never clicks "Push origin files" (commits to the customer repo) or the kill switch. |

## Conventions that bite

- Onboard form sends `github.root: "public"`; correct it on the campaign view's
  Folder field for repos whose web root differs (wflowprocess → `frontend/public`).
- BotCentral proof: the card's `verifyToken` and the `verify:` / `botcentral-verify=` lines in the origin
  pack's `.well-known/botcentral.txt` are the one shared publisher token `citefleet-app` from
  `verify-token.ts` (operator decision f842b9d). Files CiteFleet wrote before already contain it, so no
  customer redeploy is needed; a new origin needs that line in the file or in an apex DNS TXT record.
  Listing fails with "ownership not proven" until one of those is live.
- `attachGithub` refuses repo `citefleet` for any site other than citefleet.app.
- Remove property (campaign header, `removeSite` in `dispatcher.ts`) drops the site, its tasks, and its
  monitor snapshot; audit log and BotCentral card stay. Onboarding never dedupes by domain.
- A rejected publish keeps an already-listed site listed and attaches the error (`publishSiteToBotCentral`).
- Publish pre-flights the origin proof (`proof.ts`) and refuses locally with the exact line to add; `site.proof` records the last check.
- Session gate: every server fn in `fleet-api.ts` (including `loadState`) carries `operatorMiddleware`; `requireOperator` needs a live session cookie (`citefleet_op`, random id, httpOnly, SameSite=Lax) and passes `assertSameSiteRequest`. Sessions come from /login (email/password, Google, GitHub) or the server token; accounts are INVITE-ONLY via `CITEFLEET_OPERATOR_EMAILS` (fail closed: empty list refuses everyone) — never remove that check from `handleSignup`, `handleLogin` or `finishOAuth`. `useFleet` redirects to `/login` on an "Unauthorized" rejection. Public: `/health`, `llms.txt`, `sitemap.xml`, `/learn/*`, `/topup` (page and invoice reads; only `settleTopupFn` is gated), `/login`, `/reset` + `/api/forgot` + `/api/reset` (the emailed token is the credential), `/api/hooks/*` (signature only). Do NOT use `authMiddleware` (throws when `VITE_AUTH_ENABLED=false` with `DATABASE_URL`). `maskStoreSecrets` still masks the GitHub token and every `site.webhook.secret` in every store copy a browser receives; `webhookSecretFn` always mints a new secret and returns it once.
- Hooks: `/api/hooks/github` verifies `X-Hub-Signature-256`, `/api/hooks/deployed` verifies `X-CiteFleet-Signature`, `/api/hooks/botcentral` verifies `x-botcentral-signature` (see Billing below); unknown property and bad signature both answer 401 (no existence oracle); redelivered ids are acknowledged as `duplicate`; one proof check runs per site at a time (`beginCheck`/`endCheck`); `runWebhookListing` (proof with retries → publish) records every outcome on `webhook.lastResult` and the audit log.
- Task row buttons are "Local audit" and "Send to Grok"; course copy must use those names. The one exception is the
  BotCentral task row, whose run button is "List on BotCentral" because `runTask` publishes for that playbook (outward,
  behind the catalog door) instead of auditing.
- "Save repo" only stores config. "Push origin files" writes to GitHub and needs
  a classic PAT with repo scope saved on Command (or `GITHUB_TOKEN` server-side).
- "List on BotCentral" / "Refresh BotCentral card" POSTs to the BotCentral
  catalog — an outward action; kill switch on Monitor blocks it.
- BotCentral top-up (`/topup`): CiteFleet never verifies a chain payment. The customer opens an invoice
  straight against BotCentral's public `/v1/jobs` from the browser (per-IP cap is BotCentral's);
  BotCentral binds no treasury address yet, so the page says so and the operator takes payment out of
  band, then enters the receipt on the same page. `settleTopupFn` is operator-gated, refuses while the
  `spend` door is killed, and BotCentral credits the `bc_live_` prefix on the service token's word.
  An open invoice is polled against `POST {botcentral}/v1/jobs/{id}/verify`, which reads the chain and settles it:
  RLUSD, XRP, BTC, ETH and XDC confirm automatically; XLM, HBAR and CC stay operator-confirmed (pooled exchange
  deposits share one memo, and Canton has no public API), and `settles_automatically` in that response says which.
  A scan-to-pay QR appears on an open invoice ONLY when BotCentral returns `pay.address`. Eight rails are bound as of
  2026-09-03 (RLUSD and XRP share the XRP Ledger address, plus XLM, BTC, HBAR, XDC, CC, ETH). A BotCentral treasury may be
  written `<address>?tag=…`, which makes the invoice quote the operator's own memo instead of the job id — required when the
  treasury is an exchange deposit account (XLM, HBAR and CC are).
  `VITE_BOTCENTRAL_URL` (build-time) points the browser at a local catalog for dev; production is botcentral.org.
- Password reset: `/login` → "Forgot your password?" → POST `/api/forgot` → email → `/reset?token=` → POST
  `/api/reset` → signed in. `/api/forgot` **always** redirects to `/login?sent=1`, whatever the address
  was: this console is invite-only, so whether an address is a member is exactly what `handleLogin`
  already refuses to leak, and a reset form that answered honestly would hand it straight back.
  `password-reset.test.ts` asserts that against the source and fails if any account-shaped branch gets
  its own redirect. The plaintext token exists only in the email — the row stores its SHA-256. Requests
  share sign-in's per-IP lockout rather than getting a fresh allowance. Mail is optional: with no SMTP
  env the flow answers `mail-unavailable` and nothing else changes.
- Scoring (`recalcScores` in `store.ts`, buckets in `playbook.ts`): `done` pays 100%, `assigned`/`running`
  pay 45%, and everything else — **including `blocked`** — pays 0. Blocked is a stall waiting on a person,
  not work in flight; paying it partial credit reported Mentions 45 on a site with zero mention work done
  (2026-09-05 audit). `monitor` is in no bucket and is excluded from the campaign card's "N/M playbook
  tasks" total too — it is the recurring watch, reported as `monitor: green | regressed | held | not run`
  from the last cycle's snapshot rather than counted as a checklist item. Add a playbook id and
  `store.test.ts` fails until it is put in a bucket or explicitly excluded.
- The `botcentral_list` task's state is DERIVED from the live card on every `loadState`, in both
  directions (`listingTransition`). BotCentral revalidates origins every ~6h and does not auto-unpublish,
  so a rotted listing stays listed and reports `verification.method: "unverified"` — that revokes the task
  (status `blocked`, reason on `blockedReason`, an audit-log line) and the UI says "unverified" rather
  than "Live". A catalog ERROR revokes nothing (fail slowly: an outage is not a delisting), and a card
  with no `verification` block at all is UNKNOWN, not unproven, so it never revokes either.
- BotCentral rate limits: `/v1/site/{d}`, `/v1/site/{d}/pages`, `/v1/score`, `/v1/search`, `/v1/changes`,
  `/v1/snapshot` and `/mcp` all draw on **one** bucket — 30/min anonymous, keyed by client IP. `lookupListing`
  runs server-side, so the whole install shares that one bucket, and `hydrateListings` spends one call per
  site per `loadState`. Measured 2026-09-05 (`x-ratelimit-remaining` decrements across endpoints). An ETag
  does NOT help: the budget is spent before a 304 can return. The fix is a partner key in BotCentral's
  `BOTCENTRAL_PARTNER_KEYS` (300/min, free), presented as `x-botcentral-key` — **never** a `bc_live_`
  customer key, which bills $1.00 per read. `lookupListing` sends no auth today; keep it that way until a
  partner key exists. A 429 arrives as `error`, which revokes nothing (see `listingTransition`).
- The reconciliation panel reports both scores and does not advise. Only ~40 of BotCentral's 100 points
  (proof, freshness) are probe-verified; the rest are publisher-declared, and the last consent point is
  reachable only by conceding text-and-data mining (`tdm: "open"`). Do not add a target, a "gap to 100",
  or per-component maxima here — those belong to BotCentral's planned `next: []` array, and a number to
  chase would push customers to declare more rather than do more.
- Mobile: verified 56/56 page-viewport combinations with no horizontal overflow — every route at
  320 (iPhone SE) / 390 (iPhone 13) / 412 (Pixel 7) / 768 (iPad Mini), measured against the live
  deployment by comparing `document.scrollWidth` to `clientWidth`. Re-measure that way after any
  layout change; reading the markup does not show these. Note a clipped child still reports its full
  `getBoundingClientRect()`, so an element "sticking out" is only a real overflow when no ancestor
  has `overflow-x` set — checking that is what separates the cause from the symptom.
  The five rules this cost, each learned from a real failure:
  1. **A grid or flex CHILD defaults to `min-width:auto`** and grows to its own min-content width,
     ignoring the track. It needs `min-w-0`. This one bug appeared four separate times — the onboard
     aside, the ops probe row, the card column, the audit-log row.
  2. `overflow-x-auto` does nothing without rule 1 on the same element. The 720px engine table had
     the scroll container already; `min-w-0` was the missing half.
  3. `truncate` in a flex row needs `min-w-0` for the same reason, or the text sets the width and
     pushes its siblings off screen instead of ellipsing.
  4. Fixed widths (`w-40`, `min-w-[16rem]`) must be `sm:` prefixed. 16rem is wider than a 320px
     screen's content box.
  5. Any row of pills or buttons needs `flex-wrap`, and grid text columns need `minmax(0,1fr)`
     rather than `1fr`.
  The mobile nav is one horizontally scrolling row, never `flex-wrap`, and it switches to the
  desktop nav at `lg` — nine items plus the logo and Sign out do not fit at `md` (768px).
- Billing — the listing year (BotCentral's brief, 2026-09-06). CiteFleet still charges nobody itself:
  BotCentral debits the CUSTOMER's own `bc_live_` key **$10.00 per host per year** when a PROVEN card
  is written, edits inside the year are free, reads are free, and a year nobody renews lapses (the card
  stays listed, marked unverified, until a publish with a funded key renews it). On this side:
  `Site.billing.keyPrefix` is the billing identity (set on the campaign page, never a secret);
  `publishListing` sends it beside the card as `keyPrefix` **only while `CITEFLEET_BOTCENTRAL_BILLING=on`**
  (`billingPrefixFor` is the one place that is read — off by default, because an unfunded key answers 402
  on every publish, and BotCentral asks that the prefix not be sent until ten dollars has travelled the
  top-up path once). A publish that would carry a key needs the `spend` door open as well as `catalog`.
  BotCentral answers 201 `{card, term, billed}` or 402 `{reason: unknown|revoked|insufficient|lapsed, usd,
  term_days, topup}`; the term and the 402 live on `Site.term` / `Site.payment`, NOT inside
  `Site.botcentral`, because `hydrateListings` rebuilds that from the public card, which carries no
  `paid_until`. Production botcentral.org still ran the interim code (no `term`) on 2026-09-06 — both
  fields are optional and their absence is "no term", never a lapse. Catalog reads still send no
  credential (free anonymous tier). `/topup` still credits the key and sits behind `spend`.
- BotCentral → CiteFleet events: `POST /api/hooks/botcentral`, `x-botcentral-event` +
  `x-botcentral-signature: sha256=HMAC(body)`, signed with `BOTCENTRAL_WEBHOOK_SECRET` when BotCentral
  has one, else with the shared service token (live 2026-09-06: no secret set, same token both sides).
  A bad signature is 401; a host that is not a property is 202 `ignore` (BotCentral's two seed fixtures
  fail every 6-hour pass and would be ~8 audit lines a day); a known host goes through the same
  `applyCatalogState` as a card read, so a `site.reverified` downgrade revokes the task, `site.lapsed`
  records the term and revokes with the renewal wording, `site.listed` grants and clears a pending 402.
  There is no delivery id; applying the same answer twice moves nothing.
- Renewal reminder: BotCentral states the end date once (the publish response) and warns nobody. Each
  control cycle (`runMonitorCycle` → `sendRenewalNotices`) mails every `CITEFLEET_OPERATOR_EMAILS`
  address once per term end when a site is within 30 days, stamps `renewalNoticeFor`, and writes the
  same sentence to the audit log whether or not SMTP is configured; a failed send is retried next cycle.
- Sessions carry an optional `SessionUser` (`operator-core.ts`). The operator TOKEN path deliberately
  has none — it is break-glass with no account behind it — so `/api/me` returning null is normal and
  the header shows nothing rather than a placeholder. Sessions are IN-MEMORY, so every deploy signs
  everyone out; that is a known cost of the current design, not a bug to chase.
- `test-results/` is Playwright output (videos, screenshots, traces); never commit.
