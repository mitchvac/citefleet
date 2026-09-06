import { createFileRoute } from "@tanstack/react-router";

// BotCentral → CiteFleet. Signed with the shared service token (or
// BOTCENTRAL_WEBHOOK_SECRET when both sides set one); see
// src/lib/citefleet/webhook.ts `handleBotcentralWebhook`. Configured on
// BotCentral as BOTCENTRAL_PUBLISHER_WEBHOOK=https://citefleet.app/api/hooks/botcentral.
export const Route = createFileRoute("/api/hooks/botcentral")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, hint: "BotCentral posts site.listed / site.reverified / site.lapsed / site.unpublished here, signed with x-botcentral-signature." },
          { status: 405 },
        ),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleBotcentralWebhook, applyCatalogState, getStore } = await import("@/lib/citefleet/ops.server");
        const { mutateStore } = await import("@/lib/citefleet/store");
        const result = await handleBotcentralWebhook(
          { rawBody, header: (name) => request.headers.get(name) },
          {
            getStore,
            mutateStore,
            apply: applyCatalogState,
            catalogUrl: process.env.BOTCENTRAL_URL || "https://botcentral.org",
          },
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
