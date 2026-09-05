#!/usr/bin/env bash
#
# CiteFleet — 2026-09-05 scoring audit + BotCentral reconciliation.
# Applies CF-1..CF-4 and step 1 to a clean checkout, then runs the truth gate.
#
#   CF-1  blocked work no longer earns 45% partial credit
#   CF-2  score buckets moved to playbook.ts; `monitor` excluded from the card
#         denominator and reported as its own state (green/regressed/held/not run)
#   CF-3  the botcentral_list task is derived from the live card in BOTH
#         directions; a catalog error or 429 revokes nothing
#   CF-4  resolved by CF-1 (verified against the original formula, no separate fix)
#   step1 BotCentral quality/rank read off the card already fetched and shown
#         beside CiteFleet's scores; verification.note into blockedReason
#
# Fail-closed: refuses to run unless the working tree is clean.
# Postcondition-checked: asserts the files actually changed before reporting
# success, because an exit code of 0 is not evidence that anything was written.
#
# Usage:  ./apply-scoring-fixes.sh            apply, then run the gate
#         ./apply-scoring-fixes.sh --check    dry run; verify only, write nothing
#         ./apply-scoring-fixes.sh --no-gate  apply, skip typecheck/lint/test/build

set -euo pipefail

write_patch() {
cat <<'CITEFLEET_PATCH_EOF'
diff --git a/AGENTS.md b/AGENTS.md
index 8d5c4ea..aa5fa09 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -43,8 +43,8 @@ Playwright for e2e. Node 20. ESM (`"type": "module"`).
 | Folder | Purpose |
 | --- | --- |
 | `src/routes/` | TanStack file routes. `index.tsx` = Command (onboard form), `sites/$id.tsx` = campaign view, `login.tsx` = sign-in / create-account page (Google, GitHub, email; token fallback), `api/login.ts` + `api/logout.ts` + `api/signup.ts` = session cookie set/clear and invite-only sign-up, `api/oauth/{google,github}.ts` + `*-callback.ts` + `providers.ts` = OAuth start/callback/availability, `api/hooks/github.ts` = GitHub webhook POST endpoint (signed, per-property secret), `api/hooks/deployed.ts` = generic signed deploy hook for any CI ({domain}), `fleet.tsx`, `activity.tsx`, `ops.tsx`, `playbook.tsx`, `learn/*` (course, glossary, quiz; `learn/$slug.tsx` redirects `/learn/botcentral?prefix=…` to `/topup`), `topup.tsx` = public BotCentral API-key top-up page (opens/reads a BotCentral invoice from the browser; operator-only Confirm payment), `health.ts`, `llms[.]txt.ts`, `sitemap[.]xml.ts`, `__root.tsx` (AuthProvider shell). `routeTree.gen.ts` is generated — do not hand-edit. |
-| `src/components/citefleet/` | UI. `Shell.tsx` (nav/layout; the `NAV` array is the only place nav items are declared — desktop and mobile both map it — and carries Command, Monitor, Grok Fleet, Playbook, Audit log, Training, Add credit (the /topup page), plus the external BotCentral link), `CommandBoard.tsx` (site cards + "Onboard a property" form + GitHub token), `CampaignView.tsx` (per-site: BotCentral listing, "Origin files → GitHub" attach/push form, "Automatic listing" proof + webhook panel, tasks, Remove property), `FleetView.tsx` (roster + Run <bot>; renders `fleet.error` so a kill-switch refusal is visible), `ControlPlane.tsx` (kill switch), `GrokHandoff.tsx`, `Quiz.tsx`, `AssetPicker.tsx` (glass-themed accessible listbox for the /topup "Pay with" asset; replaces the OS-native select; keeps a hidden `name="asset"` input), `PayQr.tsx` (scan-to-pay panel on an open invoice: QR plus copyable address / amount / destination tag or memo; renders nothing when BotCentral bound no treasury address), `PayTrust.tsx` (who takes the payment, what it buys, whether it settles from the chain or by hand, and that nothing recurs — a crypto-payment page reads as a scam without it; every claim must stay true), `training/Mocks.tsx` (course screenshots-as-JSX). |
-| `src/lib/citefleet/` | Domain logic. `types.ts` (Site, Task, Bot, StoreShape), `store.ts` + `persist.ts` (workspace store, Postgres-backed), `fleet-api.ts` (server fns: onboard/dispatch/audit/runTask/publishListing/attachGithub/setGithubToken), `client.ts` (`useFleet` hook the UI calls), `dispatcher.ts` (`onboardSite`, `dispatchSite`), `auditor.ts`, `playbook.ts` + `bots.ts` (task templates + fleet roster), `botcentral.ts` (catalog lookup/publish; card sends `verifyToken`), `verify-token.ts` + `verify-token.test.ts` (the shared BotCentral proof token `citefleet-app` and the `botcentral-verify=` line), `proof.ts` + `proof.test.ts` (pre-flight proof check with BotCentral's rules: well-known file, else apex DNS TXT; `waitForProof` retries), `hosting.ts` + `hosting.test.ts` (server-only: hosting provider from DNS + response headers — Vercel/Netlify/GitHub Pages/Cloudflare/self-hosted/unreachable, same-box-as-CiteFleet flag, deploys-on-push), `hosting-hint.ts` (browser-safe: `HostingResult` type, labels, `hostingHint` — the only hosting module a component may import), `auditor.test.ts` (fetch-stubbed audit integration), `client-bundle-guard.test.ts` (refuses any component/route whose direct import carries a top-level `node:` import), `webhook.ts` + `webhook.test.ts` (GitHub webhook intake: HMAC verify, event classification, per-property secret), `github.ts` (attach repo config, push origin pack via GitHub contents API — needs PAT), `originPack.ts` (robots/sitemap/llms/.well-known files), `grokApi.ts` + `grokBriefs.ts`, `monitor.ts`, `autopilot.ts`, `control.ts` (freeze/kill switch), `reconcile.ts`, `ops.server.ts` (server-only barrel), `seed.ts` (fresh empty workspace: fleet on standby, engine matrix, no properties — customers are never in code), `course.ts` / `glossary.ts` (learn content), `qr.ts` + `qr.test.ts` (dependency-free QR encoder — byte mode, EC level M, versions 1–10; the test pins matrices generated by the `qrcode` npm package, which is never a repo dependency), `pay-uri.ts` + `pay-uri.test.ts` (what a payment QR carries, branching on the invoice's `pay.matching`: BIP-21 for Bitcoin, EIP-681 for Ethereum, SEP-0007 for Stellar, the bare address elsewhere; amount-matched chains never show a memo because they have no memo field), `topup.ts` + `topup.test.ts` (browser-safe top-up; the page adds a dollar AMOUNT, minimum $5, and BotCentral credits that amount to the key's balance, which each API call draws down at $1.00: `parseTopupSearch`, `openTopupInvoice`/`fetchTopupInvoice` against BotCentral `/v1/jobs`, `payInstructions`, `settleRequestBody`), `topup.server.ts` (`settleTopup`: operator-confirmed settlement → BotCentral `POST /internal/jobs/settle` with the service token; behind the `spend` kill door; logs to the audit log). |
+| `src/components/citefleet/` | UI. `Shell.tsx` (nav/layout; the `NAV` array is the only place nav items are declared — desktop and mobile both map it — and carries Command, Monitor, Grok Fleet, Playbook, Audit log, Training, Add credit (the /topup page), plus the external BotCentral link), `CommandBoard.tsx` (site cards + "Onboard a property" form + GitHub token), `CampaignView.tsx` (per-site: BotCentral listing, `ReconcilePanel` — CiteFleet's `overall` beside BotCentral's `quality` and its six components, "Origin files → GitHub" attach/push form, "Automatic listing" proof + webhook panel, tasks, Remove property), `FleetView.tsx` (roster + Run <bot>; renders `fleet.error` so a kill-switch refusal is visible), `ControlPlane.tsx` (kill switch), `GrokHandoff.tsx`, `Quiz.tsx`, `AssetPicker.tsx` (glass-themed accessible listbox for the /topup "Pay with" asset; replaces the OS-native select; keeps a hidden `name="asset"` input), `PayQr.tsx` (scan-to-pay panel on an open invoice: QR plus copyable address / amount / destination tag or memo; renders nothing when BotCentral bound no treasury address), `PayTrust.tsx` (who takes the payment, what it buys, whether it settles from the chain or by hand, and that nothing recurs — a crypto-payment page reads as a scam without it; every claim must stay true), `training/Mocks.tsx` (course screenshots-as-JSX). |
+| `src/lib/citefleet/` | Domain logic. `types.ts` (Site, Task, Bot, StoreShape), `store.ts` + `persist.ts` (workspace store, Postgres-backed; `recalcScores` reads the buckets from `playbook.ts`) + `store.test.ts` (scoring regressions: blocked earns no credit, `monitor` is scored by nothing, the `waiting` thresholds), `fleet-api.ts` (server fns: onboard/dispatch/audit/runTask/publishListing/attachGithub/setGithubToken), `client.ts` (`useFleet` hook the UI calls), `dispatcher.ts` (`onboardSite`, `dispatchSite`), `auditor.ts`, `playbook.ts` + `bots.ts` (task templates + fleet roster; `playbook.ts` also owns `SCORE_BUCKETS` / `SCORED_PLAYBOOK_IDS` / `scoredTasks` — the ONE definition of which tasks feed a score, shared by `recalcScores` and the campaign card so the two cannot drift apart), `botcentral.ts` + `botcentral.test.ts` (catalog lookup/publish; card sends `verifyToken`; `lookupListing` reads the card's `verification.method`/`note` into `listed`/`verified`/`verificationNote` and the home page's `score`/`rank` into `quality`/`rank`; the pure `listingTransition` decides grant/revoke/none for the `botcentral_list` task), `verify-token.ts` + `verify-token.test.ts` (the shared BotCentral proof token `citefleet-app` and the `botcentral-verify=` line), `proof.ts` + `proof.test.ts` (pre-flight proof check with BotCentral's rules: well-known file, else apex DNS TXT; `waitForProof` retries), `hosting.ts` + `hosting.test.ts` (server-only: hosting provider from DNS + response headers — Vercel/Netlify/GitHub Pages/Cloudflare/self-hosted/unreachable, same-box-as-CiteFleet flag, deploys-on-push), `hosting-hint.ts` (browser-safe: `HostingResult` type, labels, `hostingHint` — the only hosting module a component may import), `auditor.test.ts` (fetch-stubbed audit integration), `client-bundle-guard.test.ts` (refuses any component/route whose direct import carries a top-level `node:` import), `webhook.ts` + `webhook.test.ts` (GitHub webhook intake: HMAC verify, event classification, per-property secret), `github.ts` (attach repo config, push origin pack via GitHub contents API — needs PAT), `originPack.ts` (robots/sitemap/llms/.well-known files), `grokApi.ts` + `grokBriefs.ts`, `monitor.ts`, `autopilot.ts`, `control.ts` (freeze/kill switch), `reconcile.ts`, `ops.server.ts` (server-only barrel), `seed.ts` (fresh empty workspace: fleet on standby, engine matrix, no properties — customers are never in code), `course.ts` / `glossary.ts` (learn content), `qr.ts` + `qr.test.ts` (dependency-free QR encoder — byte mode, EC level M, versions 1–10; the test pins matrices generated by the `qrcode` npm package, which is never a repo dependency), `pay-uri.ts` + `pay-uri.test.ts` (what a payment QR carries, branching on the invoice's `pay.matching`: BIP-21 for Bitcoin, EIP-681 for Ethereum, SEP-0007 for Stellar, the bare address elsewhere; amount-matched chains never show a memo because they have no memo field), `topup.ts` + `topup.test.ts` (browser-safe top-up; the page adds a dollar AMOUNT, minimum $5, and BotCentral credits that amount to the key's balance, which each API call draws down at $1.00: `parseTopupSearch`, `openTopupInvoice`/`fetchTopupInvoice` against BotCentral `/v1/jobs`, `payInstructions`, `settleRequestBody`), `topup.server.ts` (`settleTopup`: operator-confirmed settlement → BotCentral `POST /internal/jobs/settle` with the service token; behind the `spend` kill door; logs to the audit log). |
 | `src/lib/auth/` | `operator-core.ts` + test (single-operator gate, pure: constant-time token compare, in-memory sessions, per-IP lockout, cookie attributes), `operator.server.ts` (requireOperator, /api/login + /api/logout handlers), `operator-middleware.ts` (dual-safe `operatorMiddleware` on every server fn in fleet-api.ts), `operator-allowlist.ts` + test (invite-only: CITEFLEET_OPERATOR_EMAILS gates sign-up, email sign-in and OAuth), `login-messages.ts` + test (the line /login shows for every `?error=` code; the test scans operator.server.ts, oauth.server.ts, operator-core.ts and users.server.ts so no server-emitted code can fall back to the generic "Sign-in failed."), `users.server.ts` (email/password accounts in `citefleet_users`, scrypt), `oauth.server.ts` (Google/GitHub authorization-code flow → same session; a VERIFIED provider email is required — Google `verified_email`, GitHub verified `/user/emails` only — then the allow-list, both checked before any upsert or token storage; never remove either check). Password sign-in shares the per-IP lockout with the token path and always runs `verifyUser` before the allow-list so timing is uniform. The rest is better-auth wiring (server, client, gates, `middleware.ts` — unused while auth is off, providers, email/password). |
 | `src/lib/app-data/` | Typed app-data client + errors; has node tests. |
 | `src/lib/multiplayer/` | P2P presence helpers. |
@@ -95,4 +95,30 @@ Playwright for e2e. Node 20. ESM (`"type": "module"`).
   written `<address>?tag=…`, which makes the invoice quote the operator's own memo instead of the job id — required when the
   treasury is an exchange deposit account (XLM, HBAR and CC are).
   `VITE_BOTCENTRAL_URL` (build-time) points the browser at a local catalog for dev; production is botcentral.org.
+- Scoring (`recalcScores` in `store.ts`, buckets in `playbook.ts`): `done` pays 100%, `assigned`/`running`
+  pay 45%, and everything else — **including `blocked`** — pays 0. Blocked is a stall waiting on a person,
+  not work in flight; paying it partial credit reported Mentions 45 on a site with zero mention work done
+  (2026-09-05 audit). `monitor` is in no bucket and is excluded from the campaign card's "N/M playbook
+  tasks" total too — it is the recurring watch, reported as `monitor: green | regressed | held | not run`
+  from the last cycle's snapshot rather than counted as a checklist item. Add a playbook id and
+  `store.test.ts` fails until it is put in a bucket or explicitly excluded.
+- The `botcentral_list` task's state is DERIVED from the live card on every `loadState`, in both
+  directions (`listingTransition`). BotCentral revalidates origins every ~6h and does not auto-unpublish,
+  so a rotted listing stays listed and reports `verification.method: "unverified"` — that revokes the task
+  (status `blocked`, reason on `blockedReason`, an audit-log line) and the UI says "unverified" rather
+  than "Live". A catalog ERROR revokes nothing (fail slowly: an outage is not a delisting), and a card
+  with no `verification` block at all is UNKNOWN, not unproven, so it never revokes either.
+- BotCentral rate limits: `/v1/site/{d}`, `/v1/site/{d}/pages`, `/v1/score`, `/v1/search`, `/v1/changes`,
+  `/v1/snapshot` and `/mcp` all draw on **one** bucket — 30/min anonymous, keyed by client IP. `lookupListing`
+  runs server-side, so the whole install shares that one bucket, and `hydrateListings` spends one call per
+  site per `loadState`. Measured 2026-09-05 (`x-ratelimit-remaining` decrements across endpoints). An ETag
+  does NOT help: the budget is spent before a 304 can return. The fix is a partner key in BotCentral's
+  `BOTCENTRAL_PARTNER_KEYS` (300/min, free), presented as `x-botcentral-key` — **never** a `bc_live_`
+  customer key, which bills $1.00 per read. `lookupListing` sends no auth today; keep it that way until a
+  partner key exists. A 429 arrives as `error`, which revokes nothing (see `listingTransition`).
+- The reconciliation panel reports both scores and does not advise. Only ~40 of BotCentral's 100 points
+  (proof, freshness) are probe-verified; the rest are publisher-declared, and the last consent point is
+  reachable only by conceding text-and-data mining (`tdm: "open"`). Do not add a target, a "gap to 100",
+  or per-component maxima here — those belong to BotCentral's planned `next: []` array, and a number to
+  chase would push customers to declare more rather than do more.
 - `test-results/` is Playwright output (videos, screenshots, traces); never commit.
diff --git a/src/components/citefleet/CampaignView.tsx b/src/components/citefleet/CampaignView.tsx
index 3eaf488..5ca9f76 100644
--- a/src/components/citefleet/CampaignView.tsx
+++ b/src/components/citefleet/CampaignView.tsx
@@ -60,7 +60,29 @@ export function CampaignView({ siteId }: { siteId: string }) {
               <span className="mono">{site.hosting.evidence.join(" · ") || "no signals"}</span>
             </p>
           )}
-          {site.botcentral?.listed ? (
+          {site.botcentral?.listed && site.botcentral.verified === false ? (
+            // The card is still on the catalog, but BotCentral's own recheck no
+            // longer finds the proof token at the origin. Listed, not proven.
+            <p className="mt-2 text-sm text-[#e2c36d]" data-testid="botcentral-unverified">
+              On BotCentral but unverified — the proof token is no longer
+              answering at this origin, so the card is listed without proof.
+              Re-serve <span className="mono">botcentral-verify={site.verifyToken}</span>{" "}
+              (Push origin files, then deploy that repo), then List on BotCentral.
+              {site.botcentral.href ? (
+                <>
+                  {" "}
+                  <a
+                    href={site.botcentral.href}
+                    target="_blank"
+                    rel="noreferrer"
+                    className="underline"
+                  >
+                    inspector
+                  </a>
+                </>
+              ) : null}
+            </p>
+          ) : site.botcentral?.listed ? (
             <p className="mt-2 text-sm text-emerald-300">
               Live on BotCentral —{" "}
               <a
@@ -149,6 +171,8 @@ export function CampaignView({ siteId }: { siteId: string }) {
         <Stat label="Mentions" value={`${site.scores.mentions}`} />
       </div>
 
+      <ReconcilePanel site={site} />
+
       <GithubPanel site={site} fleet={fleet} />
       <AutoListingPanel site={site} fleet={fleet} />
 
@@ -413,6 +437,59 @@ function GithubPanel({
   );
 }
 
+// The two systems score the same site and disagree, because they measure
+// different things: CiteFleet's `overall` is how many playbook doors are closed;
+// BotCentral's `quality` is crawl priority for the declared home page. Nothing
+// reconciled them, so a site could read 59 here and 93 there with no way to see
+// which was stale. Both numbers now sit side by side.
+//
+// Read from the card `hydrateListings` already fetches — no extra request. That
+// matters: /v1/site, /v1/score, /v1/search and /v1/changes share ONE 30/min
+// IP-keyed bucket for the entire install.
+//
+// No target, no "gap to 100", no per-component maximum. About 40 of the 100
+// points are probe-verified (proof, freshness); the rest are publisher-declared,
+// and the last consent point is only purchasable by conceding text-and-data
+// mining. A number to chase here would push customers to declare more rather
+// than do more, so this panel reports and does not advise.
+function ReconcilePanel({ site }: { site: Site }) {
+  const bc = site.botcentral;
+  if (!bc?.listed || typeof bc.quality !== "number") return null;
+  const delta = bc.quality - site.scores.overall;
+  return (
+    <div className="glass rounded-3xl p-5" data-testid="reconcile">
+      <div className="flex flex-wrap items-baseline justify-between gap-3">
+        <h2 className="text-sm font-semibold">Scores side by side</h2>
+        <p className="text-xs text-[#9b95b3]">
+          CiteFleet <span className="text-[#cfc8e8]">{site.scores.overall}</span> — doors closed ·
+          BotCentral <span className="text-[#cfc8e8]">{bc.quality}</span> — crawl priority ·{" "}
+          <span className={Math.abs(delta) >= 20 ? "text-[#e2c36d]" : "text-[#9b95b3]"}>
+            {delta > 0 ? "+" : ""}
+            {delta} apart
+          </span>
+        </p>
+      </div>
+      {bc.rank ? (
+        <div className="mt-4 flex flex-wrap gap-2">
+          {Object.entries(bc.rank).map(([part, points]) => (
+            <span
+              key={part}
+              className="mono rounded-full border border-white/10 px-3 py-1 text-xs text-[#cfc8e8]"
+            >
+              {part} <span className="text-[#9b95b3]">{points}</span>
+            </span>
+          ))}
+        </div>
+      ) : null}
+      <p className="mt-3 text-xs text-[#9b95b3]">
+        proof and freshness are checked against the live origin; the rest is read from
+        the card as published.
+        {bc.verificationNote ? ` ${bc.verificationNote}` : ""}
+      </p>
+    </div>
+  );
+}
+
 function Stat({ label, value }: { label: string; value: string }) {
   return (
     <div className="glass rounded-3xl p-5">
diff --git a/src/components/citefleet/CommandBoard.tsx b/src/components/citefleet/CommandBoard.tsx
index 235408f..7fa48a6 100644
--- a/src/components/citefleet/CommandBoard.tsx
+++ b/src/components/citefleet/CommandBoard.tsx
@@ -2,7 +2,8 @@ import { Link } from "@tanstack/react-router";
 import { useEffect, useRef, useState } from "react";
 import { useFleet } from "@/lib/citefleet/client";
 import { Pill, Score } from "./Shell";
-import type { Site, Task } from "@/lib/citefleet/types";
+import { scoredTasks } from "@/lib/citefleet/playbook";
+import type { Site, SiteMonitor, Task } from "@/lib/citefleet/types";
 
 function statusTone(status: string) {
   if (["done", "indexed", "covered", "ok"].includes(status)) return "good" as const;
@@ -42,7 +43,7 @@ export function CommandBoard() {
     return <p className="text-rose-300">{fleet.error || "Workspace unavailable"}</p>;
   }
 
-  const { sites, bots, tasks, engines, activity, workspace } = fleet.store;
+  const { sites, bots, tasks, engines, activity, workspace, control } = fleet.store;
   const openTasks = tasks.filter((t) => t.status !== "done").length;
   const working = bots.filter((b) => b.status === "working" || b.status === "assigned").length;
   const rankedSites = [...sites].sort((a, b) => {
@@ -164,6 +165,7 @@ export function CommandBoard() {
               key={site.id}
               site={site}
               tasks={tasks.filter((t) => t.siteId === site.id)}
+              monitor={control.snapshots[site.id]}
               busy={fleet.busy}
               onDispatch={() => fleet.dispatch(site.id)}
               onAudit={() => fleet.audit(site.id)}
@@ -360,9 +362,23 @@ function Field({
   );
 }
 
+/**
+ * The recurring watch is not a checklist item, so it is reported as state rather
+ * than counted toward a total. Every branch is a real value from the last
+ * monitor cycle (`drift` is set when any non-info check failed); "not run" means
+ * no snapshot exists, never "fine".
+ */
+function monitorState(monitor?: SiteMonitor) {
+  if (!monitor) return { label: "not run", className: "text-[#9b95b3]" };
+  if (monitor.blockedByKill) return { label: "held", className: "text-[#e2c36d]" };
+  if (monitor.drift) return { label: "regressed", className: "text-[#e2c36d]" };
+  return { label: "green", className: "text-emerald-300" };
+}
+
 function SiteCard({
   site,
   tasks,
+  monitor,
   busy,
   onDispatch,
   onAudit,
@@ -370,12 +386,17 @@ function SiteCard({
 }: {
   site: Site;
   tasks: Task[];
+  monitor?: SiteMonitor;
   busy: string | null;
   onDispatch: () => void;
   onAudit: () => void;
   onPublish: () => void;
 }) {
-  const done = tasks.filter((t) => t.status === "done").length;
+  // Count exactly the tasks the three scores average, so this total and the
+  // Technical / Submissions / Mentions figures describe the same work. `monitor`
+  // is scored by nothing and is excluded from both (see SCORE_BUCKETS).
+  const scored = scoredTasks(tasks);
+  const done = scored.filter((t) => t.status === "done").length;
   return (
     <article className="glass rounded-3xl p-6">
       <div className="flex flex-wrap items-start justify-between gap-4">
@@ -390,7 +411,13 @@ function SiteCard({
                 rel="noreferrer"
                 className="no-underline"
               >
-                <Pill tone="good">Listed on BotCentral</Pill>
+                {/* Listed is not the same as proven: BotCentral leaves a card up
+                    after its 6-hourly recheck stops finding the proof token. */}
+                <Pill tone={site.botcentral.verified === false ? "gold" : "good"}>
+                  {site.botcentral.verified === false
+                    ? "On BotCentral · unverified"
+                    : "Listed on BotCentral"}
+                </Pill>
               </a>
             ) : (
               <Pill tone="gold">Not on BotCentral</Pill>
@@ -452,7 +479,10 @@ function SiteCard({
         <Score label="Mentions" value={site.scores.mentions} />
       </div>
       <p className="mt-4 text-xs text-[#9b95b3]">
-        {done}/{tasks.length} playbook tasks complete
+        {done}/{scored.length} playbook tasks ·{" "}
+        <span className={monitorState(monitor).className}>
+          monitor: {monitorState(monitor).label}
+        </span>
         {site.lastAuditAt
           ? ` · last audit ${new Date(site.lastAuditAt).toLocaleString()}`
           : ""}
diff --git a/src/lib/citefleet/botcentral.test.ts b/src/lib/citefleet/botcentral.test.ts
new file mode 100644
index 0000000..abbc1d9
--- /dev/null
+++ b/src/lib/citefleet/botcentral.test.ts
@@ -0,0 +1,214 @@
+import assert from "node:assert/strict";
+import { afterEach, test } from "node:test";
+import { listingTransition, lookupListing } from "./botcentral.ts";
+import type { ListingStatus } from "./botcentral.ts";
+
+// CF-3 (2026-09-05): the botcentral_list task was granted from a live catalog
+// read but never revoked by one, so a listing that rotted on BotCentral's side
+// went on scoring as a completed submission forever. BotCentral revalidates
+// origins every 6 hours and does NOT auto-unpublish, so the card stays listed
+// and merely reports `verification.method: "unverified"`.
+
+const realFetch = globalThis.fetch;
+afterEach(() => {
+  globalThis.fetch = realFetch;
+});
+
+const stub = (status: number, body: unknown) => {
+  globalThis.fetch = (async () =>
+    ({
+      ok: status >= 200 && status < 300,
+      status,
+      json: async () => body,
+    }) as unknown as Response) as typeof fetch;
+};
+
+const listing = (over: Partial<ListingStatus>): ListingStatus => ({
+  listed: true,
+  verified: true,
+  ...over,
+});
+
+test("lookupListing reads the card's proof state", async () => {
+  stub(200, {
+    domain: "wflowprocess.app",
+    verification: { method: "well-known-file", checked: "2026-09-05T04:47:45Z" },
+  });
+  const proven = await lookupListing("wflowprocess.app");
+  assert.equal(proven.listed, true);
+  assert.equal(proven.verified, true);
+  assert.equal(proven.verificationMethod, "well-known-file");
+});
+
+test("lookupListing reports an unverified card as listed-but-unproven", async () => {
+  stub(200, { domain: "x.test", verification: { method: "unverified" } });
+  const stale = await lookupListing("x.test");
+  assert.equal(stale.listed, true, "BotCentral leaves a downgraded card listed");
+  assert.equal(stale.verified, false);
+  assert.equal(stale.verificationMethod, "unverified");
+});
+
+test("a card with no verification block is UNKNOWN, not unproven", async () => {
+  stub(200, { domain: "x.test" });
+  const old = await lookupListing("x.test");
+  assert.equal(old.listed, true);
+  assert.equal(old.verified, undefined);
+});
+
+test("a 404 is a definitive not-listed; an error is not", async () => {
+  stub(404, {});
+  assert.deepEqual(await lookupListing("gone.test"), { listed: false });
+
+  globalThis.fetch = (async () => {
+    throw new Error("connect ECONNREFUSED");
+  }) as typeof fetch;
+  const failed = await lookupListing("x.test");
+  assert.equal(failed.listed, false);
+  assert.equal(failed.error, "connect ECONNREFUSED");
+});
+
+test("CF-3 grant: a proven card completes the task", () => {
+  assert.equal(listingTransition(listing({}), "queued"), "grant");
+  assert.equal(listingTransition(listing({}), "blocked"), "grant");
+  // Already done — nothing to do, and no repeated audit-log noise every poll.
+  assert.equal(listingTransition(listing({}), "done"), "none");
+});
+
+test("CF-3 revoke: an unproven card un-completes the task", () => {
+  // The reported drift: listed but no longer proven.
+  assert.equal(
+    listingTransition(listing({ verified: false }), "done"),
+    "revoke",
+  );
+  // The card is gone from the catalog entirely.
+  assert.equal(
+    listingTransition({ listed: false }, "done"),
+    "revoke",
+  );
+});
+
+test("CF-3 fail slowly: an unreachable catalog revokes nothing", () => {
+  // This is the case that must never revoke — a transient outage is not
+  // evidence that a customer's listing went away.
+  assert.equal(
+    listingTransition({ listed: false, error: "catalog 502" }, "done"),
+    "none",
+  );
+  assert.equal(
+    listingTransition({ listed: false, error: "catalog unreachable" }, "done"),
+    "none",
+  );
+  // Verified 2026-09-05: /v1/score, /v1/site and /v1/search share ONE 30/min
+  // IP-keyed bucket, and hydrateListings spends one call per site per loadState
+  // from a single VPS address. A burst is a routine event, not a hypothetical —
+  // and without this guard it would un-list every customer at once.
+  assert.equal(
+    listingTransition({ listed: false, error: "catalog 429" }, "done"),
+    "none",
+  );
+});
+
+test("CF-3: an UNKNOWN verification block never revokes on its own", () => {
+  // A shape change on BotCentral's side must not un-list every customer.
+  assert.equal(
+    listingTransition(listing({ verified: undefined }), "done"),
+    "none",
+  );
+  assert.equal(
+    listingTransition(listing({ verified: undefined }), "queued"),
+    "grant",
+  );
+});
+
+test("CF-3: a not-yet-done task is never revoked (nothing to take away)", () => {
+  for (const status of ["queued", "assigned", "running", "blocked", "failed"] as const) {
+    assert.equal(
+      listingTransition(listing({ verified: false }), status),
+      "none",
+      `${status} should not be revoked`,
+    );
+  }
+});
+
+// Step 1 (2026-09-05): CiteFleet and BotCentral scored the same site 21 points
+// apart and nothing reconciled them. The breakdown was already arriving on every
+// card fetch and being discarded. Shapes below are copied from the live
+// production card for wflowprocess.app, not invented.
+
+test("the card's quality and component breakdown are read off the home page", async () => {
+  stub(200, {
+    domain: "wflowprocess.app",
+    verification: { method: "well-known-file", note: "Token matched /.well-known/botcentral.txt (plain text)." },
+    pages: [
+      { rel: "page", url: "https://wflowprocess.app/privacy", score: 82, rank: { proof: 23, role: 7 } },
+      {
+        rel: "home",
+        url: "https://wflowprocess.app/",
+        score: 93,
+        rank: { proof: 23, consent: 19, freshness: 15, crawl: 15, role: 15, surface: 6 },
+      },
+    ],
+  });
+  const card = await lookupListing("wflowprocess.app");
+  // The home entry, not pages[0] — position is not the contract, `rel` is.
+  assert.equal(card.quality, 93);
+  assert.deepEqual(card.rank, {
+    proof: 23,
+    consent: 19,
+    freshness: 15,
+    crawl: 15,
+    role: 15,
+    surface: 6,
+  });
+  // The components must sum to the quality, or one of them was dropped.
+  assert.equal(
+    Object.values(card.rank ?? {}).reduce((a, b) => a + b, 0),
+    card.quality,
+  );
+});
+
+test("quality falls back to the first page when nothing is marked home", async () => {
+  stub(200, { domain: "x.test", pages: [{ rel: "page", score: 82, rank: { proof: 23 } }] });
+  const card = await lookupListing("x.test");
+  assert.equal(card.quality, 82);
+});
+
+test("a card with no pages yields no score rather than a zero", async () => {
+  // A missing score must never render as 0 — that would read as "scored badly".
+  stub(200, { domain: "x.test" });
+  const card = await lookupListing("x.test");
+  assert.equal(card.quality, undefined);
+  assert.equal(card.rank, undefined);
+});
+
+test("non-numeric rank entries are dropped, not coerced", async () => {
+  stub(200, {
+    domain: "x.test",
+    pages: [{ rel: "home", score: 50, rank: { proof: 25, consent: "nineteen", freshness: null } }],
+  });
+  const card = await lookupListing("x.test");
+  assert.deepEqual(card.rank, { proof: 25 });
+});
+
+test("the proof note is carried through for the blocked reason", async () => {
+  stub(200, {
+    domain: "x.test",
+    verification: {
+      method: "unverified",
+      note: "Origin and robots.txt are reachable. Add DNS TXT botcentral-verify=<token> or a plain-text /.well-known/botcentral.txt.",
+    },
+  });
+  const card = await lookupListing("x.test");
+  assert.equal(card.verified, false);
+  assert.match(card.verificationNote ?? "", /Add DNS TXT/);
+  // And it still revokes — reading the note must not change the decision.
+  assert.equal(listingTransition(card, "done"), "revoke");
+});
+
+test("a verification block with a note but no method stays UNKNOWN", async () => {
+  stub(200, { domain: "x.test", verification: { note: "check pending" } });
+  const card = await lookupListing("x.test");
+  assert.equal(card.verified, undefined);
+  assert.equal(card.verificationNote, "check pending");
+  assert.equal(listingTransition(card, "done"), "none");
+});
diff --git a/src/lib/citefleet/botcentral.ts b/src/lib/citefleet/botcentral.ts
index 75df327..f4e8214 100644
--- a/src/lib/citefleet/botcentral.ts
+++ b/src/lib/citefleet/botcentral.ts
@@ -1,7 +1,7 @@
-import type { Site, StoreShape } from "./types";
-import { PLAYBOOK, applyPlaybookHrefs, playbookToTaskDraft } from "./playbook";
-import { getStore, mutateStore, recalcScores } from "./store";
-import { stripSecrets } from "./github";
+import type { Site, StoreShape, TaskStatus } from "./types";
+import { PLAYBOOK, applyPlaybookHrefs, playbookToTaskDraft } from "./playbook.ts";
+import { getStore, logActivity, mutateStore, recalcScores } from "./store.ts";
+import { stripSecrets } from "./github.ts";
 import { siteVerifyToken } from "./verify-token.ts";
 
 const DEFAULT_URL = "https://botcentral.org";
@@ -9,6 +9,13 @@ const FETCH_UA = "CiteFleetPublisher/1.0 (+https://citefleet.app)";
 
 export type ListingStatus = {
   listed: boolean;
+  /** See Site["botcentral"].verified — `undefined` is "unknown", never "unproven". */
+  verified?: boolean;
+  verificationMethod?: string;
+  verificationNote?: string;
+  /** BotCentral's crawl-priority score for the home page, and its components. */
+  quality?: number;
+  rank?: Record<string, number>;
   href?: string;
   api?: string;
   updated?: string;
@@ -29,9 +36,58 @@ export function publisherReady() {
   return serviceToken().length >= 16;
 }
 
+/**
+ * Read the card's proof state. BotCentral revalidates every listed origin on a
+ * 6-hour cycle and reports `method: "unverified"` once an origin stops serving
+ * its proof — the card stays listed and is simply no longer proven. A card that
+ * carries no `verification` block at all is UNKNOWN, not unproven: returning
+ * `undefined` there keeps a shape change on BotCentral's side from silently
+ * revoking every listing here.
+ */
+function cardVerification(card: Record<string, unknown>) {
+  const block = card.verification;
+  if (!block || typeof block !== "object") {
+    return { verified: undefined, verificationMethod: undefined };
+  }
+  const { method: raw, note } = block as { method?: unknown; note?: unknown };
+  const method = typeof raw === "string" ? raw : undefined;
+  const verificationNote = typeof note === "string" ? note : undefined;
+  if (!method) {
+    return { verified: undefined, verificationMethod: undefined, verificationNote };
+  }
+  return { verified: method !== "unverified", verificationMethod: method, verificationNote };
+}
+
+/**
+ * BotCentral's own score for this origin, read off the card CiteFleet already
+ * fetches — no extra request, which matters because /v1/site, /v1/score,
+ * /v1/search and /v1/changes all draw on ONE 30/min IP-keyed bucket shared by
+ * the whole install (measured 2026-09-05).
+ *
+ * The card carries no top-level score; the home page entry does. Match on
+ * `rel: "home"` rather than trusting position, and fall back to the first page.
+ */
+function cardQuality(card: Record<string, unknown>) {
+  const pages = Array.isArray(card.pages)
+    ? (card.pages as Array<Record<string, unknown>>)
+    : [];
+  const home = pages.find((p) => p.rel === "home") ?? pages[0];
+  if (!home) return { quality: undefined, rank: undefined };
+  const quality = typeof home.score === "number" ? home.score : undefined;
+  const raw = home.rank;
+  if (!raw || typeof raw !== "object") return { quality, rank: undefined };
+  const rank: Record<string, number> = {};
+  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
+    if (typeof value === "number") rank[key] = value;
+  }
+  return { quality, rank: Object.keys(rank).length ? rank : undefined };
+}
+
 function listingFromCard(host: string, card: Record<string, unknown>): ListingStatus {
   return {
     listed: true,
+    ...cardVerification(card),
+    ...cardQuality(card),
     href: `${catalogUrl()}/site/${host}`,
     api: `${catalogUrl()}/v1/site/${host}`,
     updated: typeof card.updated === "string" ? card.updated : undefined,
@@ -59,6 +115,30 @@ export async function lookupListing(domain: string): Promise<ListingStatus> {
   }
 }
 
+/**
+ * Whether a live catalog read should grant, revoke, or leave alone the
+ * `botcentral_list` task. Pure so the rule can be tested without a store.
+ *
+ * The asymmetry is deliberate:
+ *  - GRANT needs the card to be listed AND not affirmatively unproven.
+ *  - REVOKE needs an ANSWER. `error` means the catalog was unreachable, which is
+ *    evidence of nothing; a transient outage must never un-list a customer.
+ *  - `verified === undefined` (a card with no verification block at all) is
+ *    UNKNOWN, not unproven, so it never revokes on its own. Only BotCentral
+ *    saying `method: "unverified"` does.
+ */
+export type ListingTransition = "grant" | "revoke" | "none";
+
+export function listingTransition(
+  listing: ListingStatus,
+  taskStatus: TaskStatus,
+): ListingTransition {
+  const proven = listing.listed && listing.verified !== false;
+  if (proven) return taskStatus === "done" ? "none" : "grant";
+  if (listing.error) return "none";
+  return taskStatus === "done" ? "revoke" : "none";
+}
+
 function defaultTopics(site: Site): string[] {
   const words = `${site.name} ${site.summary}`
     .toLowerCase()
@@ -195,13 +275,26 @@ export async function hydrateListings(_store?: StoreShape): Promise<StoreShape>
           store.tasks.push(task);
         }
       }
-      if (task && update.listing.listed && task.status !== "done") {
+      // This task's state is derived from the live card, in BOTH directions.
+      // Granting only (the old behaviour) let a listing rot on BotCentral's side
+      // — it revalidates origins every 6 hours and does not auto-unpublish, so a
+      // downgraded site stays listed and merely stops being proven — while
+      // CiteFleet went on scoring it as a completed submission forever.
+      //
+      // Revoking requires an ANSWER, not a silence: `error` means the catalog was
+      // unreachable, which is not evidence of anything. Fail slowly — a transient
+      // outage must never un-list a customer.
+      const now = new Date().toISOString();
+      const move = task ? listingTransition(update.listing, task.status) : "none";
+      if (task && move === "grant") {
         task.status = "done";
-        task.completedAt = update.listing.updated || new Date().toISOString();
+        task.completedAt = update.listing.updated || now;
+        task.blockedReason = undefined;
+        task.updatedAt = now;
         task.checklist = task.checklist.map((c) => ({ ...c, done: true }));
         task.evidence.unshift({
           id: crypto.randomUUID(),
-          at: new Date().toISOString(),
+          at: now,
           kind: "http",
           label: "Live on BotCentral",
           detail: update.listing.href,
@@ -209,6 +302,37 @@ export async function hydrateListings(_store?: StoreShape): Promise<StoreShape>
           ok: true,
         });
         recalcScores(store, site.id);
+      } else if (task && move === "revoke") {
+        // BotCentral's own note names the exact remediation ("Add DNS TXT
+        // botcentral-verify=<token> or a plain-text /.well-known/botcentral.txt")
+        // and is more specific than anything phrased from this side.
+        const reason = update.listing.listed
+          ? `Listed on BotCentral but no longer proven (${update.listing.verificationMethod ?? "unverified"}). ${update.listing.verificationNote ?? "Re-serve the proof token at the origin, then List on BotCentral."}`
+          : "The BotCentral card for this domain is gone from the catalog.";
+        task.status = "blocked";
+        task.blockedReason = reason;
+        task.completedAt = undefined;
+        task.updatedAt = now;
+        task.checklist = task.checklist.map((c) => ({ ...c, done: false }));
+        task.evidence.unshift({
+          id: crypto.randomUUID(),
+          at: now,
+          kind: "http",
+          label: update.listing.listed
+            ? "BotCentral listing unproven"
+            : "BotCentral listing gone",
+          detail: reason,
+          url: update.listing.href,
+          ok: false,
+        });
+        logActivity(store, {
+          actor: "botcentral",
+          kind: "monitor",
+          message: `${site.domain}: ${reason}`,
+          siteId: site.id,
+          taskId: task.id,
+        });
+        recalcScores(store, site.id);
       }
     }
     applyPlaybookHrefs(store.tasks, store.sites);
diff --git a/src/lib/citefleet/control.ts b/src/lib/citefleet/control.ts
index 68132df..51dfaa5 100644
--- a/src/lib/citefleet/control.ts
+++ b/src/lib/citefleet/control.ts
@@ -1,5 +1,5 @@
 import type { ActDoor, ControlPlane, KillSwitch, PlaybookId, StoreShape } from "./types";
-import { logActivity } from "./store";
+import { logActivity } from "./store.ts";
 
 export const ACT_DOORS: ActDoor[] = [
   "catalog",
diff --git a/src/lib/citefleet/github.ts b/src/lib/citefleet/github.ts
index 3aef32e..a9b670a 100644
--- a/src/lib/citefleet/github.ts
+++ b/src/lib/citefleet/github.ts
@@ -1,9 +1,9 @@
 import type { StoreShape } from "./types";
-import { buildOriginPack } from "./originPack";
+import { buildOriginPack } from "./originPack.ts";
 import { siteVerifyToken } from "./verify-token.ts";
 import { maskStoreSecrets } from "./secrets.ts";
-import { assertCanAct } from "./control";
-import { getStore, logActivity, mutateStore } from "./store";
+import { assertCanAct } from "./control.ts";
+import { getStore, logActivity, mutateStore } from "./store.ts";
 
 const API = "https://api.github.com";
 
diff --git a/src/lib/citefleet/persist.ts b/src/lib/citefleet/persist.ts
index 9a4f464..2fc69b1 100644
--- a/src/lib/citefleet/persist.ts
+++ b/src/lib/citefleet/persist.ts
@@ -1,5 +1,5 @@
-import { getSql } from "../db";
-import { applyPlaybookHrefs } from "./playbook";
+import { getSql } from "../db.ts";
+import { applyPlaybookHrefs } from "./playbook.ts";
 import type { StoreShape } from "./types";
 
 const SNAPSHOT_ID = "default";
diff --git a/src/lib/citefleet/playbook.ts b/src/lib/citefleet/playbook.ts
index c02fcc9..d660056 100644
--- a/src/lib/citefleet/playbook.ts
+++ b/src/lib/citefleet/playbook.ts
@@ -13,6 +13,36 @@ export interface PlaybookStep {
   operatorHint: string;
 }
 
+/**
+ * The playbook ids each score is computed from — the ONE definition, shared by
+ * `recalcScores` (which averages them) and the campaign card (which counts
+ * them). They were separate lists once: the card's denominator was every task
+ * while the scores covered eleven of twelve, so "9/12 complete" and the three
+ * scores were counting different things and finishing `monitor` moved no number.
+ *
+ * `monitor` is deliberately in no bucket. It is the ongoing crawl → index → cite
+ * watch, not a door that closes, so it is scored by nothing — and therefore must
+ * not sit in the completion total either. A total the scores do not use is a
+ * total that misreports progress.
+ */
+export const SCORE_BUCKETS = {
+  technical: ["spa_fallback", "robots_ai", "sitemap", "app_health"],
+  submissions: ["gsc_submit", "bing_webmaster", "indexnow", "botcentral_list"],
+  mentions: ["x_mentions", "directories", "press"],
+} as const satisfies Record<string, readonly PlaybookId[]>;
+
+/** Every id that feeds a score. Excludes `monitor` — see SCORE_BUCKETS. */
+export const SCORED_PLAYBOOK_IDS: readonly PlaybookId[] = [
+  ...SCORE_BUCKETS.technical,
+  ...SCORE_BUCKETS.submissions,
+  ...SCORE_BUCKETS.mentions,
+];
+
+/** Tasks that count toward the campaign card's "N/M playbook tasks complete". */
+export function scoredTasks(tasks: Task[]): Task[] {
+  return tasks.filter((t) => SCORED_PLAYBOOK_IDS.includes(t.playbookId));
+}
+
 export function specLabel(spec: ChecklistSpec) {
   return typeof spec === "string" ? spec : spec.label;
 }
diff --git a/src/lib/citefleet/seed.ts b/src/lib/citefleet/seed.ts
index 163b5c1..1de9ea7 100644
--- a/src/lib/citefleet/seed.ts
+++ b/src/lib/citefleet/seed.ts
@@ -1,6 +1,6 @@
-import { FLEET_TEMPLATE } from "./bots";
-import { ENGINE_MATRIX, applyPlaybookHrefs } from "./playbook";
-import { defaultControl } from "./control";
+import { FLEET_TEMPLATE } from "./bots.ts";
+import { ENGINE_MATRIX, applyPlaybookHrefs } from "./playbook.ts";
+import { defaultControl } from "./control.ts";
 import type { StoreShape } from "./types";
 
 /**
diff --git a/src/lib/citefleet/store.test.ts b/src/lib/citefleet/store.test.ts
new file mode 100644
index 0000000..73cdef6
--- /dev/null
+++ b/src/lib/citefleet/store.test.ts
@@ -0,0 +1,160 @@
+import assert from "node:assert/strict";
+import { test } from "node:test";
+import { recalcScores } from "./store.ts";
+import { PLAYBOOK, SCORED_PLAYBOOK_IDS, scoredTasks } from "./playbook.ts";
+import type { PlaybookId, Site, StoreShape, Task, TaskStatus } from "./types.ts";
+
+// Regression cases for the 2026-09-05 scoring audit (CF-1, CF-2, CF-4).
+// Each `assert` below failed against the code as it stood before that change.
+
+const site = (): Site =>
+  ({
+    id: "s1",
+    workspaceId: "w1",
+    name: "WflowProcess",
+    domain: "wflowprocess.app",
+    url: "https://wflowprocess.app/",
+    summary: "",
+    status: "campaign",
+    scores: { technical: 0, submissions: 0, mentions: 0, overall: 0 },
+    routes: ["/"],
+    engines: [],
+    createdAt: "2026-09-01T00:00:00Z",
+    updatedAt: "2026-09-01T00:00:00Z",
+  }) as unknown as Site;
+
+const task = (playbookId: PlaybookId, status: TaskStatus): Task => ({
+  id: `t-${playbookId}`,
+  siteId: "s1",
+  playbookId,
+  title: playbookId,
+  description: "",
+  status,
+  priority: 3,
+  checklist: [],
+  evidence: [],
+  updatedAt: "2026-09-01T00:00:00Z",
+});
+
+const storeWith = (tasks: Task[]): StoreShape =>
+  ({ sites: [site()], tasks, bots: [], activity: [] }) as unknown as StoreShape;
+
+const scoreOf = (tasks: Task[]) => {
+  const store = storeWith(tasks);
+  recalcScores(store, "s1");
+  return store.sites[0];
+};
+
+const TECHNICAL: PlaybookId[] = ["spa_fallback", "robots_ai", "sitemap", "app_health"];
+const SUBMISSIONS: PlaybookId[] = [
+  "gsc_submit",
+  "bing_webmaster",
+  "indexnow",
+  "botcentral_list",
+];
+const MENTIONS: PlaybookId[] = ["x_mentions", "directories", "press"];
+
+test("CF-1: blocked work earns no credit — it is stalled, not in flight", () => {
+  // The reported defect: three blocked mention tasks and zero done reported 45.
+  const blocked = scoreOf(MENTIONS.map((id) => task(id, "blocked")));
+  assert.equal(blocked.scores.mentions, 0);
+
+  // Positive control — the identical shape with a status that IS in flight must
+  // still pay 45, or this test would pass for the wrong reason.
+  const running = scoreOf(MENTIONS.map((id) => task(id, "running")));
+  assert.equal(running.scores.mentions, 45);
+
+  // ...and completed work still pays in full.
+  const done = scoreOf(MENTIONS.map((id) => task(id, "done")));
+  assert.equal(done.scores.mentions, 100);
+});
+
+test("CF-1: a mix of done and blocked counts only the done half", () => {
+  const s = scoreOf([
+    task("x_mentions", "done"),
+    task("directories", "blocked"),
+    task("press", "blocked"),
+  ]);
+  assert.equal(s.scores.mentions, 33);
+});
+
+test("CF-2: every playbook id is either scored or deliberately excluded", () => {
+  const ids = PLAYBOOK.map((p) => p.id);
+  assert.equal(ids.length, 12);
+  // `monitor` is the recurring watch: scored by nothing, and so excluded from
+  // the completion denominator too. If a new playbook id lands, this fails until
+  // someone decides which side it belongs on.
+  const unscored = ids.filter((id) => !SCORED_PLAYBOOK_IDS.includes(id));
+  assert.deepEqual(unscored, ["monitor"]);
+  assert.equal(SCORED_PLAYBOOK_IDS.length, 11);
+});
+
+test("CF-2: the card denominator counts exactly what the scores average", () => {
+  const all = PLAYBOOK.map((p) => task(p.id, "done"));
+  assert.equal(all.length, 12);
+  // The denominator the card renders...
+  assert.equal(scoredTasks(all).length, 11);
+  // ...and the tasks the three scores actually read.
+  const scoredIds = new Set(scoredTasks(all).map((t) => t.playbookId));
+  for (const id of [...TECHNICAL, ...SUBMISSIONS, ...MENTIONS]) {
+    assert.ok(scoredIds.has(id), `${id} feeds a score but is not in the total`);
+  }
+  assert.ok(!scoredIds.has("monitor"));
+});
+
+test("CF-2: finishing monitor moves no score (it is not in a bucket)", () => {
+  const base = [...TECHNICAL, ...SUBMISSIONS, ...MENTIONS].map((id) =>
+    task(id, "queued"),
+  );
+  const without = scoreOf([...base, task("monitor", "queued")]).scores;
+  const with_ = scoreOf([...base, task("monitor", "done")]).scores;
+  assert.deepEqual(with_, without);
+});
+
+test("CF-4: 'waiting' is no longer reachable on blocked credit", () => {
+  // The exact shape that promoted a site to `waiting` before CF-1: five tasks
+  // done, six blocked. It scored technical 86 / submissions 73 and read as
+  // "done bar the wait" while six things needed a person.
+  const s = scoreOf([
+    task("spa_fallback", "done"),
+    task("robots_ai", "done"),
+    task("sitemap", "done"),
+    task("app_health", "blocked"),
+    task("gsc_submit", "done"),
+    task("bing_webmaster", "done"),
+    task("indexnow", "blocked"),
+    task("botcentral_list", "blocked"),
+    ...MENTIONS.map((id) => task(id, "blocked")),
+    task("monitor", "queued"),
+  ]);
+  assert.equal(s.scores.technical, 75);
+  assert.equal(s.scores.submissions, 50);
+  assert.equal(s.status, "campaign");
+});
+
+test("CF-4: no amount of in-flight work alone reaches the waiting thresholds", () => {
+  // Partial credit caps at 45, below both gates (technical 80, submissions 70),
+  // so `waiting` now requires tasks to have actually finished.
+  const s = scoreOf(
+    [...TECHNICAL, ...SUBMISSIONS].map((id) => task(id, "running")),
+  );
+  assert.equal(s.scores.technical, 45);
+  assert.equal(s.scores.submissions, 45);
+  assert.equal(s.status, "campaign");
+});
+
+test("waiting is still reachable when the work is genuinely done", () => {
+  // Positive control for the two CF-4 cases above: the threshold still works.
+  const s = scoreOf([
+    ...TECHNICAL.map((id) => task(id, "done")),
+    task("gsc_submit", "done"),
+    task("bing_webmaster", "done"),
+    task("indexnow", "done"),
+    task("botcentral_list", "blocked"),
+    ...MENTIONS.map((id) => task(id, "queued")),
+    task("monitor", "queued"),
+  ]);
+  assert.equal(s.scores.technical, 100);
+  assert.equal(s.scores.submissions, 75);
+  assert.equal(s.status, "waiting");
+});
diff --git a/src/lib/citefleet/store.ts b/src/lib/citefleet/store.ts
index de28690..da7763d 100644
--- a/src/lib/citefleet/store.ts
+++ b/src/lib/citefleet/store.ts
@@ -5,8 +5,9 @@ import type {
   StoreShape,
   Task,
 } from "./types";
-import { seedStore } from "./seed";
-import { loadSnapshot, mergeSnapshot, saveSnapshot } from "./persist";
+import { SCORE_BUCKETS } from "./playbook.ts";
+import { seedStore } from "./seed.ts";
+import { loadSnapshot, mergeSnapshot, saveSnapshot } from "./persist.ts";
 
 let cache: StoreShape | null = null;
 let boot: Promise<StoreShape> | null = null;
@@ -103,28 +104,25 @@ export function recalcScores(store: StoreShape, siteId: string) {
   const site = getSite(store, siteId);
   if (!site) return;
   const tasks = store.tasks.filter((t) => t.siteId === siteId);
-  const ratio = (ids: string[]) => {
+  const ratio = (ids: readonly string[]) => {
     const slice = tasks.filter((t) => ids.includes(t.playbookId));
     if (!slice.length) return 0;
     const done = slice.filter((t) => t.status === "done").length;
+    // Work in flight earns partial credit. "blocked" does NOT: a blocked task is
+    // stalled waiting on a person, so paying it 45% reported progress where there
+    // was none (wflowprocess.app showed Mentions 45 with zero mention work done).
+    // It scores 0 here and stays visible as a blocked row for the operator to act on.
     const partial = slice.filter((t) =>
-      ["assigned", "running", "blocked"].includes(t.status),
+      ["assigned", "running"].includes(t.status),
     ).length;
     return Math.round(((done + partial * 0.45) / slice.length) * 100);
   };
-  site.scores.technical = ratio([
-    "spa_fallback",
-    "robots_ai",
-    "sitemap",
-    "app_health",
-  ]);
-  site.scores.submissions = ratio([
-    "gsc_submit",
-    "bing_webmaster",
-    "indexnow",
-    "botcentral_list",
-  ]);
-  site.scores.mentions = ratio(["x_mentions", "directories", "press"]);
+  // Buckets live in playbook.ts so the campaign card's completion total counts
+  // exactly the tasks these scores average. See SCORE_BUCKETS for why `monitor`
+  // is in neither.
+  site.scores.technical = ratio(SCORE_BUCKETS.technical);
+  site.scores.submissions = ratio(SCORE_BUCKETS.submissions);
+  site.scores.mentions = ratio(SCORE_BUCKETS.mentions);
   site.scores.overall = Math.round(
     site.scores.technical * 0.4 +
       site.scores.submissions * 0.3 +
diff --git a/src/lib/citefleet/types.ts b/src/lib/citefleet/types.ts
index 6a0c3df..90ed555 100644
--- a/src/lib/citefleet/types.ts
+++ b/src/lib/citefleet/types.ts
@@ -116,6 +116,35 @@ export interface Site {
   };
   botcentral?: {
     listed: boolean;
+    /**
+     * Whether the live card's proof still resolves on BotCentral's side.
+     * BotCentral revalidates origins on its own schedule and answers
+     * `verification.method: "unverified"` for a card whose proof has stopped
+     * serving — the listing stays up, but it is no longer proven.
+     * `undefined` means the card carried no verification block at all, which is
+     * "unknown", not "unproven": it must never revoke anything on its own.
+     */
+    verified?: boolean;
+    /** The method the card reports: "well-known-file", "dns-txt", "unverified", … */
+    verificationMethod?: string;
+    /** BotCentral's own words on the last proof check — the remediation to show. */
+    verificationNote?: string;
+    /**
+     * BotCentral's crawl-priority score for this origin's home page (0-100) and
+     * its six components, read straight off the card. Kept beside CiteFleet's
+     * own `scores` so the two can be compared: they measure different things and
+     * nothing else reconciles them.
+     *
+     * Deliberately NOT turned into a "gap" or a target here. Roughly 40 of the
+     * 100 points (proof, freshness) are externally verified by BotCentral's
+     * probe; the rest are publisher-declared, and some are only reachable by
+     * conceding rights (`tdm: "open"` pays a point). Which of the remainder are
+     * legitimate to pursue is a judgement about the customer's business, so the
+     * per-component maxima stay BotCentral's to publish rather than ours to
+     * guess.
+     */
+    quality?: number;
+    rank?: Record<string, number>;
     href?: string;
     api?: string;
     updated?: string;
CITEFLEET_PATCH_EOF
}

BASE_COMMIT="80d647cd241fd3271521d8dea3a6e94ac0b06025"
DRY_RUN=0
RUN_GATE=1
for arg in "$@"; do
  case "$arg" in
    --check)   DRY_RUN=1 ;;
    --no-gate) RUN_GATE=0 ;;
    -h|--help) sed -n '2,23p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

say "Preflight"
git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository: $REPO_ROOT"
[ -f package.json ] || die "no package.json — wrong directory?"
[ -f src/lib/citefleet/store.ts ] || die "src/lib/citefleet/store.ts not found — this is not the CiteFleet repo"

HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" != "$BASE_COMMIT" ]; then
  echo "  HEAD     $HEAD_SHA"
  echo "  expected $BASE_COMMIT"
  echo "  The patch was cut against that commit. It may still apply; the check"
  echo "  below decides. This is a warning, not a stop."
fi

# This script may sit in the repo root untracked; that is not uncommitted work.
SELF="$(basename "${BASH_SOURCE[0]}")"
DIRTY="$(git status --porcelain | grep -v -- "$SELF" || true)"
if [ -n "$DIRTY" ]; then
  echo "$DIRTY" | sed 's/^/  /'
  die "working tree is not clean (above). Commit or stash first — a partial apply
       over existing edits is worse than no apply."
fi

# The suite runs with --experimental-strip-types, which Node 20 rejects outright.
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  if [ -x "$HOME/.nvm/versions/node/v22.23.2/bin/node" ]; then
    export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
    echo "  node $NODE_MAJOR too old for the suite — switched to v22.23.2 (nvm)"
  elif [ "$RUN_GATE" -eq 1 ]; then
    echo "  WARNING: node $NODE_MAJOR found, suite needs 22+. 'npm test' will fail."
  fi
fi
echo "  node $(node -v) · git $(git --version | awk '{print $3}')"

PATCH_FILE="$(mktemp -t citefleet-scoring.XXXXXX)"
trap 'rm -f "$PATCH_FILE"' EXIT
write_patch > "$PATCH_FILE"
[ -s "$PATCH_FILE" ] || die "embedded patch is empty — this script is corrupt"
echo "  patch $(grep -c '^diff --git' "$PATCH_FILE") files, $(wc -l < "$PATCH_FILE" | tr -d ' ') lines"

say "Checking the patch applies"
git apply --check "$PATCH_FILE" \
  || die "patch does not apply cleanly against this tree. Nothing was changed."
echo "  clean"

if [ "$DRY_RUN" -eq 1 ]; then
  say "--check given: the patch applies cleanly. Nothing was written."
  exit 0
fi

say "Applying"
git apply --stat "$PATCH_FILE" | sed 's/^/  /'
git apply "$PATCH_FILE" || die "apply failed after passing --check; tree may be dirty"

# An exit code of 0 proves a process ended, not that its artifact exists.
say "Verifying the postcondition"
CHANGED="$(git status --porcelain | grep -v -- "$SELF" | wc -l | tr -d ' ')"
[ "$CHANGED" -ge 13 ] || die "expected 13+ changed paths, git reports $CHANGED — apply did not land"
for f in src/lib/citefleet/store.test.ts src/lib/citefleet/botcentral.test.ts; do
  [ -f "$f" ] || die "$f missing after apply"
done
grep -q 'SCORE_BUCKETS' src/lib/citefleet/playbook.ts \
  || die "playbook.ts has no SCORE_BUCKETS — CF-2 did not land"
if grep -q '"assigned", "running", "blocked"' src/lib/citefleet/store.ts; then
  die "store.ts still pays partial credit for blocked — CF-1 did not land"
fi
grep -q 'listingTransition' src/lib/citefleet/botcentral.ts \
  || die "botcentral.ts has no listingTransition — CF-3 did not land"
grep -q 'ReconcilePanel' src/components/citefleet/CampaignView.tsx \
  || die "CampaignView.tsx has no ReconcilePanel — step 1 did not land"
echo "  $CHANGED paths changed; all five markers present"

if [ "$RUN_GATE" -eq 0 ]; then
  say "Applied. Gate skipped (--no-gate). Nothing committed."
  exit 0
fi

say "Truth gate"
echo "--- typecheck ---" && npm run typecheck
echo "--- lint ---"      && npm run lint
echo "--- test ---"      && npm test 2>&1 | grep -E "^# (tests|pass|fail|skipped)"
echo "--- build ---"     && npm run build 2>&1 | tail -2

say "Done — applied and gated. Nothing committed; review with 'git diff'."
echo "Expected: 318 tests · 310 pass · 8 skipped (.grok/ templates) · 0 fail."
