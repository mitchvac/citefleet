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
| `package.json` / `package-lock.json` | Scripts (`dev`, `build`, `db:migrate`, `typecheck`, `test`, `e2e`, `e2e:headed`, `lint`) and deps. |
| `tsconfig.json` | TS config; `@/` alias → `src/`. |
| `vite.config.ts` | Vite + TanStack Start + Tailwind + app-env / Grok PWA plugins from `scripts/`. |
| `playwright.config.ts` | e2e config: `tests/e2e`, headed, slowMo (`E2E_SLOWMO`, default 400ms), baseURL `E2E_URL` (default https://citefleet.app), video+screenshot on. |
| `eslint.config.mjs` / `.prettierrc` | Lint and format config. |
| `Dockerfile` / `docker-entrypoint.sh` / `.dockerignore` | Production image; entrypoint runs migrations then `npm start`. |
| `.gitignore` | Ignores build output, env files, `test-results/` (Playwright videos/screenshots). |

## Folders

| Folder | Purpose |
| --- | --- |
| `src/routes/` | TanStack file routes. `index.tsx` = Command (onboard form), `sites/$id.tsx` = campaign view, `login.tsx` = sign-in / create-account page (Google, GitHub, email; token fallback), `api/login.ts` + `api/logout.ts` + `api/signup.ts` = session cookie set/clear and invite-only sign-up, `api/oauth/{google,github}.ts` + `*-callback.ts` + `providers.ts` = OAuth start/callback/availability, `api/hooks/github.ts` = GitHub webhook POST endpoint (signed, per-property secret), `api/hooks/deployed.ts` = generic signed deploy hook for any CI ({domain}), `fleet.tsx`, `activity.tsx`, `ops.tsx`, `playbook.tsx`, `learn/*` (course, glossary, quiz; `learn/$slug.tsx` redirects `/learn/botcentral?prefix=…` to `/topup`), `topup.tsx` = public BotCentral API-key top-up page (opens/reads a BotCentral invoice from the browser; operator-only Confirm payment), `health.ts`, `llms[.]txt.ts`, `sitemap[.]xml.ts`, `__root.tsx` (AuthProvider shell). `routeTree.gen.ts` is generated — do not hand-edit. |
| `src/components/citefleet/` | UI. `Shell.tsx` (nav/layout), `CommandBoard.tsx` (site cards + "Onboard a property" form + GitHub token), `CampaignView.tsx` (per-site: BotCentral listing, "Origin files → GitHub" attach/push form, "Automatic listing" proof + webhook panel, tasks, Remove property), `FleetView.tsx` (roster + Run <bot>; renders `fleet.error` so a kill-switch refusal is visible), `ControlPlane.tsx` (kill switch), `GrokHandoff.tsx`, `Quiz.tsx`, `training/Mocks.tsx` (course screenshots-as-JSX). |
| `src/lib/citefleet/` | Domain logic. `types.ts` (Site, Task, Bot, StoreShape), `store.ts` + `persist.ts` (workspace store, Postgres-backed), `fleet-api.ts` (server fns: onboard/dispatch/audit/runTask/publishListing/attachGithub/setGithubToken), `client.ts` (`useFleet` hook the UI calls), `dispatcher.ts` (`onboardSite`, `dispatchSite`), `auditor.ts`, `playbook.ts` + `bots.ts` (task templates + fleet roster), `botcentral.ts` (catalog lookup/publish; card sends `verifyToken`), `verify-token.ts` + `verify-token.test.ts` (the shared BotCentral proof token `citefleet-app` and the `botcentral-verify=` line), `proof.ts` + `proof.test.ts` (pre-flight proof check with BotCentral's rules: well-known file, else apex DNS TXT; `waitForProof` retries), `hosting.ts` + `hosting.test.ts` (server-only: hosting provider from DNS + response headers — Vercel/Netlify/GitHub Pages/Cloudflare/self-hosted/unreachable, same-box-as-CiteFleet flag, deploys-on-push), `hosting-hint.ts` (browser-safe: `HostingResult` type, labels, `hostingHint` — the only hosting module a component may import), `auditor.test.ts` (fetch-stubbed audit integration), `client-bundle-guard.test.ts` (refuses any component/route whose direct import carries a top-level `node:` import), `webhook.ts` + `webhook.test.ts` (GitHub webhook intake: HMAC verify, event classification, per-property secret), `github.ts` (attach repo config, push origin pack via GitHub contents API — needs PAT), `originPack.ts` (robots/sitemap/llms/.well-known files), `grokApi.ts` + `grokBriefs.ts`, `monitor.ts`, `autopilot.ts`, `control.ts` (freeze/kill switch), `reconcile.ts`, `ops.server.ts` (server-only barrel), `seed.ts` (fresh empty workspace: fleet on standby, engine matrix, no properties — customers are never in code), `course.ts` / `glossary.ts` (learn content), `topup.ts` + `topup.test.ts` (browser-safe top-up: `parseTopupSearch`, `openTopupInvoice`/`fetchTopupInvoice` against BotCentral `/v1/jobs`, `payInstructions`, `settleRequestBody`), `topup.server.ts` (`settleTopup`: operator-confirmed settlement → BotCentral `POST /internal/jobs/settle` with the service token; behind the `spend` kill door; logs to the audit log). |
| `src/lib/auth/` | `operator-core.ts` + test (single-operator gate, pure: constant-time token compare, in-memory sessions, per-IP lockout, cookie attributes), `operator.server.ts` (requireOperator, /api/login + /api/logout handlers), `operator-middleware.ts` (dual-safe `operatorMiddleware` on every server fn in fleet-api.ts), `operator-allowlist.ts` + test (invite-only: CITEFLEET_OPERATOR_EMAILS gates sign-up, email sign-in and OAuth), `login-messages.ts` + test (the line /login shows for every `?error=` code; the test scans operator.server.ts, oauth.server.ts, operator-core.ts and users.server.ts so no server-emitted code can fall back to the generic "Sign-in failed."), `users.server.ts` (email/password accounts in `citefleet_users`, scrypt), `oauth.server.ts` (Google/GitHub authorization-code flow → same session; a VERIFIED provider email is required — Google `verified_email`, GitHub verified `/user/emails` only — then the allow-list, both checked before any upsert or token storage; never remove either check). Password sign-in shares the per-IP lockout with the token path and always runs `verifyUser` before the allow-list so timing is uniform. The rest is better-auth wiring (server, client, gates, `middleware.ts` — unused while auth is off, providers, email/password, PGlite dialect for preview). |
| `src/lib/app-data/` | Typed app-data client + errors; has node tests. |
| `src/lib/multiplayer/` | P2P presence helpers. |
| `src/lib/` (loose) | `db.ts` (pg pool), `error-component.tsx`, preview-host bridge + embedder-origin helpers. |
| `src/styles.css` | Tailwind entry + glass theme. |
| `server/middleware/` | Nitro middleware (`grok-pwa.ts`). |
| `migrations/` | SQL applied by `scripts/migrate.mjs`: `0001_citefleet.sql` (workspace tables), `0001_auth.sql` (better-auth tables, copied up), `0002_citefleet_users.sql` + `0003_citefleet_oauth.sql` (accounts + OAuth columns), `auth/0001_auth.sql` (source of the auth copy). Number the next one sequentially. |
| `scripts/` | Node build/ops helpers with co-located `*.test.mjs` (`npm test` needs Node 22; tests that pin the gitignored `.grok/` template files skip when those files are absent): `with-app-env.mjs` + `app-env-plugin.mjs` (env injection), `migrate.mjs` + `migration-plan.mjs`, `preview*.mjs`, `browser-smoke*.mjs`, `brand-check.mjs`, `check-auth-invariant.mjs`, `grok-pwa-*.mjs` + `install-page.html`, `sign-out-plan.mjs`, `write-atomic.mjs`. |
| `public/` | Static origin files for citefleet.app itself: `robots.txt`, `sitemap.xml`, `llms.txt`, `.well-known/botcentral.txt`, `favicon.svg`, `__grok/` PWA install assets. |
| `docs/` | `customer-setup.md` — what a customer does to get listed (proof file or DNS TXT, optional GitHub webhook / deploy hook). `operator-runbook.md` — sign-in, deploy, listing flow, error table, cleanup, tests. |
| `deploy/` | Shared-VPS deploy: `DEPLOY-VPS.md`, `deploy-vps.sh` (re-execs from a private copy; mints the BotCentral service token and the operator token on first run), `run-detached.sh`, `nginx-citefleet.app.conf`, `.env.production.example`. Container binds `127.0.0.1:3021`. |
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
- Session gate: every server fn in `fleet-api.ts` (including `loadState`) carries `operatorMiddleware`; `requireOperator` needs a live session cookie (`citefleet_op`, random id, httpOnly, SameSite=Lax) and passes `assertSameSiteRequest`. Sessions come from /login (email/password, Google, GitHub) or the server token; accounts are INVITE-ONLY via `CITEFLEET_OPERATOR_EMAILS` (fail closed: empty list refuses everyone) — never remove that check from `handleSignup`, `handleLogin` or `finishOAuth`. `useFleet` redirects to `/login` on an "Unauthorized" rejection. Public: `/health`, `llms.txt`, `sitemap.xml`, `/learn/*`, `/topup` (page and invoice reads; only `settleTopupFn` is gated), `/login`, `/api/hooks/*` (signature only). Do NOT use `authMiddleware` (throws when `VITE_AUTH_ENABLED=false` with `DATABASE_URL`). `maskStoreSecrets` still masks the GitHub token and every `site.webhook.secret` in every store copy a browser receives; `webhookSecretFn` always mints a new secret and returns it once.
- Hooks: `/api/hooks/github` verifies `X-Hub-Signature-256`, `/api/hooks/deployed` verifies `X-CiteFleet-Signature`; unknown property and bad signature both answer 401 (no existence oracle); redelivered ids are acknowledged as `duplicate`; one proof check runs per site at a time (`beginCheck`/`endCheck`); `runWebhookListing` (proof with retries → publish) records every outcome on `webhook.lastResult` and the audit log.
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
  `VITE_BOTCENTRAL_URL` (build-time) points the browser at a local catalog for dev; production is botcentral.org.
- `test-results/` is Playwright output (videos, screenshots, traces); never commit.
