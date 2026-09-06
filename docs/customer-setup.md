# Get your site listed on BotCentral through CiteFleet

CiteFleet publishes a BotCentral card for your site. BotCentral only accepts the
card after it has proven you control the domain. You prove it once; after that,
an optional webhook keeps the card fresh with every deploy.

## 1. Prove control (required, pick one)

**A. Serve a plain-text file** at

```
https://<your-domain>/.well-known/botcentral.txt
```

containing this line:

```
botcentral-verify=citefleet-app
```

Rules BotCentral applies: HTTP 200, not HTML (a single-page-app shell that answers
every URL does not count), and the line present. If you attached your GitHub repo
in CiteFleet, **Push origin files** commits this file for you; deploy the site
and it is live.

**B. Add a DNS TXT record** on the apex of your domain with the same value:

```
<your-domain>   TXT   botcentral-verify=citefleet-app
```

No deploy needed. Either route is enough.

Then on your CiteFleet campaign click **Verify proof**. If it fails, the message
names exactly which of the two is missing.

## 2. Optional: automate with a GitHub webhook

With the webhook, every deploy re-checks the proof and refreshes your card
automatically.

1. On the campaign page under **Automatic listing**, click **Generate webhook
   secret**. Copy the Payload URL and the secret.
   The secret is shown once and never again; copy it before you leave the page.
   Rotate creates a new one and retires the old one immediately.
2. In your repository: **Settings → Webhooks → Add webhook**.
   - Payload URL: the one shown (`https://citefleet.app/api/hooks/github`)
   - Content type: `application/json`
   - Secret: the one shown
   - Events: `push` and, if your host reports deployments to GitHub (Vercel,
     Netlify and similar do), `deployment_status`
3. GitHub sends a ping; CiteFleet answers 200. Under **Last delivery** you will
   see it.

What CiteFleet does with a delivery:

- verifies the `X-Hub-Signature-256` signature with your secret (an unknown
  repository and a bad signature both get 401);
- acts only on a push to the attached branch or a successful
  `deployment_status`; everything else is acknowledged and ignored;
- re-checks the proof for a few minutes while your deploy lands, then lists or
  refreshes the card;
- answers a redelivered id without re-running the check, and runs one check per
  property at a time;
- writes every delivery and outcome to the Audit log.

Rotate the secret from the same panel at any time; the old one stops working
immediately.

### Not on GitHub? Any CI or host can call the deploy hook

After a successful deploy, send one signed request with the same secret:

```
POST https://citefleet.app/api/hooks/deployed
Content-Type: application/json
X-CiteFleet-Signature: sha256=<HMAC-SHA256 of the raw body, key = your secret>

{"domain": "<your-domain>"}
```

CiteFleet answers 202 and does exactly what it does for a GitHub push.

## 3. If you do not use GitHub or cannot add webhooks

Nothing else is required. Use the DNS record (or the file), then ask the
operator to click Verify proof (or List on BotCentral) on your campaign. With
autopilot on in the open console, CiteFleet re-checks unlisted properties
every few minutes as well.

## 4. The listing year (what it costs)

BotCentral bills the way a domain registry does: **$10.00 per host per year**,
debited from your own BotCentral API key when your proven card is written.
Editing your card inside the year is free, reads of the catalog are always
free, and a failed proof costs nothing. A listing nobody renews lapses: it
stays in the catalog but stops counting as proven until it is renewed.

1. Create an API key at `https://botcentral.org/keys` and give the operator its
   prefix (`bc_live_…`). It is not a secret — it is what the top-up links carry.
2. Add credit at `https://citefleet.app/topup?prefix=<your prefix>&product=botcentral`.
   A year needs $10.00 on the key.
3. The operator lists your site. The first proven publish buys the year; the
   campaign page then shows when it ends.
4. About 30 days before the year ends you will hear from the operator; renewal
   is another top-up and a republish, and the new year starts that day.
