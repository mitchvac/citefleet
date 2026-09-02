XRPTokenizer.app – ULTIMATE PRIME DIRECTIVE v9 (Clean Consolidated Order – Zero Laziness, Full Compliance, Autonomous After Section 1)

Prime Directive updated to v9. This is the single, authoritative, properly ordered version. All previous versions (including v8) are superseded. Every rule must be followed 100% with zero shortcuts, zero assumptions, and zero skipped steps.

> **Provenance (CiteFleet repo copy):** This file is the operator's authoritative Prime Directive v9, copied verbatim on 2026-09-01 from the Hermes repo copy (`hermes-workflow-orchestrator/PRIME_DIRECTIVE.md`), which itself carries the June 2026 `.cursorrules` source of record plus the later additions (Rule 18, Amendment H, Rules 19–21). It is placed here so the `prime-directive-build` STEP 0 can locate governance inside this repository. Stack-specific rules written for xrptokenizer's Next.js/Supabase/XRPL stack translate for this TanStack Start + React 19 + Nitro + Postgres repo: the truth gate here is `npm run typecheck`, `npm run lint`, `npm test`, and the headed Playwright e2e suite (`npm run e2e:headed`) against the live citefleet.app deployment; tokenization/on-chain rules do not apply (this repo touches no chains). The universal governance — Zero Laziness, real-functionality-only, Rule 17 zero-placeholder, Amendment G verify-before-flagging, Rule 18 AGENTS.md navigation, Rule 20 calibrated checks, the TTE protocol — applies unchanged.

---

## Workflow (Step 0 → Sections)

1. **Step 0:** Confirm understanding of the request. List the exact sections I will build (numbered).
2. **Section 1 is interactive** — deliver, then **stop and wait for explicit approval** ("Proceed" / positive confirmation) before continuing.
3. After approval, automatically continue through all remaining sections — no more pausing.
4. Each section: short plan → complete production-ready output → self-verification checklist → output `✅ SECTION [N] VERIFIED AND READY`.
5. End each section with the **Full Directive Compliance Audit (No Laziness Check)** block confirming Rules 1–N followed 100%.

## Rule 1 — Zero Laziness (highest priority)

- The directive is a line-by-line checklist, not a guide. Every bullet executed 100% with fresh tool calls.
- Forbidden phrases (immediate task failure): "close enough", "should be fine", "in the spirit of", "approximately", "I think we covered that", "no need to re-check", "to save time".
- Never skip / approximate / summarize / fast-forward any step.
- **Exception:** See Amendment C below — honest scoping statements are not forbidden phrases.

## E2E Testing Rule (Rules 34–40, mandatory)

When a section modifies/adds/creates a feature for any module (Logistics, Energy, Tokenize Wizard, Payroll, Construction, Food, Pharma, Travel, Services, Insurance, Education, Art):

1. Identify the exact corresponding E2E spec(s) — module-to-test mapping (Logistics → `logistics019.spec.ts`, Tokenize Wizard → all `tokenizer-*.spec.ts`, Construction milestone → `construction-milestone-mint.spec.ts`, etc.).
2. Update / enhance / create the spec to fully cover the new changes.
3. Execute it as part of self-verification using **real wallet, real DB, real chain** flows.
4. Confirm pass end-to-end before marking the section verified.
5. **Read the module code line-by-line BEFORE running the test.**
6. **If the test does not mint an asset, the test has failed.**

## Tokenization Honesty Rule (14)

A module has "real tokenization" only if it does **all** of:
- a) Calls real blockchain SDK (xrpl.js / @solana/web3.js / @hashgraph/sdk)
- b) Builds + signs a real tx (MPTokenIssuanceCreate on XRPL, Token Mint on Solana, TokenAssociate+TokenMint on Hedera)
- c) Uses real wallet signing (Xaman / Solana Wallet Adapter / `@hashgraph/hedera-wallet-connect`)
- d) Submits to mainnet or testnet/devnet

If not all four → say explicitly: *"This module does NOT currently have real tokenization. It only has UI/placeholders/mock functions. Real on-chain minting is missing because [reason]."*

Forbidden phrases unless a–d are actually implemented in live code: "tokenization flow", "ready for XRPL", "MPToken issuance", "real signing".

## Multisig Gate ($100k threshold)

- Below $100k → hot-issuer auto-signs (`isc_status='tokenized'`, `is_tokenized=true`)
- ≥ $100k → multisig pending (`isc_status='submitted'`, `is_tokenized=false`)
- Auto-signing a ≥$100k tx is a security regression — tests must throw on it.

## Zero-Mismatch / FK Rule (highest priority)

- Column names, property keys, enum values, field IDs must be **identical** (case-sensitive) across Supabase tables, generated types, and code.
- FK relationships must be explicitly declared. If missing → provide migration SQL before proceeding.
- Always use auto-generated `database.types.ts` as single source of truth.
- Comment when fixing: `// Mismatch & FK eliminated: names and relationships now 100% match database schema & generated types`

## TypeScript Zero-Error Protocol

- Read `Row` / `Insert` / `Update` types BEFORE writing `.insert()` / `.update()` / `.select()`.
- Check `Relationships[]` before any `.select(", table()")` join.
- No `as any`, no `// @ts-ignore`, no `?.` on required fields.
- After any code change: `rm -rf .next && pnpm build`. One error → one fix → one build.
- Supabase `AuthError` has `.message: string` and `.status: number` only — no `.code`.

## Client/Server Separation (blocker)

- Never import `next/headers`, `server-only`, `@supabase/ssr` server clients, `fs`, Prisma, Stripe secrets into client code.
- Server-only code lives in `app/api/**` route handlers or `"use server"` actions.
- Client code uses only `NEXT_PUBLIC_*` envs or data from server actions / API routes.

**Directive rules (Next.js 16 strict — DO NOT CONFUSE THESE TWO):**
- **`"use server"`** at the top of a file = the file IS a Server Actions module. **Every export MUST be an async function** that can be called via client→server RPC. Types, interfaces, classes, constants, or sync functions in a `"use server"` file → BUILD ERROR `"A 'use server' file can only export async functions, found object"`. Move them to a sibling `*-types.ts` file.
- **`import "server-only"`** at the top of a file = the file is server-only. Importing it from client code throws at build time. Exports can be ANYTHING (types, classes, consts, sync, async). Use this for internal server-only library code (`lib/*`).
- **Default test:** Does a client component call this function directly as RPC? Yes → `"use server"`. No → `import "server-only"`.
- Conflating the two (using `"use server"` for any "server-only" file) was the root cause of repeated Vercel build failures in 2026-05. Audit fix: commit `77ab723` swapped 27 `lib/*` files from wrong `"use server"` to correct `import "server-only"`.
- **CI/local verification**: `tsc --noEmit` does NOT catch `"use server"` violations. Always run `pnpm build` before claiming green.

## Other binding rules

- Real functionality only — no mocks, dummies, simulations, pretend success.
- Every form: server + client validation + tooltip.
- Every external call: timeout, retry, fallback. Never suppress errors.
- Never install/modify deps without research + isolated test + explicit user confirmation.
- Insurance types re-exported from central barrel (e.g. `types/insurance/index.ts`); never import from individual files.
- Use `const` assertions + `satisfies` for string literal types.
- Audit-ready: secure, traceable, regulator-friendly; ISO 20022 message formats where financial.
- All new tokenization features support XRPL + Solana + Hedera at minimum (or state explicitly which are missing).
- When fixing errors, refer to root folder `How-I-fixed-errors/fixed-errors`.

## Rule 17 — AI Code Integrity & Zero-Placeholder Rule (Non-Negotiable)

This rule exists because AI assistants (Claude, v0, Grok, etc.) have repeatedly introduced placeholders, stubs, incomplete implementations, and band-aid fixes wrapped in confident-sounding comments, then shipped them as "production-ready." Origin incident: `ghost-lock/index.ts` shipped `isAuthenticated: false` hardcoded with a comment claiming it was a "soft adjustment, not a hard gate" — it caused a full admin lockout (HTTP 444) and was papered over with two URL-prefix bypass hacks before the root cause was fixed 9 days later.

From this moment forward, the following is strictly forbidden:

**1. Zero placeholders, stubs, or TODOs.** Never generate, accept, or ship code containing `// real verification goes here`, `// TODO: implement later`, `const isAuthenticated = true; // real verification goes here`, or any comment that admits the code is incomplete.

**2. Root-cause fix only — no band-aids.** When a bug is identified, the fix must address the actual root cause (e.g., a hardcoded `isAuthenticated: false`). Never paper over it with bypasses, env gates, or admin pre-checks unless the root cause is also fixed in the same change.

**3. Fresh source code verification mandatory.** Before suggesting any code change: use tools to read the actual live files from the repo. Never write changes based on conversation-history summaries or previous outputs. Explicitly state: *"I have read the current files X, Y, Z via tool call before writing this."*

**4. Real functionality only.** Every line must be complete, production-grade, fully functional. If a feature (JWT verification, ghost rewrite, auth counter, etc.) is not fully implemented, state clearly: *"This module does NOT currently have real [feature]. It only has [describe current state]. Real implementation is missing because [exact reason]."*

**5. Confident tone is not proof.** Any authoritative-sounding comment does not override the need for verification. "This should work" or "industry standard" is never acceptable without proof (build passes, E2E test passes, real test case succeeds).

**6. Mandatory self-disclosure.** If I (the AI assistant) ever propose code based on a summary instead of fresh file reads, I must immediately admit it and roll back the suggestion.

**Enforcement:** Any violation is a critical production blocker. The code change must be rejected and the correct root-cause fix provided before proceeding.

## Active task context

The user's current focus on this repo is **honest audit and real tokenization implementation for all modules**. When invoked for a tokenization audit, begin response with: *"Prime Directive updated. Beginning honest audit and real tokenization implementation."*

---

## Amendment A — Truth Gate

The single named truth gate is `pnpm build`. `tsc --noEmit` is a useful pre-check but is NEVER a substitute. No "verified" claim may be made without:

  1. Showing the last 5 lines of `pnpm build` output, including either `✓ Compiled successfully` or the exact error.
  2. If the build cannot be run in the current environment (parallel agents, time constraints, missing creds), the assistant MUST state literally: "Build not verified — [reason]." No tsc stand-in.

## Amendment B — Task Sizing

Tasks are classified before work begins:

  - TRIVIAL (1–20 LOC, no schema, no new deps, no auth/payment paths): Skip Section 1 ceremony. Single plan line + diff + build output.
  - STANDARD (single module, no cross-module impact): Light ceremony — plan, output, build, one self-verify pass.
  - SECTION (multi-section feature build, schema changes, new chain integration): Full Section 1 interactive → Proceed → autonomous flow.

The assistant declares the classification at Step 0. User may upgrade.

## Amendment C — Honesty Phrases

Rule 1's forbidden-phrase list applies to claims of completeness ("close enough" as a verification verdict). It does NOT apply to honest scoping statements ("this fix ships the security hole closed; the broader refactor is tracked separately"). Honest scoping is required, not banned.

## Amendment D — E2E with Real Flows

Real mainnet E2E requires funded wallets, live API creds, and human oversight for ≥$100k mints. When those aren't available, the assistant MUST:

  1. Run the E2E spec against devnet/testnet with the real SDKs.
  2. State literally: "Mainnet E2E not run — [missing creds list]. Devnet E2E: [pass/fail with tx hash]."

Devnet-with-real-SDKs is not a mock. Claiming mainnet pass without running mainnet is a Rule 14 violation.

## Amendment E — Version Pinning

When the user says "use the Prime Directive," the assistant cites the version it's applying ("Applying v9 from memory") in the first line of the response. If the user references a different version in chat without updating memory, the assistant asks which is canonical before proceeding.

## Amendment F — Parallel Agents

When the user requests parallel agents, the "one error → one fix → one build" rule applies to the merged result, not to each agent. Each agent's work is unverified until merged and the merged tree passes `pnpm build`. Agents must not claim "✅ verified" individually.

## Amendment G — Verify-Before-Flagging (Confirm Against Source)

**Never call something a flaw, bug, vulnerability, or defect until you have read
the actual artifact — code, schema, config, or data — not a summary, description,
or prose account of it.**

A description of how something behaves is NOT evidence of how it behaves. Summaries
can be misleading, stale, or wrong. The source is the only authority.

**Mandatory sequence before asserting a defect:**
1. Read the actual code/schema/data that would contain the flaw.
2. If you cannot access the source, you MUST NOT escalate the concern to a stated
   finding. You may raise it ONLY as an explicitly-labeled "unverified hypothesis —
   needs source confirmation," and the next action must be to confirm against the
   source, not to act on the hypothesis.
3. Only after reading the source and confirming the flaw exists may you call it a
   flaw, write a fix, or direct remediation.

**Forbidden:** generating a fix prompt, a remediation plan, or a "confirmed issue"
based on a description when the source has not been read. If you catch yourself
writing "this is a real problem" / "you caught a real inconsistency" / "this is a
defect" while also noting you haven't seen the code — STOP. The caveat overrides the
conclusion. Do not let an unverified maybe harden into a stated finding.

**This applies to your own claims with the same force as claims about others' work.**
Hold your own assertions of "broken" to the same prove-don't-assume bar (v9 §7) you
apply to any agent's output. When validating another agent's work, distinguish
"the summary describes X" from "the code does X" — verify the latter before flagging.

**Testable:** a reader can check whether the source was actually read (a quote of the
specific lines, a query against the live schema, etc.) before any flaw was asserted.
Asserting a defect without source confirmation is a breach of this rule.

---

## Hedera SDK Correction (added v8)

The Hedera wallet integration library is `@hashgraph/hedera-wallet-connect` (used together with `@hashgraph/sdk` and `@walletconnect/universal-provider`, or Reown AppKit). The legacy `hashconnect` npm package is **deprecated and scheduled for shutdown by 2026** — its own maintainers direct integrators to upgrade to `@hashgraph/hedera-wallet-connect`. Any rule, comment, or instruction in this repo that names `hashconnect` as the canonical lib is stale and must be updated on contact. New code must not add `hashconnect` as a dependency.

Reference: `https://github.com/hashgraph/hedera-wallet-connect`, `https://docs.hashpack.app/dapp-developers/walletconnect`.

---

## Triage-Tiered Ensemble (TTE) — Multi-Agent Error Correction Protocol (added v9)

### When to invoke TTE

Invoke TTE when a single task involves correcting a large heterogeneous backlog — many findings, varying severity, varying solution-space size. Typical triggers:

- Supabase advisor backlog with mixed severity and category
- Type-debt sweeps mixing security-relevant and cosmetic cases
- Migration cleanups touching many tables
- Multi-chain feature parity work

Do NOT invoke TTE for:

- Single determined fixes (use Amendment B "TRIVIAL" classification)
- Single-module feature builds (use standard SECTION workflow)
- Anything where one correct answer exists — voting overhead dilutes, not improves

### The three tiers

Before any work begins, every finding in the backlog is classified into one tier:

**TIER A — Determined answer (N=1, no vote)**
The fix is known. Multiple agents would produce phrasings of the same answer.
Examples: data leak patches, version upgrades, OTP expiry config, single-line settings.
Protocol: One agent reads the finding, applies the standard fix, runs the merge gate, ships.

**TIER B — Bounded solution space (N=3 blind vote per finding)**
2–4 reasonable industry-standard fixes exist. Voting produces real signal.
Examples: SECURITY DEFINER view remediation, RLS policy rewrites, single-finding schema choices.
Protocol: 3 agents independently propose a fix WITHOUT seeing each other's work. Submit candidates. Vote. Apply winner.

**TIER C — Strategy debate, then bulk execution (N≥3 debate → N=1 execute)**
Broad solution space, but the chosen strategy applies to many findings.
Examples: function search_path hardening across 98 funcs, RLS initplan rewrites across 409 policies, index cleanup strategy.
Protocol: 3+ agents propose a TEMPLATE/STRATEGY. They see each other's proposals and get ONE revision round. Vote on strategy. One agent applies the winning template to all affected rows.

### Voting criteria (apply in order, with veto)

**Criterion 0 — VETO (binary, applied first)**
Does this candidate leave the root cause in place? If yes, ELIMINATE regardless of other scores. This is Rule 17 §2 enforced at vote time. Examples of root-cause failure: adding a WHERE clause to a view that should not exist; guarding a SECURITY DEFINER function whose privileges should not be elevated; replacing always-true RLS with a still-overly-permissive policy.

**Criterion 1 — Industry standard alignment (0–3 points)**
- 3 = matches official vendor / platform recommended pattern verbatim
- 2 = matches the pattern with a documented deviation
- 1 = non-standard but defensible
- 0 = bespoke / unprecedented

**Criterion 2 — Impact on working code (0–3 points)**
- 3 = no callers affected, only the flagged object changes
- 2 = ≤3 callers affected, all non-critical paths
- 1 = 4–10 callers affected
- 0 = >10 callers OR affects a critical path

*For performance work, reweight Criterion 2 to impact on query plans:*
- 3 = no plan change on sampled queries
- 2 = plan change only on rarely-hit queries
- 1 = plan change on hot queries but EXPLAIN shows no cost regression
- 0 = cost regression on any hot query

**Criterion 3 — Operational complexity in production (0–3 points)**
- 3 = fewer moving pieces post-fix than pre-fix
- 2 = same number of moving pieces
- 1 = one additional moving piece
- 0 = two or more additional moving pieces

**Maximum score: 9. Ties broken by smallest blast radius (lowest Criterion 2 denominator).**

### Candidate submission format (every agent, every candidate)

Every candidate must include:

The file-reads manifest is mandatory. Per Rule 17 §3, no candidate may be written from a summary; the manifest is how the coordinator spot-checks compliance.

### Voting protocol

For Tier B: **blind voting.** Each agent submits its candidate AND scores all candidates before seeing other agents' votes. Then reveal simultaneously. This prevents anchoring on whoever submitted first.

For Tier C: **debate-then-vote.** Agents see each other's strategies and get one revision round to argue for their own or change their mind. Then vote.

### Merge gate (Amendment A + F applied to TTE)

After every winning candidate is applied:

1. Apply the candidate (migration via vendor MCP, or code edit).
2. Regenerate generated types if schema changed.
3. `rm -rf .next && pnpm build`
4. Paste last 5 lines of build output.
5. If pass: commit with a structured message (`fix(category): [finding_id] — [summary]`) and push.
6. If fail: revert, feed the agent the exact error, regenerate. One error, one fix, one build.

For performance work (Tier C strategy execution), the build gate is NOT sufficient. Add a **plan-regression gate**:

1. Pick 5 hot queries (vendor logs, or `pg_stat_user_functions` top-5).
2. `EXPLAIN ANALYZE` each one BEFORE the change. Capture cost.
3. Apply the change.
4. `EXPLAIN ANALYZE` each one AFTER. Compare cost.
5. If any query's cost rose by >20%, REVERT and re-vote.
6. Paste before/after costs in the commit message.

### Regression test requirement

For any finding that touches security surface (RLS, auth, views, permissions), a regression test is mandatory before commit. The test creates two users (or two roles), authenticates as one, attempts the action the finding was about, and asserts the response does NOT leak the other user's data.

Per Amendment D, if the test cannot be run in the current environment, state literally: *"Test not run — [reason]."* No silent skip.

### Session structure for TTE work

Large TTE backlogs split into **multiple sessions**, not one mega-session. The standard split:

- **Session 1 — Security tier.** Highest-risk findings, full ensemble protocol. Postgres upgrade or other DB-locking operations run LAST.
- **Session 2 — Performance tier.** Plan-regression gate replaces build gate as primary verification.
- **Session 3 — Grind work.** Type debt, placeholder cleanup, deferred items. N=1 sequential. No voting.

Between sessions, the user reviews the merged result and confirms nothing broke before the next session starts. Skipping the checkpoint is theatrical compliance.

### Conflict resolution within TTE

If two agents touch the same file in parallel work: the later agent rebases on the earlier agent's merged result and re-reads the file fresh. Merge conflicts are never resolved by blindly combining diffs. Per Rule 17 §2: root-cause fix only.

If a vendor's recommended fix conflicts with this directive: industry standard wins, document the deviation in the candidate's notes. The directive bends to verified industry practice; verified industry practice does not bend to the directive.

### Anti-patterns (TTE failure modes to avoid)

- **N=10 on a determined fix.** Wastes tokens, produces 10 phrasings of the same answer. Use Tier A.
- **N=1 on a real architecture decision.** Skips the deliberation that would have surfaced tradeoffs. Use Tier C.
- **Skipping Criterion 0.** "Smallest diff wins" without the root-cause veto is exactly how `ghost-lock/index.ts` shipped. The veto is non-negotiable.
- **Per-agent "verified" claims.** Agents do not verify themselves; the merge gate verifies the merged tree. Amendment F.
- **Treating "advisor cleared" as the only signal.** Advisors cannot see plan regressions, data leaks via join paths, or behavioral regressions. Regression tests are not optional for security findings.

### When to deviate from TTE

TTE is the standard protocol for multi-finding backlogs. Deviate when:

- The backlog is small enough (< 5 findings) that triage overhead exceeds execution time → use sequential N=1.
- The findings are uniform enough that a single template covers all → skip tier B/C voting, go straight to one-template-applies-to-all.
- An emergency leak requires immediate patching → patch first under Tier A discipline, run TTE on the rest of the backlog afterward.

In all deviation cases, document the choice in the session opener.

---

## Rule 18 — AGENTS.md Navigation Rule (Non-Negotiable) — added 2026-07-11

> Sourced from the operator's Prime Directive memory (added after the 2026-06-08 `.cursorrules` snapshot). This rule is core to how the Hermes repo operates and is retained here.

The `AGENTS.md` ("agent.m") system is a **two-way index: READ it to LOCATE, WRITE it to FILE.** It is not optional and it is not just a changelog.

**1. LOCATE FILES VIA AGENTS.md — FIRST, ALWAYS.** Before any grep / find / glob / Explore-subagent sweep: open the `AGENTS.md` for the folder being worked in (and the root `AGENTS.md` to find which folder that is). Each `AGENTS.md` lists every file in its folder and what that file does. Blind searching when a map exists is a Rule 1 (Zero Laziness) violation.

**2. UPDATE AGENTS.md WITH EVERY FILE CHANGE.** Any file added, removed, renamed, or materially changed ⇒ update that folder's `AGENTS.md` in the same change, before declaring the work done. A section is NOT complete while its map is stale. State explicitly which `AGENTS.md` files were updated.

**3. NEVER GUESS ANYTHING — ALWAYS VERIFY.** No assumed API shapes, field names, function signatures, env values, schemas, or account state. Every one is confirmed against the real source before use. If it cannot be verified, say so plainly and STOP.

**Enforcement:** Same as Rule 17 — a violation is a critical blocker.

## Amendment H — Phase Honesty & AGENTS.md-before-access — added 2026-06-09/06-19

> Sourced from the operator's Prime Directive memory (added after the 2026-06-08 `.cursorrules` snapshot).

- Every build-touching response must declare its phase at the top (PLANNER / SPEC / ANALYSIS / CODER MODE / PROBE). Forbidden from implying work was implemented unless real code/artifact was produced in that same response. When a build cannot run on the current surface, declare that plainly rather than implying progress.
- Whenever you access files and folders, consult `AGENTS.md` first — check for an `AGENTS.md` in scope (the directory being accessed and its ancestors up to the repo root) and follow its instructions. If no `AGENTS.md` exists in scope, proceed normally. Applies to all tooling.

## Rule 19 — PRODUCTION STATE IS NEVER AUTHORITATIVE IN A DOCUMENT — added 2026-08-19

> Added repo-locally after the defect below fired TWICE IN TWO DAYS, both times
> causing an agent to tell the operator something false about his own live
> system. Same append precedent as Rule 18 / Amendment H.

**No document in this repository — this one included — is authoritative about
what is currently deployed, running, configured, or live.** Not `AGENTS.md`,
not a roadmap, not a readiness report, not a spec, not a document written
yesterday, not one you wrote yourself an hour ago.

**THE HIERARCHY, IN ORDER:**

    the running system  >  ./scripts/production_state.sh  >  any document  >  memory

A document is a dated snapshot of somebody's belief. It cannot know when it
went stale. The probe always can.

**THE RULE.** Before asserting anything about production state — deployed or
not, which topology, which container, which revision, whether a line is live —
run `./scripts/production_state.sh` and quote its output. Run it to TEST the
document, never to confirm it. When the two disagree, **the document is wrong**.
A claim about production that does not carry the command that produced it is a
Rule 0 violation, not a summary.

**THE TWO INCIDENTS THIS ENCODES:**

1. **2026-08-18** — root `AGENTS.md` called the merged topology "the live
   reality" in three places while production had been SPLIT since 2026-08-16
   22:14 UTC. Under Rule 18 that file is the navigation system, so every agent
   working that night inherited a false model of production.
2. **2026-08-19** — `docs/DEPLOYMENT_READINESS_2026-08-18.md` opens "Read-only
   production verification. Nothing was deployed…". That sentence describes
   **what that audit did** — its own restraint. It was read as **what the
   system's state is**, and an agent told the operator Donna was undeployed
   while she was live and taking calls. The file that superseded it sat
   alphabetically adjacent in the same directory. The disproof was in hand
   three separate times — a git log, a live `/health`, an open ssh session —
   and none of it was used.

Neither was a knowledge gap. Both were a document beating a probe that was
never run. **Nothing in this file is exempt from this rule, including this
file.**

**Enforcement:** `backend/tests/test_doc_state_discipline.py` fails the build
when a state-asserting document does not name the probe, when a dated snapshot
lacks its header, when readable prose precedes that header, or when the probe
itself stops being read-only or fail-closed. There are NO per-file exemptions —
a blanket exemption is how the missing entry stays silent.

## Rule 20 — NEVER RUN A WEAK CHECK; CALIBRATE BEFORE YOU CONCLUDE — added 2026-08-19

> Operator instruction, verbatim: **"never never never run a weak check again
> when you're working with me."** Added repo-locally under the same precedent as
> Rules 18/19. Mirrored in the `prime-directive-build` skill as RULE 0.3.

**A check that finds nothing has told you nothing.** An empty result is evidence
the METHOD did not match — never evidence the thing is absent. Reporting a null
result as a finding is how "I verified it" becomes a false statement while
looking like diligence.

**THE RULE.** A negative result is not a finding until the method is proven
capable of producing a positive. Before writing *absent / missing / not there /
not used / unchanged*, run the IDENTICAL check against something KNOWN to be
present — a positive control. If the control returns empty, the instrument is
broken and the negative means nothing.

**NEVER SAID WITHOUT THE RUN THAT SHOWS IT:**

1. *absent / missing / not present* — requires a positive control.
2. Any claim about live system state — requires the command and its output, in
   the same message (see Rule 19: the running system outranks every document).
3. *green / clean / passing / done / unchanged* — requires the actual run, made
   after the last edit, not the one before it.

When a check cannot be calibrated the honest output is **UNKNOWN**, never a
conclusion. UNKNOWN costs a follow-up; a false negative costs whatever decision
was made on it — and the operator cannot tell the two apart from the outside,
which is precisely why this is not optional.

**Grep discipline.** Search CONTENT before concluding from FILENAMES — a
subsystem is rarely named after itself (Hermes "Bot Mode" ships as `bot_id`
across 14 files and is built on the `profile` primitive, so no file is named
"bot"; a filename search found nothing and was reported as absence). Exclude
vendored trees (`.venv`, `node_modules`) or signal drowns in noise. Print match
counts for a known-present term in the same run so the reader can see the
calibration.

**Enforcement:** `backend/tests/test_doc_state_discipline.py` pins that this
rule exists and names the positive-control requirement.

---

## Rule 21 — A SUCCESSFUL COMMAND IS NOT EVIDENCE THAT ITS ARTIFACT CHANGED

Operator instruction, 2026-08-21, after a documentation script exited 0, printed
nothing useful, and wrote NOTHING — while the assistant reported the
documentation as written. The script had died on a `next()` lookup for a table
row that did not exist; the failure scrolled past above a passing test suite in
the same output, and only the tail was read.

**THE RULE.** Exit status proves a process ended. It does not prove the intended
state exists. For anything that WRITES — documentation, migrations, generated
registries, config rewrites, codegen, backfills, seeded tables — **verify the
POSTCONDITION explicitly, and verify it by reading the artifact, not by trusting
the writer.**

  * Assert AFTER writing, in the same script: re-read the file and confirm the
    content is present. A write followed by no check is a claim, not a change.
  * `git status` / a diff is the cheapest postcondition for a file edit — an
    empty diff after a "successful" edit script is the whole finding.
  * Read the HEAD of mixed or backgrounded output as well as the tail. A
    traceback from step one hides comfortably above a green result from step two.
  * For DB writes, ask the CATALOG, never the ledger (Rule 19): a migration file
    that ran is not a table that exists.

This is Rule 20's twin. Rule 20 bans concluding from a check that could not have
found anything; Rule 21 bans concluding from a command that could not have shown
anything. Both failures look identical from the outside — a confident report —
and both are only visible to the person who ran the command and chose not to
look at what it said.

**Enforcement:** `backend/tests/test_doc_state_discipline.py` pins that this
rule exists and names the postcondition requirement.
