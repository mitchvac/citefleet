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
| `README.md` | Human overview, local run, VPS deploy summary. |
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
| `src/routes/` | TanStack file routes. `index.tsx` = Command (onboard form), `sites/$id.tsx` = campaign view, `fleet.tsx`, `activity.tsx`, `ops.tsx`, `playbook.tsx`, `learn/*` (course, glossary, quiz), `health.ts`, `llms[.]txt.ts`, `sitemap[.]xml.ts`, `__root.tsx` (AuthProvider shell). `routeTree.gen.ts` is generated — do not hand-edit. |
| `src/components/citefleet/` | UI. `Shell.tsx` (nav/layout), `CommandBoard.tsx` (site cards + "Onboard a property" form + GitHub token), `CampaignView.tsx` (per-site: BotCentral listing, "Origin files → GitHub" attach/push form, tasks), `FleetView.tsx`, `ControlPlane.tsx` (kill switch), `GrokHandoff.tsx`, `Quiz.tsx`, `training/Mocks.tsx` (course screenshots-as-JSX). |
| `src/lib/citefleet/` | Domain logic. `types.ts` (Site, Task, Bot, StoreShape), `store.ts` + `persist.ts` (workspace store, Postgres-backed), `fleet-api.ts` (server fns: onboard/dispatch/audit/runTask/publishListing/attachGithub/setGithubToken), `client.ts` (`useFleet` hook the UI calls), `dispatcher.ts` (`onboardSite`, `dispatchSite`), `auditor.ts`, `playbook.ts` + `bots.ts` (task templates + fleet roster), `botcentral.ts` (catalog lookup/publish; card sends `verifyToken`), `verify-token.ts` + `verify-token.test.ts` (per-domain HMAC BotCentral proof token, the `botcentral-verify=` line), `github.ts` (attach repo config, push origin pack via GitHub contents API — needs PAT), `originPack.ts` (robots/sitemap/llms/.well-known files), `grokApi.ts` + `grokBriefs.ts`, `monitor.ts`, `autopilot.ts`, `control.ts` (freeze/kill switch), `reconcile.ts`, `ops.server.ts` (server-only barrel), `seed.ts` (demo workspace incl. resonanse.app), `course.ts` / `glossary.ts` (learn content). |
| `src/lib/auth/` | better-auth wiring: server, client, gates, middleware, providers, email/password, PGlite dialect for preview. |
| `src/lib/app-data/` | Typed app-data client + errors; has node tests. |
| `src/lib/multiplayer/` | P2P presence helpers. |
| `src/lib/` (loose) | `db.ts` (pg pool), `error-component.tsx`, preview-host bridge + embedder-origin helpers. |
| `src/styles.css` | Tailwind entry + glass theme. |
| `server/middleware/` | Nitro middleware (`grok-pwa.ts`). |
| `migrations/` | SQL applied by `scripts/migrate.mjs`: `0001_citefleet.sql` (workspace tables), `auth/0001_auth.sql` (better-auth tables). Number the next one sequentially. |
| `scripts/` | Node build/ops helpers with co-located `*.test.mjs`: `with-app-env.mjs` + `app-env-plugin.mjs` (env injection), `migrate.mjs` + `migration-plan.mjs`, `preview*.mjs`, `browser-smoke*.mjs`, `brand-check.mjs`, `check-auth-invariant.mjs`, `grok-pwa-*.mjs` + `install-page.html`, `sign-out-plan.mjs`, `write-atomic.mjs`. |
| `public/` | Static origin files for citefleet.app itself: `robots.txt`, `sitemap.xml`, `llms.txt`, `.well-known/botcentral.txt`, IndexNow key `22406cb37e296b837c68788f5454badc.txt`, `favicon.svg`, `__grok/` PWA install assets. |
| `deploy/` | Shared-VPS deploy: `DEPLOY-VPS.md`, `deploy-vps.sh`, `run-detached.sh`, `nginx-citefleet.app.conf`, `.env.production.example`. Container binds `127.0.0.1:3021`. |
| `tests/e2e/` | Playwright specs run headed against live citefleet.app (`E2E_CHANNEL=chrome` on macOS 13). `typeSlow.ts` = shared clear-then-type helper (asserts the value). `citefleet-forms.spec.ts` onboards resonanse.app. `wflowprocess-index.spec.ts` follows the Training module order for the real domain wflowprocess.app: lessons + quiz, onboard (skipped if a WflowProcess card exists; `E2E_REONBOARD=1` forces), Live audit, campaign board + attach `mitchvac/wflowprocess` folder `frontend/public`, List on BotCentral (soft-asserted), confirm listing, Monitor cycle, Audit log. Neither spec clicks "Push origin files" (commits to the customer repo) or the kill switch. |

## Conventions that bite

- Onboard form sends `github.root: "public"`; correct it on the campaign view's
  Folder field for repos whose web root differs (wflowprocess → `frontend/public`).
- BotCentral proof: the card's `verifyToken` and the `botcentral-verify=<token>` line in the
  origin pack's `.well-known/botcentral.txt` come from `verify-token.ts` (HMAC of the apex domain,
  keyed by `BOTCENTRAL_VERIFY_SECRET` or `BOTCENTRAL_SERVICE_TOKEN`), persisted as `site.verifyToken`.
  Listing fails with "ownership not proven" until that file (or an apex DNS TXT) is live at the origin.
  The persisted value wins, so rotating the key only changes tokens for sites that never had one persisted.
- `attachGithub` refuses repo `citefleet` for any site other than citefleet.app.
- "Save repo" only stores config. "Push origin files" writes to GitHub and needs
  a classic PAT with repo scope saved on Command (or `GITHUB_TOKEN` server-side).
- "List on BotCentral" / "Refresh BotCentral card" POSTs to the BotCentral
  catalog — an outward action; kill switch on Monitor blocks it.
- `test-results/` is Playwright output (videos, screenshots, traces); never commit.
