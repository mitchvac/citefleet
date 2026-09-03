# CiteFleet operator runbook

Everything the single operator does day to day. Customer-facing steps are in
[customer-setup.md](customer-setup.md); server setup is in
[../deploy/DEPLOY-VPS.md](../deploy/DEPLOY-VPS.md); the repo map is
[../AGENTS.md](../AGENTS.md).

## Sign in

The console (every page that shows workspace data, and every action) is behind
a session. Accounts are **invite-only**: only emails listed in
`CITEFLEET_OPERATOR_EMAILS` (on the VPS: `/root/citefleet-operator.emails`,
comma-separated on a single line) can sign up or sign in, by email/password,
Google, or GitHub; the provider email must be verified.
Any other email is refused, and an empty list refuses everyone.

- `https://citefleet.app/login`: email/password (create the account once),
  **Continue with Google**, or **Continue with GitHub**.
- Google: the OAuth client's authorized redirect URI must be
  `https://citefleet.app/api/oauth/google-callback`; while the consent screen
  is in Testing, the account must also be a listed test user. Credentials live
  in `/root/citefleet-google.oauth` (line 1 client id, line 2 secret); GitHub
  likewise in `/root/citefleet-github.oauth`.
- Ops fallback: the server token in `/root/citefleet-operator.token` still
  signs in through the same form (paste it in the token field).
- The cookie holds a random session id. Sessions live in memory: a container
  restart or redeploy signs everyone out. Five wrong attempts from one address
  (token or password) lock that address out for 60 seconds.
- Public without sign-in: `/health`, `/llms.txt`, `/sitemap.xml`, the
  Training pages, `/login`, and the two hook endpoints.

Local development:

```bash
CITEFLEET_OPERATOR_TOKEN=$(openssl rand -hex 32) CITEFLEET_OPERATOR_EMAILS=you@example.com npm run dev
```

## Deploy a change

```bash
ssh root@144.91.66.158
bash /opt/citefleet/deploy/deploy-vps.sh
curl -s https://citefleet.app/health
```

The script pulls `main`, rebuilds only the `citefleet` container, and leaves
every other site on the box alone. It re-executes itself from a private copy so
a change to the script itself takes effect on the same run.

## Get a customer listed

The Training module (lesson 02) is the click-by-click version. In short:

1. **Command → Onboard a property**: name, `https://` origin, GitHub owner
   and repo. Every customer is just an origin URL; nothing about a customer
   lives in code.
2. **Live audit** on the card.
3. **Campaign**: attach the website repo (folder is the web root, e.g.
   `public` or `frontend/public`), **Push origin files** if you have a GitHub
   PAT saved, and have the customer deploy. Or the customer adds one DNS TXT
   record instead (see customer-setup.md).
4. **Verify proof** (Automatic listing panel). CiteFleet applies BotCentral's
   own rules: `/.well-known/botcentral.txt` must be plain text with
   `botcentral-verify=citefleet-app`, else an apex DNS TXT record with that
   line. If it fails you get the exact line to add and nothing is sent.
5. **List on BotCentral**. The card is written only after BotCentral confirms
   the same proof. The Command card then shows **Listed on BotCentral** with
   the inspector link; the machine card is `https://botcentral.org/v1/site/<domain>`.
6. Optional: **Generate webhook secret** and give the customer the payload URL
   and secret. Every deploy then re-checks the proof and refreshes the card
   without anyone clicking. Any non-GitHub CI can call the deploy hook instead.

## Confirm a BotCentral API-key top-up

BotCentral's **Top up** buttons send developers to `https://citefleet.app/topup`
with their `bc_live_` key prefix; **Top up** in the console nav opens the same
page with an empty form. There is no on-chain checkout yet: BotCentral
has no treasury address bound, so the customer opens an invoice (a real
BotCentral `bj_…` id with the quoted amount) and pays out of band.

1. Take the payment and verify it yourself (explorer, exchange receipt, or
   invoice reference). Nothing on the page checks a chain.
2. Open the invoice link the customer sends (`/topup?prefix=…&job=bj_…`), sign
   in if asked, paste the transaction hash or receipt reference into
   **Operator: transaction hash or receipt reference**, and click
   **Confirm payment received**.
3. The page shows **Payment confirmed**; BotCentral credits that many jobs to
   the prefix (`https://botcentral.org/keys` on the customer's account shows
   Active with the credit). The Audit log records `Settled BotCentral invoice …`.

Refused when the **spend** door (or the global kill switch) is on in Monitor,
when you are signed out, or when `BOTCENTRAL_SERVICE_TOKEN` is missing.

## What the errors mean

| Message | Cause | Do |
| --- | --- | --- |
| `Proof not live yet — …` | The origin does not serve the proof line (or serves an HTML shell) and there is no DNS record. | Add the file or the TXT record, then Verify proof. |
| `ownership not proven` (from BotCentral) | Pre-flight passed but the registry's own fetch failed (propagation, redirect, host-specific). | Wait a minute and retry; check the file from another network. |
| `Unauthorized: sign-in required` | Session expired or container restarted. | Sign in again. |
| `Unauthorized: operator token not configured` | `CITEFLEET_OPERATOR_TOKEN` missing in `.env`. | Rerun the deploy script; it mints and injects it. |
| Hook answers `401` | Wrong secret, unknown repository/domain, or tampered body — all look the same on purpose. | Rotate the secret and update the repository webhook. |
| Hook answers `202 duplicate` / `in-progress` | GitHub redelivered an id, or a check from a moment ago is still running. | Nothing; the running check picks up the deploy. |
| `BotCentral publish blocked` on the task | The catalog refused or the kill switch is on. | Read the evidence line; thaw on Monitor if frozen. |

## Cleanup

- **Remove property** on a campaign header drops the site, its tasks, and its
  monitor snapshot. The audit log keeps history; the BotCentral card is not
  touched.
- Onboarding never dedupes by domain: two onboards of the same origin make two
  properties. Remove the extra one.

## Tests

```bash
npm test                                   # Node 22; scripts/ and src/ suites
npx tsc --noEmit && npx eslint .
E2E_OPERATOR_TOKEN=<token> E2E_CHANNEL=chrome npx playwright test tests/e2e/list-a-site.spec.ts --headed   # or E2E_USER_EMAIL + E2E_USER_PASSWORD (allow-listed)
```

The e2e signs in once (global setup) and walks the Training order for one
customer origin (env `E2E_SITE_NAME`, `E2E_SITE_URL`, `E2E_GH_OWNER`,
`E2E_GH_REPO`, `E2E_GH_ROOT`; defaults are the current customer under test).
Its last test removes the property it created. `E2E_HEADLESS=1` for
unattended runs; `E2E_URL=http://localhost:8080` for a local dev server.
