import { createFileRoute } from "@tanstack/react-router";
import { getStore } from "@/lib/citefleet/store";
import { billingEnabled, publisherReady } from "@/lib/citefleet/botcentral";
import { BOTCENTRAL_HOOK_PATH, MIN_HOOK_SECRET, botcentralHookSecret } from "@/lib/citefleet/webhook";
import { dbConfigured } from "@/lib/db";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const store = await getStore();
        const publisher = publisherReady();
        const listed = store.sites.filter((s) => s.botcentral?.listed).length;
        return Response.json({
          ok: true,
          service: "citefleet",
          time: new Date().toISOString(),
          sites: store.sites.length,
          listed,
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
