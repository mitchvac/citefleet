import { createFileRoute } from "@tanstack/react-router";
import { billingEnabled, publisherReady } from "@/lib/citefleet/botcentral";
import { BOTCENTRAL_HOOK_PATH, MIN_HOOK_SECRET, botcentralHookSecret } from "@/lib/citefleet/webhook";
import { dbConfigured } from "@/lib/db";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const publisher = publisherReady();
        // `sites` and `listed` used to be reported here, read from the one
        // global workspace. With a workspace per customer those numbers are a
        // cross-tenant aggregate on an UNAUTHENTICATED route — it would tell
        // anyone how many properties every customer has. /health answers
        // whether the service is up, which needs no tenant at all.
        return Response.json({
          ok: true,
          service: "citefleet",
          time: new Date().toISOString(),
          publisher,
          db: dbConfigured ? "postgres" : "unconfigured",
          // Listing-year billing: whether publishes carry the customer's key,
          // and whether BotCentral's signed events can be verified here.
          billing: billingEnabled() ? "on" : "off",
          catalogHook: BOTCENTRAL_HOOK_PATH,
          catalogHookSecret: botcentralHookSecret().length >= MIN_HOOK_SECRET,
        });
      },
    },
  },
});
