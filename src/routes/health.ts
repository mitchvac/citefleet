import { createFileRoute } from "@tanstack/react-router";
import { billingEnabled, publisherReady } from "@/lib/citefleet/botcentral";
import {
  BOTCENTRAL_HOOK_PATH,
  MIN_HOOK_SECRET,
  botcentralHookSecret,
} from "@/lib/citefleet/webhook";
import { ENTRI_HOOK_PATH } from "@/lib/citefleet/entri-webhook";
import { dnsSetupSettings } from "@/lib/citefleet/dns-setup.server";
import { cloudflareDnsSettings } from "@/lib/citefleet/cloudflare-dns.server";
import { vercelDnsSettings } from "@/lib/citefleet/vercel-dns.server";
import { dbConfigured } from "@/lib/db";
import { checkDatabase, deploymentRevision } from "@/lib/health";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const publisher = publisherReady();
        const databaseReady = dbConfigured && (await checkDatabase());
        const entri = dnsSetupSettings().state;
        const cloudflare = cloudflareDnsSettings().state;
        const vercel = vercelDnsSettings().state;
        // `sites` and `listed` used to be reported here, read from the one
        // global workspace. With a workspace per customer those numbers are a
        // cross-tenant aggregate on an UNAUTHENTICATED route — it would tell
        // anyone how many properties every customer has. /health answers
        // whether the service is up, which needs no tenant at all.
        return Response.json(
          {
            ok: databaseReady,
            service: "citefleet",
            revision: deploymentRevision(),
            time: new Date().toISOString(),
            publisher,
            db: databaseReady ? "postgres" : dbConfigured ? "unavailable" : "unconfigured",
            // Listing-year billing: whether publishes carry the customer's key,
            // and whether BotCentral's signed events can be verified here.
            billing: billingEnabled() ? "on" : "off",
            catalogHook: BOTCENTRAL_HOOK_PATH,
            catalogHookSecret: botcentralHookSecret().length >= MIN_HOOK_SECRET,
            // Preserve the original scalar for existing monitors; provider-level
            // readiness is additive and contains no customer or credential data.
            dnsSetup: entri,
            dnsProviders: { entri, cloudflare, vercel },
            dnsHook: ENTRI_HOOK_PATH,
          },
          {
            status: databaseReady ? 200 : 503,
            headers: { "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
